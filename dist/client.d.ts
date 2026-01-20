/**
 * ByteCave Browser Client
 *
 * WebRTC P2P client for connecting browsers directly to ByteCave storage nodes.
 */
import type { ByteCaveConfig, PeerInfo, StoreResult, RetrieveResult, ConnectionState, SignalingMessage } from './types.js';
export declare class ByteCaveClient {
    private node;
    private discovery?;
    private config;
    private knownPeers;
    private connectionState;
    private eventListeners;
    constructor(config: ByteCaveConfig);
    /**
     * Initialize and start the P2P client
     */
    start(): Promise<void>;
    /**
     * Stop the P2P client
     */
    stop(): Promise<void>;
    /**
     * Refresh peer directory from relay
     * This rediscovers nodes that may have reconnected or restarted
     */
    refreshPeerDirectory(): Promise<void>;
    /**
     * Store ciphertext on a node via P2P
     * Uses getPeers() directly for fast peer access
     *
     * @param data - Data to store
     * @param contentType - MIME type
     * @param signer - Ethers signer for authorization (optional, but required for most nodes)
     */
    store(data: Uint8Array | ArrayBuffer, contentType?: string, signer?: any): Promise<StoreResult>;
    /**
     * Retrieve ciphertext from a node via P2P only (no HTTP fallback)
     */
    retrieve(cid: string): Promise<RetrieveResult>;
    /**
     * Get list of known peers (includes both announced peers and connected libp2p peers)
     */
    getPeers(): Promise<PeerInfo[]>;
    /**
     * Get count of connected peers
     */
    getConnectedPeerCount(): number;
    /**
     * Get node info from a peer via P2P stream (for registration)
     */
    getNodeInfo(peerId: string): Promise<{
        publicKey: string;
        ownerAddress?: string;
        peerId: string;
    } | null>;
    /**
     * Get health info from a peer via P2P stream
     */
    getNodeHealth(peerId: string): Promise<{
        status: string;
        blobCount: number;
        storageUsed: number;
        uptime: number;
    } | null>;
    /**
     * Get current connection state
     */
    getConnectionState(): ConnectionState;
    /**
     * Subscribe to events
     */
    on(event: string, callback: Function): void;
    /**
     * Unsubscribe from events
     */
    off(event: string, callback: Function): void;
    private emit;
    private setConnectionState;
    private setupEventListeners;
    private setupPubsub;
    private handlePeerAnnouncement;
    /**
     * Check if a nodeId is registered in the on-chain registry
     */
    private checkNodeRegistration;
    private handleSignalingMessage;
    /**
     * Send signaling message to a peer for WebRTC negotiation
     */
    sendSignalingMessage(targetPeerId: string, signal: Omit<SignalingMessage, 'from'>): Promise<void>;
    private findPeerForContentType;
}
