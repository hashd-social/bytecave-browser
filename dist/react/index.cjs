"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/react/index.ts
var react_exports = {};
__export(react_exports, {
  HashdAudio: () => HashdAudio,
  HashdContent: () => HashdContent,
  HashdImage: () => HashdImage,
  HashdVideo: () => HashdVideo,
  useHashdBatch: () => useHashdBatch,
  useHashdContent: () => useHashdContent,
  useHashdImage: () => useHashdImage,
  useHashdMedia: () => useHashdMedia
});
module.exports = __toCommonJS(react_exports);

// src/react/hooks.ts
var import_react = require("react");

// src/protocol-handler.ts
function parseHashdUrl(url) {
  if (!url.startsWith("hashd://")) {
    throw new Error(`Invalid hashd:// URL: ${url}`);
  }
  const withoutProtocol = url.slice(8);
  const [cid, queryString] = withoutProtocol.split("?");
  if (!cid || cid.length === 0) {
    throw new Error(`Invalid hashd:// URL: missing CID`);
  }
  const result = {
    protocol: "hashd:",
    cid,
    raw: url
  };
  if (queryString) {
    const params = new URLSearchParams(queryString);
    if (params.has("type")) {
      result.mimeType = params.get("type");
    }
    if (params.has("decrypt")) {
      result.decrypt = params.get("decrypt") === "true";
    }
  }
  return result;
}
var BlobUrlCache = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    this.maxAge = 60 * 60 * 1e3;
  }
  // 1 hour
  set(cid, blobUrl, mimeType) {
    this.cache.set(cid, { blobUrl, mimeType, timestamp: Date.now() });
  }
  get(cid) {
    const entry = this.cache.get(cid);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.revoke(cid);
      return null;
    }
    return { blobUrl: entry.blobUrl, mimeType: entry.mimeType };
  }
  revoke(cid) {
    const entry = this.cache.get(cid);
    if (entry) {
      URL.revokeObjectURL(entry.blobUrl);
      this.cache.delete(cid);
    }
  }
  clear() {
    for (const entry of this.cache.values()) {
      URL.revokeObjectURL(entry.blobUrl);
    }
    this.cache.clear();
  }
  size() {
    return this.cache.size;
  }
};
var blobCache = new BlobUrlCache();
function detectMimeType(data) {
  if (data.length < 4) {
    return "application/octet-stream";
  }
  if (data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) {
    return "image/png";
  }
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) {
    return "image/jpeg";
  }
  if (data[0] === 71 && data[1] === 73 && data[2] === 70) {
    return "image/gif";
  }
  if (data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && data[8] === 87 && data[9] === 69 && data[10] === 66 && data[11] === 80) {
    return "image/webp";
  }
  if (data.length >= 12 && data[4] === 102 && data[5] === 116 && data[6] === 121 && data[7] === 112) {
    return "video/mp4";
  }
  return "application/octet-stream";
}
async function fetchHashdContent(url, client, options) {
  const parsed = typeof url === "string" ? parseHashdUrl(url) : url;
  const cached = blobCache.get(parsed.cid);
  if (cached) {
    console.log(`[HashD] Cache hit for CID: ${parsed.cid.slice(0, 16)}...`);
    return {
      data: new Uint8Array(),
      // Don't return data for cached items
      mimeType: cached.mimeType,
      blobUrl: cached.blobUrl,
      cached: true
    };
  }
  console.log(`[HashD] Fetching CID: ${parsed.cid.slice(0, 16)}...`);
  const result = await client.retrieve(parsed.cid);
  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to retrieve content");
  }
  const mimeType = parsed.mimeType || detectMimeType(result.data);
  const dataCopy = new Uint8Array(result.data);
  const blob = new Blob([dataCopy], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  blobCache.set(parsed.cid, blobUrl, mimeType);
  console.log(`[HashD] Retrieved and cached CID: ${parsed.cid.slice(0, 16)}... (${mimeType})`);
  return {
    data: result.data,
    mimeType,
    blobUrl,
    cached: false
  };
}

