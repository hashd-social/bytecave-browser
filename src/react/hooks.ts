/**
 * React Hooks for HASHD Protocol
 * 
 * Provides hooks for loading content from ByteCave network using hashd:// URLs
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ByteCaveClient } from '../client.js';
import { fetchHashdContent, parseHashdUrl, type HashdUrl } from '../protocol-handler.js';

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
export function useHashdContent(
  url: string | null | undefined,
  options: UseHashdContentOptions
): UseHashdContentResult {
  const { client, enabled = true, onSuccess, onError } = options;
  
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [cached, setCached] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev: number) => prev + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Abort any pending fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    // Reset state when URL changes
    if (!url || !enabled || !client) {
      setBlobUrl(null);
      setData(null);
      setMimeType(null);
      setError(null);
      setCached(false);
      setLoading(false);
      return;
    }

    // Validate URL
    let parsed: HashdUrl;
    try {
      parsed = parseHashdUrl(url);
    } catch (err) {
      setError(err as Error);
      setLoading(false);
      return;
    }

    // Abort previous fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);

    fetchHashdContent(parsed, client, { signal: abortController.signal })
      .then(result => {
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
      })
      .catch(err => {
        if (!mountedRef.current || abortController.signal.aborted) {
          return;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setLoading(false);
        
        if (onError) {
          onError(error);
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

/**
 * Hook specifically for loading images from hashd:// URLs
 * Includes image-specific optimizations and error handling
 * 
 * @example
 * const { src, loading, error } = useHashdImage('hashd://abc123...', { client });
 * return <img src={src || placeholderImage} alt="..." />;
 */
export function useHashdImage(
  url: string | null | undefined,
  options: UseHashdContentOptions & { placeholder?: string }
): UseHashdContentResult & { src: string } {
  const result = useHashdContent(url, options);
  
  return {
    ...result,
    src: result.blobUrl || options.placeholder || ''
  };
}

/**
 * Hook for loading video/audio content from hashd:// URLs
 * Optimized for media playback
 * 
 * @example
 * const { src, loading } = useHashdMedia('hashd://abc123...', { client });
 * return <video src={src} controls />;
 */
export function useHashdMedia(
  url: string | null | undefined,
  options: UseHashdContentOptions
): UseHashdContentResult & { src: string } {
  const result = useHashdContent(url, options);
  
  return {
    ...result,
    src: result.blobUrl || ''
  };
}

/**
 * Hook for batch loading multiple hashd:// URLs
 * Useful for galleries or lists
 * 
 * @example
 * const { results, loading, errors } = useHashdBatch(urls, { client });
 */
export function useHashdBatch(
  urls: (string | null | undefined)[],
  options: UseHashdContentOptions
): {
  results: Map<string, UseHashdContentResult>;
  loading: boolean;
  errors: Map<string, Error>;
} {
  const [results, setResults] = useState<Map<string, UseHashdContentResult>>(new Map());
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Map<string, Error>>(new Map());

  useEffect(() => {
    if (!options.client || !options.enabled) {
      return;
    }

    const validUrls = urls.filter((url): url is string => !!url);
    
    if (validUrls.length === 0) {
      setResults(new Map());
      setErrors(new Map());
      setLoading(false);
      return;
    }

    setLoading(true);
    const newResults = new Map<string, UseHashdContentResult>();
    const newErrors = new Map<string, Error>();

    Promise.all(
      validUrls.map(async (url) => {
        try {
          const parsed = parseHashdUrl(url);
          const result = await fetchHashdContent(parsed, options.client!);
          
          newResults.set(url, {
            blobUrl: result.blobUrl,
            data: result.data,
            mimeType: result.mimeType,
            loading: false,
            error: null,
            cached: result.cached,
            refetch: () => {}
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
  }, [urls.join(','), options.client, options.enabled]);

  return { results, loading, errors };
}
