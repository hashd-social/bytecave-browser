/**
 * ByteCave Browser Client
 * 
 * WebRTC P2P client for connecting browsers directly to ByteCave storage nodes.
 * No central gateway required - fully decentralized.
 */

export { ByteCaveClient } from './client.js';
export { ContractDiscovery } from './discovery.js';
export type { 
  ByteCaveConfig, 
  PeerInfo, 
  StoreResult, 
  RetrieveResult,
  ConnectionState 
} from './types.js';
