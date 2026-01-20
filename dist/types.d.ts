/**
 * ByteCave Browser Client Types
 */
export interface ByteCaveConfig {
    contractAddress?: string;
    rpcUrl?: string;
    appId: string;
    directNodeAddrs?: string[];
    relayPeers?: string[];
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
