/**
 * ByteCave Browser Client
 * 
 * WebRTC P2P client for connecting browsers directly to ByteCave storage nodes.
 */

import { createLibp2p, Libp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { floodsub } from '@libp2p/floodsub';
import { identify } from '@libp2p/identify';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { multiaddr } from '@multiformats/multiaddr';
import { peerIdFromString } from '@libp2p/peer-id';
import { fromString, toString } from 'uint8arrays';
import { ethers } from 'ethers';
import { ContractDiscovery } from './discovery.js';
import { p2pProtocolClient } from './p2p-protocols.js';
import { CONTENT_REGISTRY_ABI } from './contracts/ContentRegistry.js';
import type { 
  ByteCaveConfig, 
  PeerInfo, 
  StoreResult, 
  RetrieveResult, 
  ConnectionState,
  SignalingMessage 
} from './types.js';

const ANNOUNCE_TOPIC = 'bytecave-announce';
const SIGNALING_TOPIC_PREFIX = 'bytecave-signaling-';

export class ByteCaveClient {
  private node: Libp2p | null = null;
  private discovery?: ContractDiscovery; // Optional - only if contract address provided
  private config: ByteCaveConfig;
  private knownPeers: Map<string, PeerInfo> = new Map();
  private connectionState: ConnectionState = 'disconnected';
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor(config: ByteCaveConfig) {
    this.config = {
      maxPeers: 10,
      connectionTimeout: 30000,
      ...config
    };
    // Only initialize contract discovery if contract address is provided
    if (config.vaultNodeRegistryAddress && config.rpcUrl) {
      this.discovery = new ContractDiscovery(config.vaultNodeRegistryAddress, config.rpcUrl);
    }
  }

  /**
   * Initialize and start the P2P client
   */
  async start(): Promise<void> {
    if (this.node) {
      console.warn('ByteCave client already started');
      return;
    }

    this.setConnectionState('connecting');
    console.log('[ByteCave] Starting P2P client...');

    try {
      const bootstrapPeers: string[] = [];

      // Add direct node addresses if provided (for direct WebRTC connections)
      if (this.config.directNodeAddrs && this.config.directNodeAddrs.length > 0) {
        console.log('[ByteCave] Using direct node addresses:', this.config.directNodeAddrs);
        bootstrapPeers.push(...this.config.directNodeAddrs);
      }

      // Use relay peers for fallback (circuit relay connections)
      if (this.config.relayPeers && this.config.relayPeers.length > 0) {
        console.log('[ByteCave] Using relay peers as fallback:', this.config.relayPeers);
        bootstrapPeers.push(...this.config.relayPeers);
      }

      if (bootstrapPeers.length === 0) {
        console.warn('[ByteCave] No peers configured - will rely on contract discovery only');
      }

      console.log('[ByteCave] Bootstrap peers:', bootstrapPeers);

      // Create libp2p node with WebRTC transport
      this.node = await createLibp2p({
        transports: [
          webRTC() as any,
          webSockets() as any,
          circuitRelayTransport() as any
        ],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        connectionGater: {
          denyDialMultiaddr: () => false,
          denyDialPeer: () => false,
          denyInboundConnection: () => false,
          denyOutboundConnection: () => false,
          denyInboundEncryptedConnection: () => false,
          denyOutboundEncryptedConnection: () => false,
          denyInboundUpgradedConnection: () => false,
          denyOutboundUpgradedConnection: () => false,
          filterMultiaddrForPeer: () => true
        },
        services: {
          identify: identify(),
          pubsub: floodsub()
        },
        peerDiscovery: bootstrapPeers.length > 0 ? [
          bootstrap({ list: bootstrapPeers })
        ] : undefined
      });

      // Set up event listeners
      this.setupEventListeners();

      // Set up pubsub
      await this.setupPubsub();

      // Start the node
      await this.node.start();
      console.log('[ByteCave] Node started with peerId:', this.node.peerId.toString());

      // Dial relay peers to bootstrap P2P discovery
      console.log('[ByteCave] Attempting to dial relay peers:', bootstrapPeers);
      
      for (const addr of bootstrapPeers) {
        try {
          console.log('[ByteCave] Dialing relay:', addr);
          const ma = multiaddr(addr);
          const connection = await this.node.dial(ma as any);
          console.log('[ByteCave] ✓ Connected to relay:', addr, 'remotePeer:', connection.remotePeer.toString());
        } catch (err: any) {
          console.error('[ByteCave] ✗ Failed to dial relay:', addr, 'Error:', err.message || err);
        }
      }

      const connectedPeers = this.node.getPeers();
      console.log('[ByteCave] Connected peers after relay dial:', connectedPeers.length, connectedPeers.map(p => p.toString()));

      // Initialize P2P protocol client with the libp2p node
      p2pProtocolClient.setNode(this.node);

      // Fast discovery: Query relay for peer directory
      console.log('[ByteCave] Querying relay for peer directory...');
      for (const relayAddr of bootstrapPeers) {
        try {
          // Extract relay peer ID from multiaddr
          const parts = relayAddr.split('/p2p/');
          if (parts.length < 2) continue;
          const relayPeerId = parts[parts.length - 1];
          
          const directory = await p2pProtocolClient.getPeerDirectoryFromRelay(relayPeerId);
          if (directory && directory.peers.length > 0) {
            console.log('[ByteCave] Got', directory.peers.length, 'peers from relay directory');
            
            // Dial each peer and fetch health data
            for (const peer of directory.peers) {
              try {
                console.log('[ByteCave] Dialing peer from directory:', peer.peerId.slice(0, 12) + '...');
                
                // Try to dial using circuit relay multiaddr
                let connected = false;
                for (const addr of peer.multiaddrs) {
                  try {
                    console.log('[ByteCave] Trying multiaddr:', addr);
                    const ma = multiaddr(addr);
                    await this.node.dial(ma as any);
                    connected = true;
                    console.log('[ByteCave] ✓ Connected via:', addr);
                    break;
                  } catch (dialErr: any) {
                    console.warn('[ByteCave] Failed to dial via', addr.slice(0, 50) + '...', dialErr.message);
                  }
                }
                
                if (!connected) {
                  console.warn('[ByteCave] Could not connect to peer via any multiaddr');
                  continue;
                }
                
                // Fetch health data
                const health = await p2pProtocolClient.getHealthFromPeer(peer.peerId);
                if (health) {
                  this.knownPeers.set(peer.peerId, {
                    peerId: peer.peerId,
                    publicKey: health.publicKey || '',
                    contentTypes: health.contentTypes || 'all',
                    connected: true,
                    nodeId: health.nodeId
                  });
                  console.log('[ByteCave] ✓ Discovered peer:', health.nodeId || peer.peerId.slice(0, 12));
                }
              } catch (err: any) {
                console.warn('[ByteCave] Failed to process peer from directory:', peer.peerId.slice(0, 12), err.message);
              }
            }
            
            break; // Successfully got directory from one relay
          }
        } catch (err: any) {
          console.warn('[ByteCave] Failed to get directory from relay:', err.message);
        }
      }

      this.setConnectionState('connected');
      console.log('[ByteCave] Client started', {
        peerId: this.node.peerId.toString(),
        relayPeers: bootstrapPeers.length,
        connectedPeers: connectedPeers.length,
        discoveredPeers: this.knownPeers.size
      });

    } catch (error) {
      this.setConnectionState('error');
      console.error('Failed to start ByteCave client:', error);
      throw error;
    }
  }

  /**
   * Stop the P2P client
   */
  async stop(): Promise<void> {
    if (!this.node) return;

    await this.node.stop();
    this.node = null;
    this.knownPeers.clear();
    this.setConnectionState('disconnected');
    console.log('ByteCave client stopped');
  }

  /**
   * Refresh peer directory from relay
   * This rediscovers nodes that may have reconnected or restarted
   */
  async refreshPeerDirectory(): Promise<void> {
    if (!this.node) {
      console.warn('[ByteCave] Cannot refresh - node not initialized');
      return;
    }

    const bootstrapPeers = [
      ...(this.config.directNodeAddrs || []),
      ...(this.config.relayPeers || [])
    ];

    console.log('[ByteCave] Refreshing peer directory from relays...');
    
    for (const relayAddr of bootstrapPeers) {
      try {
        // Extract relay peer ID from multiaddr
        const parts = relayAddr.split('/p2p/');
        if (parts.length < 2) continue;
        const relayPeerId = parts[parts.length - 1];
        
        const directory = await p2pProtocolClient.getPeerDirectoryFromRelay(relayPeerId);
        if (directory && directory.peers.length > 0) {
          console.log('[ByteCave] Refresh: Got', directory.peers.length, 'peers from relay directory');
          
          // Check each peer and reconnect if disconnected
          for (const peer of directory.peers) {
            const isConnected = this.node.getPeers().some(p => p.toString() === peer.peerId);
            const knownPeer = this.knownPeers.get(peer.peerId);
            
            if (!isConnected || !knownPeer) {
              console.log('[ByteCave] Refresh: Reconnecting to peer:', peer.peerId.slice(0, 12) + '...');
              
              // Try to dial using circuit relay multiaddr
              let connected = false;
              for (const addr of peer.multiaddrs) {
                try {
                  const ma = multiaddr(addr);
                  await this.node.dial(ma as any);
                  connected = true;
                  console.log('[ByteCave] Refresh: ✓ Reconnected via:', addr.slice(0, 60) + '...');
                  break;
                } catch (dialErr: any) {
                  console.debug('[ByteCave] Refresh: Failed to dial via', addr.slice(0, 50) + '...', dialErr.message);
                }
              }
              
              if (connected) {
                // Fetch health data
                try {
                  const health = await p2pProtocolClient.getHealthFromPeer(peer.peerId);
                  if (health) {
                    this.knownPeers.set(peer.peerId, {
                      peerId: peer.peerId,
                      publicKey: health.publicKey || '',
                      contentTypes: health.contentTypes || 'all',
                      connected: true,
                      nodeId: health.nodeId
                    });
                    console.log('[ByteCave] Refresh: ✓ Updated peer info:', health.nodeId || peer.peerId.slice(0, 12));
                  }
                } catch (err: any) {
                  console.warn('[ByteCave] Refresh: Failed to get health from peer:', peer.peerId.slice(0, 12), err.message);
                }
              }
            } else {
              console.debug('[ByteCave] Refresh: Peer already connected:', peer.peerId.slice(0, 12) + '...');
            }
          }
          
          break; // Successfully refreshed from one relay
        }
      } catch (err: any) {
        console.warn('[ByteCave] Refresh: Failed to get directory from relay:', err.message);
      }
    }
    
    console.log('[ByteCave] Refresh complete. Connected peers:', this.node.getPeers().length, 'Known peers:', this.knownPeers.size);
  }

  /**
   * Store data on the network
   * Uses getPeers() directly for fast peer access
   * 
   * @param data - Data to store
   * @param mimeType - MIME type (optional, defaults to 'application/octet-stream')
   * @param signer - Ethers signer for authorization (optional, but required for most nodes)
   */
  async store(data: Uint8Array | ArrayBuffer, mimeType?: string, signer?: any): Promise<StoreResult> {
    if (!this.node) {
      return { success: false, error: 'P2P node not initialized' };
    }

    // Get all connected peers (excluding relay)
    const allPeers = this.node.getPeers();
    const relayPeerIds = new Set(
      this.config.relayPeers?.map(addr => addr.split('/p2p/').pop()) || []
    );
    
    const connectedPeerIds = allPeers
      .map(p => p.toString())
      .filter(peerId => !relayPeerIds.has(peerId));
    
    console.log('[ByteCave] Store - connected storage peers:', connectedPeerIds.length);
    console.log('[ByteCave] Store - knownPeers with registration info:', this.knownPeers.size);
    
    if (connectedPeerIds.length === 0) {
      return { success: false, error: 'No storage peers available' };
    }
    
    // Prioritize registered peers from knownPeers (populated via floodsub announcements)
    // If no registered peers known yet, use all connected peers
    const registeredPeerIds = Array.from(this.knownPeers.values())
      .filter(p => p.isRegistered && connectedPeerIds.includes(p.peerId))
      .map(p => p.peerId);
    
    const storagePeerIds = registeredPeerIds.length > 0 
      ? [...registeredPeerIds, ...connectedPeerIds.filter(id => !registeredPeerIds.includes(id))]
      : connectedPeerIds;
    
    console.log('[ByteCave] Store - peer order (registered first):', 
      storagePeerIds.map(id => id.slice(0, 12)).join(', '),
      '(registered:', registeredPeerIds.length, ')');

    const dataArray = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    // Validate file size (5MB limit)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
    if (dataArray.length > MAX_FILE_SIZE) {
      const sizeMB = (dataArray.length / (1024 * 1024)).toFixed(2);
      return {
        success: false,
        error: `File size (${sizeMB}MB) exceeds maximum allowed size of 5MB`
      };
    }

    // Create authorization if signer is provided
    let authorization: any = undefined;
    if (signer) {
      try {
        // Import ethers dynamically to avoid bundling issues
        const { ethers } = await import('ethers');
        
        const sender = await signer.getAddress();
        const contentHash = ethers.keccak256(dataArray);
        const timestamp = Date.now();
        const nonce = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15);
        
        const message = `ByteCave Storage Request for:
Content Hash: ${contentHash}
App ID: ${this.config.appId}
Timestamp: ${timestamp}
Nonce: ${nonce}`;
        const signature = await signer.signMessage(message);
        
        authorization = {
          sender,
          signature,
          timestamp,
          nonce,
          contentHash,
          appId: this.config.appId
        };
        
        console.log('[ByteCave] Created authorization for storage request');
      } catch (err: any) {
        console.warn('[ByteCave] Failed to create authorization:', err.message);
      }
    }

    // Try each storage peer until one succeeds
    const errors: string[] = [];
    for (const peerId of storagePeerIds) {
      console.log('[ByteCave] Attempting P2P store to peer:', peerId.slice(0, 12) + '...');
      
      try {
        const result = await p2pProtocolClient.storeToPeer(
          peerId,
          dataArray,
          mimeType || 'application/octet-stream',
          authorization,
          false // shouldVerifyOnChain - false for browser test storage
        );

        if (result.success && result.cid) {
          console.log('[ByteCave] ✓ P2P store successful:', result.cid);
          return { 
            success: true, 
            cid: result.cid, 
            peerId 
          };
        }
        
        const errorMsg = `${peerId.slice(0, 12)}: ${result.error}`;
        console.warn('[ByteCave] ✗ P2P store failed:', errorMsg);
        errors.push(errorMsg);
      } catch (err: any) {
        const errorMsg = `${peerId.slice(0, 12)}: ${err.message}`;
        console.error('[ByteCave] ✗ P2P store exception:', errorMsg);
        errors.push(errorMsg);
      }
    }
    
    console.error('[ByteCave] All storage peers failed. Errors:', errors);
    return { success: false, error: `All storage peers failed: ${errors.join('; ')}` };
  }

  /**
   * Retrieve ciphertext from a node via P2P only (no HTTP fallback)
   */
  async retrieve(cid: string): Promise<RetrieveResult> {
    if (!this.node) {
      console.error('[ByteCave] Retrieve failed: P2P node not initialized');
      return { success: false, error: 'P2P node not initialized' };
    }

    const libp2pPeers = this.node.getPeers();
    console.log('[ByteCave] Retrieve - libp2p peers:', libp2pPeers.length);
    console.log('[ByteCave] Retrieve - known peers:', this.knownPeers.size);
    console.log('[ByteCave] Retrieve - node status:', this.node.status);
    
    if (libp2pPeers.length === 0) {
      console.warn('[ByteCave] Retrieve failed: No libp2p peers connected, but have', this.knownPeers.size, 'known peers');
      return { success: false, error: 'No connected peers available' };
    }

    // Find which peers have this CID
    const peersWithCid: string[] = [];
    
    for (const peerId of libp2pPeers) {
      const peerIdStr = peerId.toString();
      
      try {
        const hasCid = await p2pProtocolClient.peerHasCid(peerIdStr, cid);
        
        if (hasCid) {
          peersWithCid.push(peerIdStr);
        }
      } catch (error: any) {
        // Skip peers that don't support the protocol
      }
    }

    if (peersWithCid.length === 0) {
      return { success: false, error: 'Blob not found on any connected peer' };
    }

    // Try to retrieve from peers that have the CID
    for (const peerId of peersWithCid) {
      try {
        const timeoutPromise = new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Retrieval timeout after 10s')), 10000)
        );
        
        const result = await Promise.race([
          p2pProtocolClient.retrieveFromPeer(peerId, cid),
          timeoutPromise
        ]);
        
        if (result) {
          return { success: true, data: result.data, peerId };
        }
      } catch (error: any) {
        // Continue to next peer
      }
    }

    return { success: false, error: 'Failed to retrieve blob from peers that have it' };
  }

  /**
   * Register content in ContentRegistry contract (on-chain)
   * This must be called before storing content that requires on-chain verification
   */
  async registerContent(
    cid: string,
    appId: string,
    signer: ethers.Signer
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!this.config.contentRegistryAddress) {
      return { 
        success: false, 
        error: 'ContentRegistry address not configured' 
      };
    }

    if (!this.config.rpcUrl) {
      return { 
        success: false, 
        error: 'RPC URL not configured' 
      };
    }

    try {
      console.log('[ByteCave] Registering content in ContentRegistry:', { cid, appId });

      const contract = new ethers.Contract(
        this.config.contentRegistryAddress,
        CONTENT_REGISTRY_ABI,
        signer
      );

      const tx = await contract.registerContent(cid, appId);
      console.log('[ByteCave] ContentRegistry transaction sent:', tx.hash);

      const receipt = await tx.wait();
      console.log('[ByteCave] ContentRegistry registration confirmed:', receipt.hash);

      return { 
        success: true, 
        txHash: receipt.hash 
      };
    } catch (error: any) {
      console.error('[ByteCave] ContentRegistry registration failed:', error);
      return { 
        success: false, 
        error: error.message || 'Registration failed' 
      };
    }
  }

  /**
   * Check if content is registered in ContentRegistry
   */
  async isContentRegistered(cid: string): Promise<boolean> {
    if (!this.config.contentRegistryAddress || !this.config.rpcUrl) {
      return false;
    }

    try {
      const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      const contract = new ethers.Contract(
        this.config.contentRegistryAddress,
        CONTENT_REGISTRY_ABI,
        provider
      );

      return await contract.isContentRegistered(cid);
    } catch (error: any) {
      console.error('[ByteCave] Failed to check content registration:', error);
      return false;
    }
  }

  /**
   * Get list of known peers (includes both announced peers and connected libp2p peers)
   */
  async getPeers(): Promise<PeerInfo[]> {
    // Get the set of currently connected peer IDs
    const connectedPeerIds = new Set<string>();
    if (this.node) {
      const libp2pPeers = this.node.getPeers();
      console.log('[ByteCave] getPeers called - node exists:', !!this.node, 'libp2p peers:', libp2pPeers.length);
      for (const peerId of libp2pPeers) {
        connectedPeerIds.add(peerId.toString());
      }
    } else {
      console.log('[ByteCave] getPeers called - NO NODE!');
    }
    
    // Build result from known peers, marking connected status
    const result: PeerInfo[] = [];
    
    // Add all known peers with updated connected status
    for (const [peerIdStr, peer] of this.knownPeers) {
      result.push({
        ...peer,
        connected: connectedPeerIds.has(peerIdStr)
      });
      connectedPeerIds.delete(peerIdStr); // Remove so we don't add twice
    }
    
    // Add any connected peers not in knownPeers
    for (const peerIdStr of connectedPeerIds) {
      result.push({
        peerId: peerIdStr,
        publicKey: '',
        contentTypes: 'all',
        connected: true
      });
    }
    
    console.log('[ByteCave] getPeers - returning:', result.length, 'peers, connected:', result.filter(p => p.connected).length);
    return result;
  }

  /**
   * Get count of connected peers
   */
  getConnectedPeerCount(): number {
    return this.node ? this.node.getPeers().length : 0;
  }

  /**
   * Get node info from a peer via P2P stream (for registration)
   */
  async getNodeInfo(peerId: string): Promise<{ publicKey: string; ownerAddress?: string; peerId: string } | null> {
    try {
      const info = await p2pProtocolClient.getInfoFromPeer(peerId);
      return info;
    } catch (error: any) {
      console.warn('[ByteCave] Failed to get node info via P2P:', error.message);
      return null;
    }
  }

  /**
   * Get health info from a peer via P2P stream
   */
  async getNodeHealth(peerId: string): Promise<{
    status: string;
    blobCount: number;
    storageUsed: number;
    uptime: number;
  } | null> {
    try {
      // Check if we have relay addresses for this peer
      const peerInfo = this.knownPeers.get(peerId);
      const relayAddrs = (peerInfo as any)?.relayAddrs;
      
      // If we have relay addresses, dial through relay first
      if (relayAddrs && relayAddrs.length > 0 && this.node) {
        console.log('[ByteCave] Dialing peer through relay:', peerId.slice(0, 12), relayAddrs[0]);
        try {
          const ma = multiaddr(relayAddrs[0]);
          await this.node.dial(ma as any);
          console.log('[ByteCave] Successfully dialed peer through relay');
        } catch (dialError) {
          console.warn('[ByteCave] Failed to dial through relay:', dialError);
        }
      }
      
      const health = await p2pProtocolClient.getHealthFromPeer(peerId);
      return health;
    } catch (error: any) {
      console.warn('[ByteCave] Failed to get node health via P2P:', error.message);
      return null;
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Subscribe to events
   */
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event: string, callback: Function): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, data?: any): void {
    this.eventListeners.get(event)?.forEach(cb => cb(data));
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.emit('connectionStateChange', state);
  }

  private setupEventListeners(): void {
    if (!this.node) return;

    this.node.addEventListener('peer:connect', (event) => {
      const peerId = event.detail.toString();
      console.log('[ByteCave] Peer connected:', peerId, 'Total now:', this.node?.getPeers().length);
      this.emit('peerConnect', peerId);
    });

    this.node.addEventListener('peer:disconnect', (event) => {
      const peerId = event.detail.toString();
      console.log('[ByteCave] Peer disconnected:', peerId);
      console.log('[ByteCave] Remaining peers:', this.node?.getPeers().length);
      
      const peer = this.knownPeers.get(peerId);
      if (peer) {
        peer.connected = false;
      }
      this.emit('peerDisconnect', peerId);
    });
  }

  private async setupPubsub(): Promise<void> {
    if (!this.node) return;

    const pubsub = this.node.services.pubsub as any;
    if (!pubsub) return;

    // Subscribe to announcement topic
    pubsub.subscribe(ANNOUNCE_TOPIC);

    // Subscribe to our own signaling topic
    const mySignalingTopic = `${SIGNALING_TOPIC_PREFIX}${this.node.peerId.toString()}`;
    pubsub.subscribe(mySignalingTopic);

    pubsub.addEventListener('message', (event: any) => {
      const topic = event.detail.topic;
      console.log('[ByteCave] Received floodsub message on topic:', topic);

      if (topic === ANNOUNCE_TOPIC) {
        try {
          const data = toString(event.detail.data);
          const announcement = JSON.parse(data);
          console.log('[ByteCave] Received peer announcement:', announcement.peerId?.slice(0, 12));
          this.handlePeerAnnouncement(announcement);
        } catch (error) {
          console.warn('Failed to parse announcement:', error);
        }
      }

      if (topic === mySignalingTopic) {
        try {
          const data = toString(event.detail.data);
          const signal: SignalingMessage = JSON.parse(data);
          this.handleSignalingMessage(signal);
        } catch (error) {
          console.warn('Failed to parse signaling message:', error);
        }
      }
    });
  }

  private async handlePeerAnnouncement(announcement: {
    peerId: string;
    timestamp?: number;
    relayAddrs?: string[];
    contentTypes?: string[] | 'all';
  }): Promise<void> {
    console.log('[ByteCave] Received announcement from peer:', announcement.peerId.slice(0, 12), announcement);
    
    const existing = this.knownPeers.get(announcement.peerId);
    
    const peerInfo: PeerInfo = {
      peerId: announcement.peerId,
      publicKey: existing?.publicKey || '',
      contentTypes: announcement.contentTypes || 'all',
      connected: this.node?.getPeers().some(p => p.toString() === announcement.peerId) || false
    };

    // Preserve relay addresses from existing peer info if new announcement doesn't have them
    if (announcement.relayAddrs && announcement.relayAddrs.length > 0) {
      (peerInfo as any).relayAddrs = announcement.relayAddrs;
    } else if (existing && (existing as any).relayAddrs) {
      (peerInfo as any).relayAddrs = (existing as any).relayAddrs;
    }

    this.knownPeers.set(announcement.peerId, peerInfo);

    this.emit('peerAnnounce', peerInfo);
  }
  

  /**
   * Check if a nodeId is registered in the on-chain registry
   */
  private async checkNodeRegistration(nodeId: string): Promise<boolean> {
    if (!this.discovery) {
      // No contract configured - skip registration check
      return true;
    }
    
    try {
      const registeredNodes = await this.discovery.getActiveNodes();
      return registeredNodes.some(node => node.nodeId === nodeId);
    } catch (error) {
      console.warn('[ByteCave] Failed to check node registration:', error);
      return false;
    }
  }

  private handleSignalingMessage(signal: SignalingMessage): void {
    console.log('Received signaling message:', signal.type, 'from:', signal.from);
    this.emit('signaling', signal);
  }

  /**
   * Send signaling message to a peer for WebRTC negotiation
   */
  async sendSignalingMessage(targetPeerId: string, signal: Omit<SignalingMessage, 'from'>): Promise<void> {
    if (!this.node) return;

    const pubsub = this.node.services.pubsub as any;
    if (!pubsub) return;

    const targetTopic = `${SIGNALING_TOPIC_PREFIX}${targetPeerId}`;
    const message: SignalingMessage = {
      ...signal,
      from: this.node.peerId.toString()
    };

    try {
      await pubsub.publish(targetTopic, fromString(JSON.stringify(message)));
    } catch (error) {
      console.warn('Failed to send signaling message:', error);
    }
  }

  private findPeerForContentType(contentType: string): PeerInfo | null {
    // First pass: find registered peers that accept this content type
    for (const peer of this.knownPeers.values()) {
      if (!peer.connected) continue;
      if (!peer.isRegistered) continue; // Prefer registered nodes for storage
      if (peer.contentTypes === 'all') return peer;
      if (Array.isArray(peer.contentTypes) && peer.contentTypes.includes(contentType)) {
        return peer;
      }
    }
    
    // Second pass: fall back to any connected peer (for local-only storage)
    // This allows personal nodes to work, but data won't replicate
    for (const peer of this.knownPeers.values()) {
      if (!peer.connected) continue;
      if (peer.contentTypes === 'all') return peer;
      if (Array.isArray(peer.contentTypes) && peer.contentTypes.includes(contentType)) {
        console.warn('[ByteCave] No registered peers available, using unregistered peer. Data will NOT replicate.');
        return peer;
      }
    }
    return null;
  }


}
