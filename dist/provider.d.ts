/**
 * React Context Provider for ByteCave Client
 *
 * Provides P2P connectivity state and methods to React components
 */
import React, { ReactNode } from 'react';
import type { PeerInfo, ConnectionState, StoreResult, RetrieveResult } from './types.js';
interface NodeHealth {
    status: string;
    blobCount: number;
    storageUsed: number;
    uptime: number;
    nodeId?: string;
    publicKey?: string;
    secp256k1PublicKey?: string;
    ownerAddress?: string;
    metrics?: {
        requestsLastHour: number;
        avgResponseTime: number;
        successRate: number;
    };
    integrity?: {
        checked: number;
        passed: number;
        failed: number;
        orphaned: number;
        metadataTampered: number;
        failedCids: string[];
    };
}
interface ByteCaveContextValue {
    connectionState: ConnectionState;
    peers: PeerInfo[];
    isConnected: boolean;
    appId: string;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    store: (data: Uint8Array, contentType?: string, signer?: any) => Promise<StoreResult>;
    retrieve: (cid: string) => Promise<RetrieveResult>;
    getNodeHealth: (peerId: string) => Promise<NodeHealth | null>;
    error: string | null;
}
interface ByteCaveProviderProps {
    children: ReactNode;
    contractAddress: string;
    rpcUrl: string;
    appId: string;
    relayPeers?: string[];
    directNodeAddrs?: string[];
}
export declare function ByteCaveProvider({ children, contractAddress, rpcUrl, appId, relayPeers, directNodeAddrs }: ByteCaveProviderProps): React.JSX.Element;
export declare function useByteCaveContext(): ByteCaveContextValue;
export {};
