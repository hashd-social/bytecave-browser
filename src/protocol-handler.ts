/**
 * HashD Protocol Handler
 * 
 * Handles hashd:// URLs for loading content from ByteCave network.
 * Format: hashd://{cid}?type={mimeType}&decrypt={boolean}
 */

import type { ByteCaveClient } from './client.js';

export interface HashdUrl {
  protocol: 'hashd:';
  cid: string;
  mimeType?: string;
  decrypt?: boolean;
  raw: string;
}

export interface FetchOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export interface FetchResult {
  data: Uint8Array;
  mimeType: string;
  blobUrl: string;
  cached: boolean;
}

/**
 * Parse a hashd:// URL into its components
 */
export function parseHashdUrl(url: string): HashdUrl {
  if (!url.startsWith('hashd://')) {
    throw new Error(`Invalid hashd:// URL: ${url}`);
  }

  // Remove protocol
  const withoutProtocol = url.slice(8); // Remove 'hashd://'
  
  // Split CID and query params
  const [cid, queryString] = withoutProtocol.split('?');
  
  if (!cid || cid.length === 0) {
    throw new Error(`Invalid hashd:// URL: missing CID`);
  }

  const result: HashdUrl = {
    protocol: 'hashd:',
    cid,
    raw: url
  };

  // Parse query parameters
  if (queryString) {
    const params = new URLSearchParams(queryString);
    
    if (params.has('type')) {
      result.mimeType = params.get('type')!;
    }
    
    if (params.has('decrypt')) {
      result.decrypt = params.get('decrypt') === 'true';
    }
  }

  return result;
}

/**
 * Create a hashd:// URL from a CID and options
 */
export function createHashdUrl(
  cid: string, 
  options?: { mimeType?: string; decrypt?: boolean }
): string {
  let url = `hashd://${cid}`;
  
  if (options) {
    const params = new URLSearchParams();
    
    if (options.mimeType) {
      params.set('type', options.mimeType);
    }
    
    if (options.decrypt !== undefined) {
      params.set('decrypt', String(options.decrypt));
    }
    
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  
  return url;
}

/**
 * Blob URL cache to avoid re-fetching content
 */
class BlobUrlCache {
  private cache = new Map<string, { blobUrl: string; mimeType: string; timestamp: number }>();
  private readonly maxAge = 60 * 60 * 1000; // 1 hour

  set(cid: string, blobUrl: string, mimeType: string): void {
    this.cache.set(cid, { blobUrl, mimeType, timestamp: Date.now() });
  }

  get(cid: string): { blobUrl: string; mimeType: string } | null {
    const entry = this.cache.get(cid);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.revoke(cid);
      return null;
    }

    return { blobUrl: entry.blobUrl, mimeType: entry.mimeType };
  }

  revoke(cid: string): void {
    const entry = this.cache.get(cid);
    if (entry) {
      URL.revokeObjectURL(entry.blobUrl);
      this.cache.delete(cid);
    }
  }

  clear(): void {
    for (const entry of this.cache.values()) {
      URL.revokeObjectURL(entry.blobUrl);
    }
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Global cache instance
const blobCache = new BlobUrlCache();

/**
 * Detect MIME type from data if not provided
 */
function detectMimeType(data: Uint8Array): string {
  // Check magic bytes for common formats
  if (data.length < 4) {
    return 'application/octet-stream';
  }

  // PNG
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
    return 'image/png';
  }

  // JPEG
  if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
    return 'image/jpeg';
  }

  // GIF
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
    return 'image/gif';
  }

  // WebP
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
      data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
    return 'image/webp';
  }

  // MP4
  if (data.length >= 12 && 
      data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) {
    return 'video/mp4';
  }

  // Default
  return 'application/octet-stream';
}

/**
 * Fetch content from ByteCave network using hashd:// URL
 */
export async function fetchHashdContent(
  url: string | HashdUrl,
  client: ByteCaveClient,
  options?: FetchOptions
): Promise<FetchResult> {
  // Parse URL if string
  const parsed = typeof url === 'string' ? parseHashdUrl(url) : url;

  // Check cache first
  const cached = blobCache.get(parsed.cid);
  if (cached) {
    console.log(`[HashD] Cache hit for CID: ${parsed.cid.slice(0, 16)}...`);
    return {
      data: new Uint8Array(), // Don't return data for cached items
      mimeType: cached.mimeType,
      blobUrl: cached.blobUrl,
      cached: true
    };
  }

  console.log(`[HashD] Fetching CID: ${parsed.cid.slice(0, 16)}...`);

  // Fetch from ByteCave network
  const result = await client.retrieve(parsed.cid);

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to retrieve content');
  }

  // Determine MIME type
  const mimeType = parsed.mimeType || detectMimeType(result.data);

  // Create blob URL (copy data to avoid SharedArrayBuffer issues)
  const dataCopy = new Uint8Array(result.data);
  const blob = new Blob([dataCopy], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);

  // Cache the blob URL
  blobCache.set(parsed.cid, blobUrl, mimeType);

  console.log(`[HashD] Retrieved and cached CID: ${parsed.cid.slice(0, 16)}... (${mimeType})`);

  return {
    data: result.data,
    mimeType,
    blobUrl,
    cached: false
  };
}

/**
 * Prefetch content and cache it
 */
export async function prefetchHashdContent(
  url: string | HashdUrl,
  client: ByteCaveClient
): Promise<void> {
  await fetchHashdContent(url, client);
}

/**
 * Clear the blob URL cache
 */
export function clearHashdCache(): void {
  blobCache.clear();
}

/**
 * Get cache statistics
 */
export function getHashdCacheStats(): { size: number } {
  return { size: blobCache.size() };
}

/**
 * Revoke a specific blob URL from cache
 */
export function revokeHashdUrl(cid: string): void {
  blobCache.revoke(cid);
}
