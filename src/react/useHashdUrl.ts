import { useState, useEffect } from 'react';
import { useByteCaveContext } from '../provider.js';

interface UseHashdUrlResult {
  blobUrl: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to convert hashd:// URLs to blob URLs
 * Must be used within ByteCaveProvider
 * 
 * @example
 * const { blobUrl, loading, error } = useHashdUrl('hashd://abc123...');
 * return <img src={blobUrl || ''} alt="..." />;
 */
export function useHashdUrl(hashdUrl: string | null | undefined): UseHashdUrlResult {
  const { retrieve } = useByteCaveContext();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hashdUrl || !hashdUrl.startsWith('hashd://')) {
      setBlobUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    const cid = hashdUrl.replace('hashd://', '').split('?')[0];

    let mounted = true;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second between retries

    setLoading(true);
    setError(null);

    const attemptRetrieve = () => {
      retrieve(cid)
        .then(result => {
          if (!mounted) return;

          if (result.success && result.data) {
            const dataCopy = new Uint8Array(result.data);
            const blob = new Blob([dataCopy]);
            const url = URL.createObjectURL(blob);
            setBlobUrl(url);
            setLoading(false);
          } else {
            // Retry on failure if we haven't exceeded max retries
            if (retryCount < maxRetries && result.error?.includes('not connected')) {
              retryCount++;
              console.log(`[useHashdUrl] Retry ${retryCount}/${maxRetries} for CID:`, cid.slice(0, 12));
              setTimeout(attemptRetrieve, retryDelay);
            } else {
              setError(result.error || 'Failed to retrieve content');
              setLoading(false);
            }
          }
        })
        .catch(err => {
          if (!mounted) return;
          
          // Retry on connection errors
          if (retryCount < maxRetries && err.message?.includes('not connected')) {
            retryCount++;
            console.log(`[useHashdUrl] Retry ${retryCount}/${maxRetries} for CID:`, cid.slice(0, 12));
            setTimeout(attemptRetrieve, retryDelay);
          } else {
            setError(err.message || 'Failed to retrieve content');
            setLoading(false);
          }
        });
    };

    attemptRetrieve();

    return () => {
      mounted = false;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [hashdUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return { blobUrl, loading, error };
}
