/**
 * ByteCave Browser Client
 *
 * WebRTC P2P client for connecting browsers directly to ByteCave storage nodes.
 */
import { ethers } from 'ethers';
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
     * Store data on the network
     * Uses getPeers() directly for fast peer access
     *
     * @param data - Data to store
     * @param mimeType - MIME type (optional, defaults to 'application/octet-stream')
     * @param signer - Ethers signer for authorization (optional, but required for most nodes)
     */
    store(data: Uint8Array | ArrayBuffer, mimeType?: string, signer?: any): Promise<StoreResult>;
    /**
     * Retrieve ciphertext from a node via P2P only (no HTTP fallback)
     */
    retrieve(cid: string): Promise<RetrieveResult>;
    /**
     * Register content in ContentRegistry contract (on-chain)
     * This must be called before storing content that requires on-chain verification
     */
    registerContent(cid: string, appId: string, signer: ethers.Signer): Promise<{
        success: boolean;
        txHash?: string;
        error?: string;
    }>;
    /**
     * Check if content is registered in ContentRegistry
     */
    isContentRegistered(cid: string): Promise<boolean>;
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
