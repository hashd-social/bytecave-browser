/**
 * Contract-based peer discovery
 * 
 * Reads registered nodes from the VaultNodeRegistry smart contract
 * to bootstrap P2P connections without any central server.
 */

import { ethers } from 'ethers';
import type { NodeRegistryEntry } from './types.js';

const VAULT_REGISTRY_ABI = [
  'function getActiveNodes() external view returns (bytes32[] memory)',
  'function getNode(bytes32 nodeId) external view returns (tuple(address owner, bytes publicKey, string url, bytes32 metadataHash, uint256 registeredAt, bool active))',
  'function getNodeCount() external view returns (uint256 total, uint256 active)'
];

export class ContractDiscovery {
  private provider: ethers.Provider;
  private contract: ethers.Contract;

  constructor(vaultNodeRegistryAddress: string, rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(vaultNodeRegistryAddress, VAULT_REGISTRY_ABI, this.provider);
  }

  /**
   * Get all active nodes from the registry contract
   */
  async getActiveNodes(): Promise<NodeRegistryEntry[]> {
    try {
      const nodeIds: string[] = await this.contract.getActiveNodes();
      const nodes: NodeRegistryEntry[] = [];

      for (const nodeId of nodeIds) {
        try {
          const node = await this.contract.getNode(nodeId);
          nodes.push({
            nodeId,
            owner: node.owner,
            publicKey: ethers.hexlify(node.publicKey),
            url: node.url,
            active: node.active
          });
        } catch (error) {
          console.warn(`Failed to fetch node ${nodeId}:`, error);
        }
      }

      return nodes;
    } catch (error) {
      console.error('Failed to fetch active nodes:', error);
      return [];
    }
  }

  /**
   * Get node count from contract
   */
  async getNodeCount(): Promise<{ total: number; active: number }> {
    try {
      const [total, active] = await this.contract.getNodeCount();
      return { total: Number(total), active: Number(active) };
    } catch (error) {
      console.error('Failed to get node count:', error);
      return { total: 0, active: 0 };
    }
  }

  /**
   * Derive peerId from publicKey (same algorithm as libp2p)
   * Note: This is a simplified version - actual peerId derivation is more complex
   */
  static publicKeyToPeerId(publicKey: string): string {
    // In practice, peerId is derived from the libp2p identity key
    // For now, we'll use the publicKey hash as a placeholder
    // The actual peerId will come from the node's P2P announcements
    return ethers.keccak256(publicKey).slice(0, 54);
  }
}
