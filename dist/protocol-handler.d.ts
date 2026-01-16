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
export declare function parseHashdUrl(url: string): HashdUrl;
/**
 * Create a hashd:// URL from a CID and options
 */
export declare function createHashdUrl(cid: string, options?: {
    mimeType?: string;
    decrypt?: boolean;
}): string;
/**
 * Fetch content from ByteCave network using hashd:// URL
 */
export declare function fetchHashdContent(url: string | HashdUrl, client: ByteCaveClient, options?: FetchOptions): Promise<FetchResult>;
/**
 * Prefetch content and cache it
 */
export declare function prefetchHashdContent(url: string | HashdUrl, client: ByteCaveClient): Promise<void>;
/**
 * Clear the blob URL cache
 */
export declare function clearHashdCache(): void;
/**
 * Get cache statistics
 */
export declare function getHashdCacheStats(): {
    size: number;
};
/**
 * Revoke a specific blob URL from cache
 */
export declare function revokeHashdUrl(cid: string): void;
