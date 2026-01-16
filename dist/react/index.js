import {
  fetchHashdContent,
  parseHashdUrl
} from "../chunk-EEZWRIUI.js";

// src/react/hooks.ts
import { useState, useEffect, useCallback, useRef } from "react";
function useHashdContent(url, options) {
  const { client, enabled = true, onSuccess, onError } = options;
  const [blobUrl, setBlobUrl] = useState(null);
  const [data, setData] = useState(null);
  const [mimeType, setMimeType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cached, setCached] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const mountedRef = useRef(true);
  const abortControllerRef = useRef(null);
  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  useEffect(() => {
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
  const [results, setResults] = useState(/* @__PURE__ */ new Map());
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState(/* @__PURE__ */ new Map());
  useEffect(() => {
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
import React from "react";
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
    return /* @__PURE__ */ React.createElement(React.Fragment, null, loadingComponent);
  }
  if (error && errorComponent) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, errorComponent);
  }
  return /* @__PURE__ */ React.createElement("img", { ...imgProps, src: blobUrl });
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
    return /* @__PURE__ */ React.createElement(React.Fragment, null, loadingComponent);
  }
  if (error && errorComponent) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, errorComponent);
  }
  return /* @__PURE__ */ React.createElement("video", { ...videoProps, src: blobUrl });
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
    return /* @__PURE__ */ React.createElement(React.Fragment, null, loadingComponent);
  }
  if (error && errorComponent) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, errorComponent);
  }
  return /* @__PURE__ */ React.createElement("audio", { ...audioProps, src: blobUrl });
}
function HashdContent({ url, client, children }) {
  const { blobUrl, loading, error, mimeType } = useHashdImage(url, { client });
  return /* @__PURE__ */ React.createElement(React.Fragment, null, children({ blobUrl, loading, error, mimeType }));
}
export {
  HashdAudio,
  HashdContent,
  HashdImage,
  HashdVideo,
  useHashdBatch,
  useHashdContent,
  useHashdImage,
  useHashdMedia
};
