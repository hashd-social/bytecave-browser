/**
 * ByteCave Browser Client
 * 
 * WebRTC P2P client for connecting browsers directly to ByteCave storage nodes.
 * No central gateway required - fully decentralized.
 */

export { ByteCaveClient } from './client.js';
export { ContractDiscovery } from './discovery.js';
export { p2pProtocolClient } from './p2p-protocols.js';
export type { 
  P2PHealthResponse,
  P2PInfoResponse 
} from './p2p-protocols.js';
export type { 
  ByteCaveConfig, 
  PeerInfo, 
  StoreResult, 
  RetrieveResult,
  ConnectionState 
} from './types.js';

// Protocol handler exports
export {
  parseHashdUrl,
  createHashdUrl,
  fetchHashdContent,
  prefetchHashdContent,
  clearHashdCache,
  getHashdCacheStats,
  revokeHashdUrl
} from './protocol-handler.js';
export type {
  HashdUrl,
  FetchOptions,
  FetchResult
} from './protocol-handler.js';
