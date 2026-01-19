/**
 * ByteCave Browser Client
 *
 * WebRTC P2P client for connecting browsers directly to ByteCave storage nodes.
 * No central gateway required - fully decentralized.
 */
export declare const TEST_EXPORT = "ByteCave Browser Package v1.0.0";
export { ByteCaveClient } from './client.js';
export { ContractDiscovery } from './discovery.js';
export { p2pProtocolClient } from './p2p-protocols.js';
export { ByteCaveProvider, useByteCaveContext } from './provider.js';
export type { P2PHealthResponse, P2PInfoResponse } from './p2p-protocols.js';
export type { ByteCaveConfig, PeerInfo, StoreResult, RetrieveResult, ConnectionState } from './types.js';
export { parseHashdUrl, createHashdUrl, fetchHashdContent, prefetchHashdContent, clearHashdCache, getHashdCacheStats, revokeHashdUrl } from './protocol-handler.js';
export type { HashdUrl, FetchOptions, FetchResult } from './protocol-handler.js';
export { useHashdContent, useHashdImage, useHashdMedia, useHashdBatch } from './react/hooks.js';
export { HashdImage, HashdVideo, HashdAudio } from './react/components.js';
export { useHashdUrl } from './react/useHashdUrl.js';
