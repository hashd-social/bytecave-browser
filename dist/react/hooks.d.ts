/**
 * React Hooks for HASHD Protocol
 *
 * Provides hooks for loading content from ByteCave network using hashd:// URLs
 */
import type { ByteCaveClient } from '../client.js';
export interface UseHashdContentOptions {
    client: ByteCaveClient | null;
    enabled?: boolean;
    onSuccess?: (blobUrl: string) => void;
    onError?: (error: Error) => void;
}
export interface UseHashdContentResult {
    blobUrl: string | null;
    data: Uint8Array | null;
    mimeType: string | null;
    loading: boolean;
    error: Error | null;
    cached: boolean;
    refetch: () => void;
}
/**
 * Hook for loading content from hashd:// URLs
 *
 * @example
 * const { blobUrl, loading, error } = useHashdContent('hashd://abc123...', { client });
 * if (loading) return <Spinner />;
 * if (error) return <Error message={error.message} />;
 * return <img src={blobUrl} />;
 */
export declare function useHashdContent(url: string | null | undefined, options: UseHashdContentOptions): UseHashdContentResult;
/**
 * Hook specifically for loading images from hashd:// URLs
 * Includes image-specific optimizations and error handling
 *
 * @example
 * const { src, loading, error } = useHashdImage('hashd://abc123...', { client });
 * return <img src={src || placeholderImage} alt="..." />;
 */
export declare function useHashdImage(url: string | null | undefined, options: UseHashdContentOptions & {
    placeholder?: string;
}): UseHashdContentResult & {
    src: string;
};
/**
 * Hook for loading video/audio content from hashd:// URLs
 * Optimized for media playback
 *
 * @example
 * const { src, loading } = useHashdMedia('hashd://abc123...', { client });
 * return <video src={src} controls />;
 */
export declare function useHashdMedia(url: string | null | undefined, options: UseHashdContentOptions): UseHashdContentResult & {
    src: string;
};
/**
 * Hook for batch loading multiple hashd:// URLs
 * Useful for galleries or lists
 *
 * @example
 * const { results, loading, errors } = useHashdBatch(urls, { client });
 */
export declare function useHashdBatch(urls: (string | null | undefined)[], options: UseHashdContentOptions): {
    results: Map<string, UseHashdContentResult>;
    loading: boolean;
    errors: Map<string, Error>;
};
