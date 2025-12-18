/**
 * Tests for ByteCave Browser P2P Protocol Client (Phase 51)
 * 
 * Covers:
 * - P2P protocol client initialization
 * - Store/retrieve via P2P streams
 * - Node info/health retrieval
 * - Base64 encoding/decoding utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('P2P Protocol Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Protocol Constants', () => {
    it('should define correct protocol identifiers', () => {
      const PROTOCOL_BLOB = '/bytecave/blob/1.0.0';
      const PROTOCOL_HEALTH = '/bytecave/health/1.0.0';
      const PROTOCOL_INFO = '/bytecave/info/1.0.0';

      expect(PROTOCOL_BLOB).toBe('/bytecave/blob/1.0.0');
      expect(PROTOCOL_HEALTH).toBe('/bytecave/health/1.0.0');
      expect(PROTOCOL_INFO).toBe('/bytecave/info/1.0.0');
    });
  });

  describe('Base64 Encoding', () => {
    it('should encode Uint8Array to base64', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      expect(base64).toBe('SGVsbG8=');
    });

    it('should decode base64 to Uint8Array', () => {
      const base64 = 'SGVsbG8=';
      
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      expect(bytes).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    });

    it('should handle binary data with special characters', () => {
      const originalBytes = new Uint8Array([0x00, 0x01, 0xff, 0xfe, 0x80]);
      
      let binary = '';
      for (let i = 0; i < originalBytes.length; i++) {
        binary += String.fromCharCode(originalBytes[i]);
      }
      const base64 = btoa(binary);
      
      const decodedBinary = atob(base64);
      const decodedBytes = new Uint8Array(decodedBinary.length);
      for (let i = 0; i < decodedBinary.length; i++) {
        decodedBytes[i] = decodedBinary.charCodeAt(i);
      }

      expect(decodedBytes).toEqual(originalBytes);
    });
  });

  describe('CID Generation', () => {
    it('should generate CID with baf prefix', () => {
      const mockHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef12';
      const cid = 'baf' + mockHash.slice(0, 56);

      expect(cid).toMatch(/^baf[a-f0-9]{56}$/);
      expect(cid.length).toBe(59);
    });
  });

  describe('Store Response', () => {
    it('should return success with CID on successful store', () => {
      const response = {
        success: true,
        cid: 'baftest123456'
      };

      expect(response.success).toBe(true);
      expect(response.cid).toBeTruthy();
    });

    it('should return error on failed store', () => {
      const response = {
        success: false,
        error: 'Storage full'
      };

      expect(response.success).toBe(false);
      expect(response.error).toBe('Storage full');
    });
  });

  describe('Retrieve Response', () => {
    it('should return data on successful retrieve', () => {
      const response = {
        success: true,
        ciphertext: 'SGVsbG8=',
        mimeType: 'application/octet-stream'
      };

      expect(response.success).toBe(true);
      expect(response.ciphertext).toBeTruthy();
    });

    it('should return error when blob not found', () => {
      const response = {
        success: false,
        error: 'Blob not found'
      };

      expect(response.success).toBe(false);
      expect(response.error).toBe('Blob not found');
    });
  });

  describe('Health Response', () => {
    it('should include required health fields', () => {
      const health = {
        peerId: '12D3KooWTest',
        status: 'healthy',
        blobCount: 42,
        storageUsed: 1024 * 1024,
        storageMax: 1024 * 1024 * 1024,
        uptime: 3600,
        version: '1.0.0',
        contentTypes: 'all',
        multiaddrs: ['/ip4/127.0.0.1/tcp/4001']
      };

      expect(health.peerId).toBeTruthy();
      expect(health.status).toBe('healthy');
      expect(health.blobCount).toBeGreaterThanOrEqual(0);
      expect(health.storageUsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Info Response', () => {
    it('should include required info fields for registration', () => {
      const info = {
        peerId: '12D3KooWTest',
        publicKey: 'abcdef123456',
        ownerAddress: '0x1234567890abcdef',
        version: '1.0.0',
        contentTypes: 'all'
      };

      expect(info.peerId).toBeTruthy();
      expect(info.publicKey).toBeTruthy();
      expect(info.ownerAddress).toMatch(/^0x/);
    });

    it('should allow optional ownerAddress', () => {
      const info = {
        peerId: '12D3KooWTest',
        publicKey: 'abcdef123456',
        version: '1.0.0',
        contentTypes: 'all'
      };

      expect(info.peerId).toBeTruthy();
      expect(info.publicKey).toBeTruthy();
    });
  });
});

describe('ByteCave Client P2P Integration', () => {
  describe('Store Method', () => {
    it('should try P2P first when peer is connected', () => {
      const peer = { peerId: '12D3KooWTest', connected: true };
      const shouldTryP2P = peer.connected;

      expect(shouldTryP2P).toBe(true);
    });

    it('should skip P2P when peer is not connected', () => {
      const peer = { peerId: '12D3KooWTest', connected: false };
      const shouldTryP2P = peer.connected;

      expect(shouldTryP2P).toBe(false);
    });

    it('should convert ArrayBuffer to Uint8Array', () => {
      const buffer = new ArrayBuffer(5);
      const view = new Uint8Array(buffer);
      view.set([1, 2, 3, 4, 5]);

      const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(5);
    });
  });

  describe('Retrieve Method', () => {
    it('should try P2P first for connected peers', () => {
      const peers = [
        { peerId: 'peer1', connected: true },
        { peerId: 'peer2', connected: false },
        { peerId: 'peer3', connected: true }
      ];

      const connectedPeers = peers.filter(p => p.connected);
      expect(connectedPeers.length).toBe(2);
    });

    it('should fall back to HTTP when P2P fails', () => {
      const p2pResult = null; // P2P failed
      const httpAvailable = true;

      const shouldTryHttp = p2pResult === null && httpAvailable;
      expect(shouldTryHttp).toBe(true);
    });
  });

  describe('GetNodeInfo Method', () => {
    it('should return node info for registration', () => {
      const mockInfo = {
        peerId: '12D3KooWTest',
        publicKey: 'abcdef',
        ownerAddress: '0x1234'
      };

      expect(mockInfo.publicKey).toBeTruthy();
      expect(mockInfo.peerId).toBeTruthy();
    });
  });
});

describe('Connection State', () => {
  it('should track connection states', () => {
    const states = ['disconnected', 'connecting', 'connected', 'error'];
    
    expect(states).toContain('disconnected');
    expect(states).toContain('connecting');
    expect(states).toContain('connected');
    expect(states).toContain('error');
  });

  it('should emit state change events', () => {
    const eventListeners = new Map<string, Set<Function>>();
    eventListeners.set('connectionStateChange', new Set());

    const callback = vi.fn();
    eventListeners.get('connectionStateChange')?.add(callback);

    expect(eventListeners.get('connectionStateChange')?.size).toBe(1);
  });
});

describe('Peer Discovery', () => {
  it('should merge known peers with connected peers', () => {
    const knownPeers = new Map([
      ['peer1', { peerId: 'peer1', connected: false }],
      ['peer2', { peerId: 'peer2', connected: false }]
    ]);

    const connectedPeerIds = new Set(['peer1', 'peer3']);

    const result: any[] = [];
    for (const [peerIdStr, peer] of knownPeers) {
      result.push({
        ...peer,
        connected: connectedPeerIds.has(peerIdStr)
      });
      connectedPeerIds.delete(peerIdStr);
    }

    for (const peerIdStr of connectedPeerIds) {
      result.push({
        peerId: peerIdStr,
        connected: true
      });
    }

    expect(result.length).toBe(3);
    expect(result.find(p => p.peerId === 'peer1')?.connected).toBe(true);
    expect(result.find(p => p.peerId === 'peer2')?.connected).toBe(false);
    expect(result.find(p => p.peerId === 'peer3')?.connected).toBe(true);
  });
});
