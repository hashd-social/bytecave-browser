/**
 * ByteCave Browser - P2P Protocol Client
 * 
 * Implements libp2p stream protocols for pure P2P communication from browser:
 * - /bytecave/blob/1.0.0 - Blob storage and retrieval
 * - /bytecave/health/1.0.0 - Health status
 * - /bytecave/info/1.0.0 - Node info (for registration)
 */

import { Libp2p } from 'libp2p';
import type { Stream } from '@libp2p/interface';
import { fromString, toString } from 'uint8arrays';
import { peerIdFromString } from '@libp2p/peer-id';

// Protocol identifiers - must match bytecave-core
export const PROTOCOL_BLOB = '/bytecave/blob/1.0.0';
export const PROTOCOL_HEALTH = '/bytecave/health/1.0.0';
export const PROTOCOL_INFO = '/bytecave/info/1.0.0';
export const PROTOCOL_PEER_DIRECTORY = '/bytecave/relay/peers/1.0.0';
export const PROTOCOL_HAVE_LIST = '/bytecave/have-list/1.0.0';

// Response types
export interface BlobResponse {
  success: boolean;
  ciphertext?: string; // base64 encoded
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
  ciphertext: string; // base64 encoded
  appId?: string;
  shouldVerifyOnChain?: boolean;
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
export class P2PProtocolClient {
  private node: Libp2p | null = null;

  setNode(node: Libp2p): void {
    this.node = node;
  }

