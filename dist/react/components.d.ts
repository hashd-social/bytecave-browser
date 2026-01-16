/**
 * React Components for HashD Protocol
 *
 * Drop-in components for loading content from ByteCave network
 */
import React, { ImgHTMLAttributes, VideoHTMLAttributes, AudioHTMLAttributes } from 'react';
import { type UseHashdContentOptions } from './hooks.js';
export interface HashdImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
    src: string;
    client: UseHashdContentOptions['client'];
    placeholder?: string;
    loadingComponent?: React.ReactNode;
    errorComponent?: React.ReactNode;
    onHashdLoad?: () => void;
    onHashdError?: (error: Error) => void;
}
/**
 * Drop-in replacement for <img> that loads from hashd:// URLs
 *
 * @example
 * <HashdImage
 *   src="hashd://abc123..."
 *   client={byteCaveClient}
 *   alt="Profile picture"
 *   className="w-32 h-32 rounded-full"
 * />
 */
export declare function HashdImage({ src, client, placeholder, loadingComponent, errorComponent, onHashdLoad, onHashdError, ...imgProps }: HashdImageProps): React.JSX.Element;
export interface HashdVideoProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> {
    src: string;
    client: UseHashdContentOptions['client'];
    loadingComponent?: React.ReactNode;
    errorComponent?: React.ReactNode;
    onHashdLoad?: () => void;
    onHashdError?: (error: Error) => void;
}
/**
 * Drop-in replacement for <video> that loads from hashd:// URLs
 *
 * @example
 * <HashdVideo
 *   src="hashd://abc123..."
 *   client={byteCaveClient}
 *   controls
 *   className="w-full"
 * />
 */
export declare function HashdVideo({ src, client, loadingComponent, errorComponent, onHashdLoad, onHashdError, ...videoProps }: HashdVideoProps): React.JSX.Element;
export interface HashdAudioProps extends Omit<AudioHTMLAttributes<HTMLAudioElement>, 'src'> {
    src: string;
    client: UseHashdContentOptions['client'];
    loadingComponent?: React.ReactNode;
    errorComponent?: React.ReactNode;
    onHashdLoad?: () => void;
    onHashdError?: (error: Error) => void;
}
/**
 * Drop-in replacement for <audio> that loads from hashd:// URLs
 *
 * @example
 * <HashdAudio
 *   src="hashd://abc123..."
 *   client={byteCaveClient}
 *   controls
 * />
 */
export declare function HashdAudio({ src, client, loadingComponent, errorComponent, onHashdLoad, onHashdError, ...audioProps }: HashdAudioProps): React.JSX.Element;
export interface HashdContentProps {
    url: string;
    client: UseHashdContentOptions['client'];
    children: (props: {
        blobUrl: string | null;
        loading: boolean;
        error: Error | null;
        mimeType: string | null;
    }) => React.ReactNode;
}
/**
 * Render prop component for custom content rendering
 *
 * @example
 * <HashdContent url="hashd://abc123..." client={client}>
 *   {({ blobUrl, loading, error }) => {
 *     if (loading) return <Spinner />;
 *     if (error) return <Error message={error.message} />;
 *     return <img src={blobUrl} />;
 *   }}
 * </HashdContent>
 */
export declare function HashdContent({ url, client, children }: HashdContentProps): React.JSX.Element;
