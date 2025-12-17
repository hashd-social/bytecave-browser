/**
 * ByteCave Browser Client
 * 
 * WebRTC P2P client for connecting browsers directly to ByteCave storage nodes.
 */

import { createLibp2p, Libp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { bootstrap } from '@libp2p/bootstrap';
import { multiaddr } from '@multiformats/multiaddr';
import { fromString, toString } from 'uint8arrays';
import { ContractDiscovery } from './discovery.js';
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
  private discovery: ContractDiscovery;
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
    this.discovery = new ContractDiscovery(config.contractAddress, config.rpcUrl);
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

      // If we have a WebSocket bootstrap URL, use it directly
      if (this.config.bootstrapWebSocket) {
        console.log('[ByteCave] Using configured bootstrap WebSocket:', this.config.bootstrapWebSocket);
        bootstrapPeers.push(this.config.bootstrapWebSocket);
      }

      // Try seed nodes first (before contract lookup - allows discovery without registration)
      if (this.config.seedNodes && this.config.seedNodes.length > 0) {
        console.log('[ByteCave] Fetching multiaddrs from seed nodes:', this.config.seedNodes);
        for (const seedUrl of this.config.seedNodes) {
          const wsAddrs = await this.fetchNodeMultiaddrs(seedUrl);
          bootstrapPeers.push(...wsAddrs);
        }
      }

      // Also try registered nodes from contract
      console.log('[ByteCave] Fetching registered nodes from contract...');
      const registeredNodes = await this.discovery.getActiveNodes();
      console.log('[ByteCave] Found', registeredNodes.length, 'registered nodes');

      // Fetch WebSocket multiaddrs from registered nodes for bootstrapping
      for (const node of registeredNodes.slice(0, 3)) {
        console.log('[ByteCave] Fetching multiaddrs from registered node:', node.url);
        const wsAddrs = await this.fetchNodeMultiaddrs(node.url);
        bootstrapPeers.push(...wsAddrs);
      }

      // Deduplicate
      const uniquePeers = [...new Set(bootstrapPeers)];
      console.log('[ByteCave] Bootstrap peers:', uniquePeers);

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
          pubsub: gossipsub({
            emitSelf: false,
            allowPublishToZeroTopicPeers: true
          })
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

      // Manually dial bootstrap peers - only try localhost addresses to avoid timeout
      const localAddrs = uniquePeers.filter(addr => 
        addr.includes('127.0.0.1') || addr.includes('localhost')
      );
      console.log('[ByteCave] Attempting to dial local addresses:', localAddrs);
      
      for (const addr of localAddrs.slice(0, 3)) { // Only try first 3 to avoid long waits
        try {
          console.log('[ByteCave] Dialing:', addr);
          const ma = multiaddr(addr);
          const connection = await this.node.dial(ma as any);
          console.log('[ByteCave] ✓ Connected to:', addr, 'remotePeer:', connection.remotePeer.toString());
        } catch (err: any) {
          console.error('[ByteCave] ✗ Failed to dial:', addr, 'Error:', err.message || err);
        }
      }

      const connectedPeers = this.node.getPeers();
      console.log('[ByteCave] Connected peers after dial:', connectedPeers.length, connectedPeers.map(p => p.toString()));

      this.setConnectionState('connected');
      console.log('[ByteCave] Client started', {
        peerId: this.node.peerId.toString(),
        registeredNodes: registeredNodes.length,
        connectedPeers: connectedPeers.length
      });

      // Try to connect to registered nodes via HTTP discovery
      for (const node of registeredNodes.slice(0, this.config.maxPeers)) {
        this.tryConnectToNode(node.url);
      }

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
   * Store ciphertext on a node
   */
  async store(data: Uint8Array, contentType: string = 'messages'): Promise<StoreResult> {
    // Find a peer that accepts this content type
    const peer = this.findPeerForContentType(contentType);
    
    if (!peer) {
      return { success: false, error: 'No available peers for content type: ' + contentType };
    }

    try {
      // For now, fall back to HTTP until WebRTC streams are fully implemented
      // This will be replaced with direct WebRTC DataChannel communication
      const httpEndpoint = this.getHttpEndpoint(peer.peerId);
      if (!httpEndpoint) {
        return { success: false, error: 'No HTTP endpoint for peer' };
      }

      const response = await fetch(`${httpEndpoint}/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: data as BodyInit
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const result = await response.json();
      return { 
        success: true, 
        cid: result.cid, 
        peerId: peer.peerId 
      };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Retrieve ciphertext from a node
   */
  async retrieve(cid: string): Promise<RetrieveResult> {
    // Try each known peer until we find the blob
    for (const peer of this.knownPeers.values()) {
      if (!peer.connected) continue;

      try {
        const httpEndpoint = this.getHttpEndpoint(peer.peerId);
        if (!httpEndpoint) continue;

        const response = await fetch(`${httpEndpoint}/blobs/${cid}`);
        
        if (response.ok) {
          const data = new Uint8Array(await response.arrayBuffer());
          return { success: true, data, peerId: peer.peerId };
        }
      } catch (error) {
        // Try next peer
      }
    }

    return { success: false, error: 'Blob not found on any peer' };
  }

  /**
   * Get list of known peers (includes both announced peers and connected libp2p peers)
   */
  getPeers(): PeerInfo[] {
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

      if (topic === ANNOUNCE_TOPIC) {
        try {
          const data = toString(event.detail.data);
          const announcement = JSON.parse(data);
          this.handleAnnouncement(announcement);
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

  private async handleAnnouncement(announcement: {
    peerId: string;
    httpEndpoint?: string;
    contentTypes: string[] | 'all';
  }): Promise<void> {
    const existing = this.knownPeers.get(announcement.peerId);
    
    // Check if this peer is registered on-chain
    let isRegistered = existing?.isRegistered || false;
    if (announcement.httpEndpoint && !existing?.isRegistered) {
      isRegistered = await this.checkPeerRegistration(announcement.httpEndpoint);
    }
    
    const peerInfo: PeerInfo = {
      peerId: announcement.peerId,
      publicKey: existing?.publicKey || '',
      contentTypes: announcement.contentTypes,
      connected: this.node?.getPeers().some(p => p.toString() === announcement.peerId) || false,
      isRegistered,
      httpUrl: announcement.httpEndpoint
    };

    this.knownPeers.set(announcement.peerId, peerInfo);
    
    // Store HTTP endpoint separately for fallback
    if (announcement.httpEndpoint) {
      (peerInfo as any).httpEndpoint = announcement.httpEndpoint;
    }

    this.emit('peerAnnounce', peerInfo);
  }
  
  /**
   * Check if a peer's URL is registered in the on-chain registry
   */
  private async checkPeerRegistration(httpUrl: string): Promise<boolean> {
    try {
      const registeredNodes = await this.discovery.getActiveNodes();
      return registeredNodes.some(node => node.url === httpUrl);
    } catch (error) {
      console.warn('[ByteCave] Failed to check peer registration:', error);
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

  private getHttpEndpoint(peerId: string): string | null {
    const peer = this.knownPeers.get(peerId) as any;
    return peer?.httpEndpoint || null;
  }

  /**
   * Fetch WebSocket multiaddrs from a node's HTTP health endpoint
   */
  private async fetchNodeMultiaddrs(url: string): Promise<string[]> {
    try {
      console.log('[ByteCave] Fetching multiaddrs from:', url);
      const response = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const health = await response.json();
        if (health.multiaddrs && Array.isArray(health.multiaddrs)) {
          // Find WebSocket addresses for browser connectivity
          const wsAddrs = health.multiaddrs.filter((addr: string) => 
            addr.includes('/ws/') || addr.includes('/wss/')
          );
          console.log('[ByteCave] Found WebSocket addrs from', url, ':', wsAddrs);
          return wsAddrs;
        }
      }
    } catch (error) {
      console.warn('[ByteCave] Failed to fetch multiaddrs from', url, ':', error);
    }
    return [];
  }

  private async tryConnectToNode(url: string): Promise<void> {
    // Try to get peer info from HTTP endpoint
    try {
      const response = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const health = await response.json();
        if (health.peerId) {
          const peerInfo: PeerInfo = {
            peerId: health.peerId,
            publicKey: health.publicKey || '',
            contentTypes: 'all',
            connected: false
          };
          (peerInfo as any).httpEndpoint = url;
          this.knownPeers.set(health.peerId, peerInfo);
          this.emit('peerDiscovered', peerInfo);
        }
      }
    } catch (error) {
      // Node not reachable via HTTP
    }
  }
}
