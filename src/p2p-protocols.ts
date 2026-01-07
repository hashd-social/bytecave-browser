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

export interface StoreRequest {
  cid: string;
  mimeType: string;
  ciphertext: string; // base64 encoded
  contentType?: string;
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
    contentType?: string
  ): Promise<StoreResponse> {
    if (!this.node) {
      return { success: false, error: 'P2P node not initialized' };
    }

    try {
      // Use the replicate protocol for storing (same format)
      const stream = await this.node.dialProtocol(peerId as any, '/bytecave/replicate/1.0.0');

      // Generate CID client-side (simplified - in production use proper CID generation)
      const dataBuffer = new Uint8Array(ciphertext).buffer as ArrayBuffer;
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const cid = 'baf' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 56);

      const request: StoreRequest = {
        cid,
        mimeType,
        ciphertext: this.uint8ArrayToBase64(ciphertext),
        contentType
      };

      await this.writeMessage(stream, request);
      const response = await this.readMessage<StoreResponse>(stream);

      await stream.close();

      if (response?.success) {
        return { success: true, cid };
      } else {
        return { success: false, error: response?.error || 'Store failed' };
      }

    } catch (error: any) {
      console.warn('[ByteCave P2P] Failed to store to peer:', peerId, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Retrieve a blob from a peer via P2P stream
   */
  async retrieveFromPeer(peerId: string, cid: string): Promise<{ data: Uint8Array; mimeType: string } | null> {
    if (!this.node) return null;

    try {
      const stream = await this.node.dialProtocol(peerId as any, PROTOCOL_BLOB);

      await this.writeMessage(stream, { cid });
      const response = await this.readMessage<BlobResponse>(stream);

      await stream.close();

      if (response?.success && response.ciphertext) {
        return {
          data: this.base64ToUint8Array(response.ciphertext),
          mimeType: response.mimeType || 'application/octet-stream'
        };
      }

      return null;

    } catch (error: any) {
      console.warn('[ByteCave P2P] Failed to retrieve from peer:', peerId, error.message);
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
      console.log(`[ByteCave P2P] Dialing health protocol for peer ${peerId.slice(0, 12)}...`);
      
      // Convert string peerId to PeerId object
      const peerIdObj = peerIdFromString(peerId);
      
      console.log(`[ByteCave P2P] Opening stream to peer ${peerId.slice(0, 12)}...`);
      const stream = await this.node.dialProtocol(peerIdObj, PROTOCOL_HEALTH);
      console.log(`[ByteCave P2P] Health protocol stream opened for ${peerId.slice(0, 12)}`);

      await this.writeMessage(stream, {});
      console.log(`[ByteCave P2P] Health request sent to ${peerId.slice(0, 12)}`);
      
      const response = await this.readMessage<P2PHealthResponse>(stream);
      
      if (response) {
        console.log(`[ByteCave P2P] Health response received from ${peerId.slice(0, 12)}:`, JSON.stringify(response, null, 2));
      }
      
      await stream.close();
      return response;

    } catch (error: any) {
      console.error('[ByteCave P2P] Failed to get health from peer:', peerId.slice(0, 12), error);
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

  // Stream utilities - custom length-prefixed encoding
  private async readMessage<T>(stream: any): Promise<T | null> {
    try {
      // Read length prefix (4 bytes, big-endian)
      const lengthBytes = new Uint8Array(4);
      let bytesRead = 0;
      
      // Stream is AsyncIterable itself, not stream.source
      for await (const chunk of stream) {
        const chunkArray = chunk instanceof Uint8Array ? chunk : chunk.subarray();
        const bytesToCopy = Math.min(4 - bytesRead, chunkArray.length);
        lengthBytes.set(chunkArray.subarray(0, bytesToCopy), bytesRead);
        bytesRead += bytesToCopy;
        
        if (bytesRead >= 4) {
          // Read message length
          const length = new DataView(lengthBytes.buffer).getUint32(0, false);
          
          // Read message data
          const messageBytes = new Uint8Array(length);
          let messageBytesRead = 0;
          
          // Copy remaining bytes from first chunk
          if (chunkArray.length > bytesToCopy) {
            const remainingBytes = chunkArray.subarray(bytesToCopy);
            const copyLength = Math.min(remainingBytes.length, length);
            messageBytes.set(remainingBytes.subarray(0, copyLength), 0);
            messageBytesRead = copyLength;
          }
          
          // Read more chunks if needed
          if (messageBytesRead < length) {
            for await (const nextChunk of stream) {
              const nextArray = nextChunk instanceof Uint8Array ? nextChunk : nextChunk.subarray();
              const copyLength = Math.min(nextArray.length, length - messageBytesRead);
              messageBytes.set(nextArray.subarray(0, copyLength), messageBytesRead);
              messageBytesRead += copyLength;
              if (messageBytesRead >= length) break;
            }
          }
          
          const data = new TextDecoder().decode(messageBytes);
          return JSON.parse(data) as T;
        }
      }

      return null;
    } catch (error: any) {
      console.error('[ByteCave P2P] Failed to read message:', error);
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
    
    // Write to stream using send() method
    const needsDrain = !stream.send(combined);
    
    // If send returned false, wait for drain event
    if (needsDrain) {
      await stream.onDrain();
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
