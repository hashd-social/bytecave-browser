/**
 * ByteCave Browser - P2P Protocol Client
 *
 * Implements libp2p stream protocols for pure P2P communication from browser:
 * - /bytecave/blob/1.0.0 - Blob storage and retrieval
 * - /bytecave/health/1.0.0 - Health status
 * - /bytecave/info/1.0.0 - Node info (for registration)
 */
import { Libp2p } from 'libp2p';
export declare const PROTOCOL_BLOB = "/bytecave/blob/1.0.0";
export declare const PROTOCOL_HEALTH = "/bytecave/health/1.0.0";
export declare const PROTOCOL_INFO = "/bytecave/info/1.0.0";
export declare const PROTOCOL_PEER_DIRECTORY = "/bytecave/relay/peers/1.0.0";
export declare const PROTOCOL_HAVE_LIST = "/bytecave/have-list/1.0.0";
export interface BlobResponse {
    success: boolean;
    ciphertext?: string;
    mimeType?: string;
    error?: string;
}
export interface P2PHealthResponse {
    peerId: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    blobCount: number;
    storageUsed: number;
    storageMax: number;
    uptime: number;
    version: string;
    multiaddrs: string[];
    nodeId?: string;
    publicKey?: string;
    ownerAddress?: string;
    contentTypes?: string[] | 'all';
    metrics?: {
        requestsLastHour: number;
        avgResponseTime: number;
        successRate: number;
    };
}
export interface P2PInfoResponse {
    peerId: string;
    publicKey: string;
    ownerAddress?: string;
    version: string;
    contentTypes: string[] | 'all';
}
export interface PeerDirectoryResponse {
    peers: Array<{
        peerId: string;
        multiaddrs: string[];
        lastSeen: number;
    }>;
    timestamp: number;
}
export interface HaveListResponse {
    cids: string[];
    total: number;
    hasMore: boolean;
}
export interface StoreRequest {
    cid: string;
    mimeType: string;
    ciphertext: string;
    appId?: string;
    contentType?: string;
    sender?: string;
    timestamp?: number;
    metadata?: Record<string, any>;
    authorization?: any;
}
export interface StoreResponse {
    success: boolean;
    cid?: string;
    error?: string;
}
/**
 * P2P Protocol client for browser-to-node communication
 */
export declare class P2PProtocolClient {
    private node;
    setNode(node: Libp2p): void;
    /**
     * Store a blob on a peer via P2P stream
     */
    storeToPeer(peerId: string, ciphertext: Uint8Array, mimeType: string, contentType?: string, authorization?: any): Promise<StoreResponse>;
    /**
     * Retrieve a blob from a peer via P2P stream
     */
    retrieveFromPeer(peerId: string, cid: string): Promise<{
        data: Uint8Array;
        mimeType: string;
    } | null>;
    /**
     * Get health info from a peer via P2P stream
     */
    getHealthFromPeer(peerId: string): Promise<P2PHealthResponse | null>;
    /**
     * Query relay for peer directory
     */
    getPeerDirectoryFromRelay(relayPeerId: string): Promise<PeerDirectoryResponse | null>;
    /**
     * Get node info from a peer via P2P stream (for registration)
     */
    getInfoFromPeer(peerId: string): Promise<P2PInfoResponse | null>;
    /**
     * Check if a peer has a specific CID
     */
    peerHasCid(peerId: string, cid: string): Promise<boolean>;
    private readMessage;
    private writeMessage;
    private uint8ArrayToBase64;
    private base64ToUint8Array;
}
export declare const p2pProtocolClient: P2PProtocolClient;
