var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

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
function createHashdUrl(cid, options) {
  let url = `hashd://${cid}`;
  if (options) {
    const params = new URLSearchParams();
    if (options.mimeType) {
      params.set("type", options.mimeType);
    }
    if (options.decrypt !== void 0) {
      params.set("decrypt", String(options.decrypt));
    }
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  return url;
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
async function prefetchHashdContent(url, client) {
  await fetchHashdContent(url, client);
}
function clearHashdCache() {
  blobCache.clear();
}
function getHashdCacheStats() {
  return { size: blobCache.size() };
}
function revokeHashdUrl(cid) {
  blobCache.revoke(cid);
}

export {
  __publicField,
  parseHashdUrl,
  createHashdUrl,
  fetchHashdContent,
  prefetchHashdContent,
  clearHashdCache,
  getHashdCacheStats,
  revokeHashdUrl
};
