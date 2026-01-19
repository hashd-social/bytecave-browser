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
export declare function useHashdUrl(hashdUrl: string | null | undefined): UseHashdUrlResult;
export {};