  /**
   * Store a blob on a peer via P2P stream
   */
  async storeToPeer(
    peerId: string,
    ciphertext: Uint8Array,
    mimeType: string,
    authorization?: any,
    shouldVerifyOnChain?: boolean
  ): Promise<StoreResponse> {
    if (!this.node) {
      return { success: false, error: 'P2P node not initialized' };
    }

    try {
      // Convert string peerId to PeerId object
      const peerIdObj = peerIdFromString(peerId);
      
      // Calculate timeout based on file size (30s base + 10s per MB)
      const fileSizeMB = ciphertext.length / (1024 * 1024);
      const timeoutMs = 30000 + (fileSizeMB * 10000);
      
      console.log(`[ByteCave P2P] Store timeout: ${Math.round(timeoutMs / 1000)}s for ${fileSizeMB.toFixed(2)}MB`);
      
      // Wrap the entire operation in a timeout
      const storePromise = (async () => {
        console.log('[ByteCave P2P] Step 1: Dialing store protocol...');
        // Use the store protocol for browser-to-node storage (with authorization)
        const stream = await this.node!.dialProtocol(peerIdObj, '/bytecave/store/1.0.0');
        console.log('[ByteCave P2P] Step 2: Stream established');

        // Generate CID using SHA-256 (matches bytecave-core format: 64-char hex)
        const dataCopy = new Uint8Array(ciphertext);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataCopy);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const cid = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('[ByteCave P2P] Step 3: CID generated:', cid.slice(0, 16) + '...');

        const request: StoreRequest = {
          cid,
          mimeType,
          ciphertext: this.uint8ArrayToBase64(ciphertext),
          appId: authorization?.appId || 'hashd',
          shouldVerifyOnChain: shouldVerifyOnChain ?? false,
          sender: authorization?.sender,
          timestamp: authorization?.timestamp || Date.now(),
          authorization
        };
        console.log('[ByteCave P2P] Step 4: Request prepared, size:', JSON.stringify(request).length, 'bytes');

        console.log('[ByteCave P2P] Step 5: Writing message to stream...');
        await this.writeMessage(stream, request);
        console.log('[ByteCave P2P] Step 6: Message written, waiting for response...');
        const response = await this.readMessage<StoreResponse>(stream);
        console.log('[ByteCave P2P] Step 7: Response received:', response);

        await stream.close();

        if (response?.success) {
          return { success: true, cid };
        } else {
          return { success: false, error: response?.error || 'Store failed' };
        }
      })();

      // Race between store operation and timeout
      const timeoutPromise = new Promise<StoreResponse>((_, reject) => {
        setTimeout(() => reject(new Error(`Store timeout after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
      });

      return await Promise.race([storePromise, timeoutPromise]);

    } catch (error: any) {
      console.warn('[ByteCave P2P] Failed to store to peer:', peerId, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Retrieve a blob from a peer via P2P stream
   */
  async retrieveFromPeer(peerId: string, cid: string): Promise<{ data: Uint8Array; mimeType: string } | null> {
    if (!this.node) {
      return null;
    }

    try {
      const peerIdObj = peerIdFromString(peerId);
      const stream = await this.node.dialProtocol(peerIdObj, PROTOCOL_BLOB);

      const request = { cid };
      await this.writeMessage(stream, request);
      
      const response = await this.readMessage<BlobResponse>(stream);

      // Close stream (may already be closed by server)
      try {
        await stream.close();
      } catch {
        // Stream may already be closed by server
      }

      if (response?.success && response.ciphertext) {
        const data = this.base64ToUint8Array(response.ciphertext);
        return {
          data,
          mimeType: response.mimeType || 'application/octet-stream'
        };
      }

      return null;

    } catch (error: any) {
      // Suppress expected errors
      if (error.name !== 'StreamResetError' && error.code !== 'ERR_STREAM_RESET') {
        console.error('[ByteCave P2P] Retrieve error:', error);
      }
      return null;
    }
  }

  /**
   * Get health info from a peer via P2P stream
   */
  async getHealthFromPeer(peerId: string): Promise<P2PHealthResponse | null> {
    if (!this.node) {
      console.warn('[ByteCave P2P] No node available for health request');
      return null;
    }

    try {
      
      // Convert string peerId to PeerId object
      const peerIdObj = peerIdFromString(peerId);
      

      const stream = await this.node.dialProtocol(peerIdObj, PROTOCOL_HEALTH);

      await this.writeMessage(stream, {});
      
      const response = await this.readMessage<P2PHealthResponse>(stream);
      
      await stream.close();
      return response;

    } catch (error: any) {
      // console.error('[ByteCave P2P] Failed to get health from peer:', peerId.slice(0, 12), error);
      return null;
    }
  }

  /**
   * Query relay for peer directory
   */
  async getPeerDirectoryFromRelay(relayPeerId: string): Promise<PeerDirectoryResponse | null> {
    if (!this.node) {
      console.warn('[ByteCave P2P] No node available for peer directory request');
      return null;
    }

    try {
      console.log('[ByteCave P2P] Querying relay for peer directory:', relayPeerId.slice(0, 12) + '...');
      
      const peerIdObj = peerIdFromString(relayPeerId);
      const stream = await this.node.dialProtocol(peerIdObj, PROTOCOL_PEER_DIRECTORY);
      
      // Relay sends response immediately, just read it
      const response = await this.readMessage<PeerDirectoryResponse>(stream);
      
      await stream.close();
      
      if (response) {
        console.log('[ByteCave P2P] Received peer directory:', response.peers.length, 'peers');
      }
      
      return response;

    } catch (error: any) {
      console.warn('[ByteCave P2P] Failed to get peer directory from relay:', relayPeerId.slice(0, 12), error.message);
      return null;
    }
  }

  /**
   * Get node info from a peer via P2P stream (for registration)
   */
  async getInfoFromPeer(peerId: string): Promise<P2PInfoResponse | null> {
    if (!this.node) return null;

    try {
      // Convert string peerId to PeerId object
      const peerIdObj = peerIdFromString(peerId);
      
      const stream = await this.node.dialProtocol(peerIdObj, PROTOCOL_INFO);

      await this.writeMessage(stream, {});
      const response = await this.readMessage<P2PInfoResponse>(stream);

      await stream.close();
      return response;

    } catch (error: any) {
      console.warn('[ByteCave P2P] Failed to get info from peer:', peerId, error.message);
      return null;
    }
  }

  /**
   * Check if a peer has a specific CID
   */
  async peerHasCid(peerId: string, cid: string): Promise<boolean> {
    if (!this.node) {
      return false;
    }

    try {
      const peerIdObj = peerIdFromString(peerId);
      const stream = await this.node.dialProtocol(peerIdObj, PROTOCOL_HAVE_LIST);

      const request = { cids: [cid] };
      await this.writeMessage(stream, request);
      
      const response = await this.readMessage<HaveListResponse>(stream);

      await stream.close();

      return response?.cids?.includes(cid) || false;
    } catch (error: any) {
      return false;
    }
  }

  // Stream utilities - custom length-prefixed encoding
  private async readMessage<T>(stream: any): Promise<T | null> {
    try {
      let firstChunk = true;
      let length = 0;
      let messageBytes: Uint8Array | null = null;
      let messageBytesRead = 0;
      
      for await (const chunk of stream) {
        const array = chunk instanceof Uint8Array ? chunk : chunk.subarray();
        
        if (firstChunk && array.length >= 4) {
          // Read length prefix (4 bytes, big-endian)
          length = new DataView(array.buffer, array.byteOffset, array.byteLength).getUint32(0, false);
          
          // Allocate buffer for message
          messageBytes = new Uint8Array(length);
          
          // Copy remaining bytes from first chunk (after length prefix)
          if (array.length > 4) {
            const copyLength = Math.min(array.length - 4, length);
            messageBytes.set(array.subarray(4, 4 + copyLength), 0);
            messageBytesRead = copyLength;
          }
          
          firstChunk = false;
          
          // If we got the complete message in the first chunk, break immediately
          if (messageBytesRead >= length) {
            break;
          }
        } else if (!firstChunk && messageBytes) {
          // Continue reading subsequent chunks
          const copyLength = Math.min(array.length, length - messageBytesRead);
          messageBytes.set(array.subarray(0, copyLength), messageBytesRead);
          messageBytesRead += copyLength;
          
          // Break as soon as we have the complete message
          if (messageBytesRead >= length) {
            break;
          }
        }
      }
      
      if (messageBytes && messageBytesRead === length) {
        const data = new TextDecoder().decode(messageBytes);
        return JSON.parse(data) as T;
      }

      return null;
    } catch (error: any) {
      // Only log if it's not a stream reset error (which is expected when we close the stream)
      if (error.name !== 'StreamResetError' && error.code !== 'ERR_STREAM_RESET') {
        console.error('[ByteCave P2P] Failed to read message:', error);
      }
      return null;
    }
  }

  private async writeMessage(stream: any, message: any): Promise<void> {
    const data = new TextEncoder().encode(JSON.stringify(message));
    
    // Create length prefix (4 bytes, big-endian)
    const lengthPrefix = new Uint8Array(4);
    new DataView(lengthPrefix.buffer).setUint32(0, data.length, false);
    
    // Combine length prefix and data
    const combined = new Uint8Array(lengthPrefix.length + data.length);
    combined.set(lengthPrefix, 0);
    combined.set(data, lengthPrefix.length);
    
    // For large messages (>64KB), send in chunks to avoid buffer overflow
    const CHUNK_SIZE = 65536; // 64KB chunks
    if (combined.length > CHUNK_SIZE) {
      console.log(`[ByteCave P2P] Sending large message in chunks: ${combined.length} bytes`);
      
      for (let offset = 0; offset < combined.length; offset += CHUNK_SIZE) {
        const chunk = combined.subarray(offset, Math.min(offset + CHUNK_SIZE, combined.length));
        const needsDrain = !stream.send(chunk);
        
        if (needsDrain) {
          await stream.onDrain();
        }
        
        // Small delay between chunks to prevent overwhelming the stream
        if (offset + CHUNK_SIZE < combined.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } else {
      // Small message, send all at once
      const needsDrain = !stream.send(combined);
      
      if (needsDrain) {
        await stream.onDrain();
      }
    }
  }

  // Base64 utilities for browser
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

export const p2pProtocolClient = new P2PProtocolClient();
