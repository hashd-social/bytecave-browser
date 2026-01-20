/**
 * ByteCave Browser Client Types
 */

export interface ByteCaveConfig {
  contractAddress?: string; // Optional - required for node registration verification
  contentRegistryAddress?: string; // Optional - ContentRegistry contract address for on-chain registration
  rpcUrl?: string; // Optional - required if contractAddress is provided
  appId: string; // Application identifier for storage authorization
  directNodeAddrs?: string[]; // Direct node multiaddrs for WebRTC connections (no relay)
  relayPeers?: string[]; // Relay node multiaddrs for circuit relay fallback
  maxPeers?: number;
  connectionTimeout?: number;
}

export interface PeerInfo {
  peerId: string;
  publicKey: string;
  contentTypes: string[] | 'all';
  connected: boolean;
  latency?: number;
  nodeId?: string;
  isRegistered?: boolean;
  owner?: string;
}

export interface StoreResult {
  success: boolean;
  cid?: string;
  peerId?: string;
  error?: string;
}

export interface RetrieveResult {
  success: boolean;
  data?: Uint8Array;
  peerId?: string;
  error?: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  sdp?: string;
  candidate?: {
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  };
}

export interface NodeRegistryEntry {
  nodeId: string;
  owner: string;
  publicKey: string;
  url: string;
  active: boolean;
}