// src/react/hooks.ts
function useHashdContent(url, options) {
  const { client, enabled = true, onSuccess, onError } = options;
  const [blobUrl, setBlobUrl] = (0, import_react.useState)(null);
  const [data, setData] = (0, import_react.useState)(null);
  const [mimeType, setMimeType] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [cached, setCached] = (0, import_react.useState)(false);
  const [refetchTrigger, setRefetchTrigger] = (0, import_react.useState)(0);
  const mountedRef = (0, import_react.useRef)(true);
  const abortControllerRef = (0, import_react.useRef)(null);
  const refetch = (0, import_react.useCallback)(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);
  (0, import_react.useEffect)(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  (0, import_react.useEffect)(() => {
    if (!url || !enabled || !client) {
      setBlobUrl(null);
      setData(null);
      setMimeType(null);
      setError(null);
      setCached(false);
      setLoading(false);
      return;
    }
    let parsed;
    try {
      parsed = parseHashdUrl(url);
    } catch (err) {
      setError(err);
      setLoading(false);
      return;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setLoading(true);
    setError(null);
    fetchHashdContent(parsed, client, { signal: abortController.signal }).then((result) => {
      if (!mountedRef.current || abortController.signal.aborted) {
        return;
      }
      setBlobUrl(result.blobUrl);
      setData(result.data);
      setMimeType(result.mimeType);
      setCached(result.cached);
      setLoading(false);
      if (onSuccess) {
        onSuccess(result.blobUrl);
      }
    }).catch((err) => {
      if (!mountedRef.current || abortController.signal.aborted) {
        return;
      }
      const error2 = err instanceof Error ? err : new Error(String(err));
      setError(error2);
      setLoading(false);
      if (onError) {
        onError(error2);
      }
    });
    return () => {
      abortController.abort();
    };
  }, [url, client, enabled, refetchTrigger, onSuccess, onError]);
  return {
    blobUrl,
    data,
    mimeType,
    loading,
    error,
    cached,
    refetch
  };
}
function useHashdImage(url, options) {
  const result = useHashdContent(url, options);
  return {
    ...result,
    src: result.blobUrl || options.placeholder || ""
  };
}
function useHashdMedia(url, options) {
  const result = useHashdContent(url, options);
  return {
    ...result,
    src: result.blobUrl || ""
  };
}
function useHashdBatch(urls, options) {
  const [results, setResults] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [errors, setErrors] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  (0, import_react.useEffect)(() => {
    if (!options.client || !options.enabled) {
      return;
    }
    const validUrls = urls.filter((url) => !!url);
    if (validUrls.length === 0) {
      setResults(/* @__PURE__ */ new Map());
      setErrors(/* @__PURE__ */ new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const newResults = /* @__PURE__ */ new Map();
    const newErrors = /* @__PURE__ */ new Map();
    Promise.all(
      validUrls.map(async (url) => {
        try {
          const parsed = parseHashdUrl(url);
          const result = await fetchHashdContent(parsed, options.client);
          newResults.set(url, {
            blobUrl: result.blobUrl,
            data: result.data,
            mimeType: result.mimeType,
            loading: false,
            error: null,
            cached: result.cached,
            refetch: () => {
            }
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          newErrors.set(url, error);
        }
      })
    ).finally(() => {
      setResults(newResults);
      setErrors(newErrors);
      setLoading(false);
    });
  }, [urls.join(","), options.client, options.enabled]);
  return { results, loading, errors };
}

// src/react/components.tsx
var import_react2 = __toESM(require("react"), 1);
function HashdImage({
  src,
  client,
  placeholder,
  loadingComponent,
  errorComponent,
  onHashdLoad,
  onHashdError,
  ...imgProps
}) {
  const { src: blobUrl, loading, error } = useHashdImage(src, {
    client,
    placeholder,
    onSuccess: onHashdLoad,
    onError: onHashdError
  });
  if (loading && loadingComponent) {
    return /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, loadingComponent);
  }
  if (error && errorComponent) {
    return /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, errorComponent);
  }
  return /* @__PURE__ */ import_react2.default.createElement("img", { ...imgProps, src: blobUrl });
}
function HashdVideo({
  src,
  client,
  loadingComponent,
  errorComponent,
  onHashdLoad,
  onHashdError,
  ...videoProps
}) {
  const { src: blobUrl, loading, error } = useHashdMedia(src, {
    client,
    onSuccess: onHashdLoad,
    onError: onHashdError
  });
  if (loading && loadingComponent) {
    return /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, loadingComponent);
  }
  if (error && errorComponent) {
    return /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, errorComponent);
  }
  return /* @__PURE__ */ import_react2.default.createElement("video", { ...videoProps, src: blobUrl });
}
function HashdAudio({
  src,
  client,
  loadingComponent,
  errorComponent,
  onHashdLoad,
  onHashdError,
  ...audioProps
}) {
  const { src: blobUrl, loading, error } = useHashdMedia(src, {
    client,
    onSuccess: onHashdLoad,
    onError: onHashdError
  });
  if (loading && loadingComponent) {
    return /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, loadingComponent);
  }
  if (error && errorComponent) {
    return /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, errorComponent);
  }
  return /* @__PURE__ */ import_react2.default.createElement("audio", { ...audioProps, src: blobUrl });
}
function HashdContent({ url, client, children }) {
  const { blobUrl, loading, error, mimeType } = useHashdImage(url, { client });
  return /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, children({ blobUrl, loading, error, mimeType }));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HashdAudio,
  HashdContent,
  HashdImage,
  HashdVideo,
  useHashdBatch,
  useHashdContent,
  useHashdImage,
  useHashdMedia
});
