/**
 * ByteCave Browser - P2P Protocol Client
 * 
 * Implements libp2p stream protocols for pure P2P communication from browser:
 * - /bytecave/blob/1.0.0 - Blob storage and retrieval
 * - /bytecave/health/1.0.0 - Health status
 * - /bytecave/info/1.0.0 - Node info (for registration)
 */

import { pipe } from 'it-pipe';
import type { Libp2p } from 'libp2p';
import * as lp from 'it-length-prefixed';

// Protocol identifiers - must match bytecave-core
export const PROTOCOL_BLOB = '/bytecave/blob/1.0.0';
export const PROTOCOL_HEALTH = '/bytecave/health/1.0.0';
export const PROTOCOL_INFO = '/bytecave/info/1.0.0';

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
  contentTypes: string[] | 'all';
  multiaddrs: string[];
}

export interface P2PInfoResponse {
  peerId: string;
  publicKey: string;
  ownerAddress?: string;
  version: string;
  contentTypes: string[] | 'all';
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
    if (!this.node) return null;

    try {
      const stream = await this.node.dialProtocol(peerId as any, PROTOCOL_HEALTH);

      await this.writeMessage(stream, {});
      const response = await this.readMessage<P2PHealthResponse>(stream);

      await stream.close();
      return response;

    } catch (error: any) {
      console.warn('[ByteCave P2P] Failed to get health from peer:', peerId, error.message);
      return null;
    }
  }

  /**
   * Get node info from a peer via P2P stream (for registration)
   */
  async getInfoFromPeer(peerId: string): Promise<P2PInfoResponse | null> {
    if (!this.node) return null;

    try {
      const stream = await this.node.dialProtocol(peerId as any, PROTOCOL_INFO);

      await this.writeMessage(stream, {});
      const response = await this.readMessage<P2PInfoResponse>(stream);

      await stream.close();
      return response;

    } catch (error: any) {
      console.warn('[ByteCave P2P] Failed to get info from peer:', peerId, error.message);
      return null;
    }
  }

  // Stream utilities
  private async readMessage<T>(stream: any): Promise<T | null> {
    try {
      const chunks: Uint8Array[] = [];

      for await (const chunk of pipe(stream.source, lp.decode)) {
        chunks.push(chunk.subarray());
        break; // Only read first message
      }

      if (chunks.length === 0) return null;

      const data = new TextDecoder().decode(chunks[0]);
      return JSON.parse(data) as T;

    } catch (error: any) {
      console.debug('[ByteCave P2P] Failed to read message:', error.message);
      return null;
    }
  }

  private async writeMessage(stream: any, message: any): Promise<void> {
    const data = new TextEncoder().encode(JSON.stringify(message));

    await pipe(
      [data],
      lp.encode,
      stream.sink
    );
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
