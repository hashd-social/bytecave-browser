/**
 * Contract-based peer discovery
 *
 * Reads registered nodes from the VaultNodeRegistry smart contract
 * to bootstrap P2P connections without any central server.
 */
import type { NodeRegistryEntry } from './types.js';
export declare class ContractDiscovery {
    private provider;
    private contract;
    constructor(contractAddress: string, rpcUrl: string);
    /**
     * Get all active nodes from the registry contract
     */
    getActiveNodes(): Promise<NodeRegistryEntry[]>;
    /**
     * Get node count from contract
     */
    getNodeCount(): Promise<{
        total: number;
        active: number;
    }>;
    /**
     * Derive peerId from publicKey (same algorithm as libp2p)
     * Note: This is a simplified version - actual peerId derivation is more complex
     */
    static publicKeyToPeerId(publicKey: string): string;
}
