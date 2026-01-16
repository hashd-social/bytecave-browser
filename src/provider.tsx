/**
 * React Context Provider for ByteCave Client
 * 
 * Provides P2P connectivity state and methods to React components
 */

import React, { createContext, useContext, ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { ByteCaveClient } from './client.js';
import type { ByteCaveConfig, PeerInfo, ConnectionState, StoreResult, RetrieveResult } from './types.js';

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
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  store: (data: Uint8Array, contentType?: string, signer?: any) => Promise<StoreResult>;
  retrieve: (cid: string) => Promise<RetrieveResult>;
  getNodeHealth: (peerId: string) => Promise<NodeHealth | null>;
  error: string | null;
}

const ByteCaveContext = createContext<ByteCaveContextValue | null>(null);

interface ByteCaveProviderProps {
  children: ReactNode;
  contractAddress: string;
  rpcUrl: string;
  relayPeers?: string[];
  directNodeAddrs?: string[];
}

let globalClient: ByteCaveClient | null = null;

export function ByteCaveProvider({ 
  children, 
  contractAddress, 
  rpcUrl, 
  relayPeers = [],
  directNodeAddrs = []
}: ByteCaveProviderProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const connectCalledRef = useRef(false);

  const connect = useCallback(async () => {
    if (!globalClient) {
      setError('ByteCave client not initialized');
      return;
    }

    try {
      const currentState = globalClient.getConnectionState();
      if (currentState !== 'connected') {
        await globalClient.start();
      }
      
      const actualState = globalClient.getConnectionState();
      const peers = await globalClient.getPeers();
      
      setConnectionState(actualState);
      setPeers(peers);
    } catch (err: any) {
      setError(err.message);
      setConnectionState('error');
    }
  }, []);

  useEffect(() => {
    if (!contractAddress) {
      return;
    }

    const initializeClient = async () => {
      // Don't reinitialize if client already exists
      if (globalClient) {
        console.log('[ByteCaveProvider] Client already exists, skipping initialization');
        return;
      }
      
      console.log('[ByteCaveProvider] Creating new ByteCaveClient');
      globalClient = new ByteCaveClient({
        contractAddress,
        rpcUrl,
        directNodeAddrs,
        relayPeers,
        maxPeers: 10,
        connectionTimeout: 30000
      } as ByteCaveConfig);

      const client = globalClient;

      const handleStateChange = (state: ConnectionState) => {
        setConnectionState(state);
      };
      
      const handlePeerUpdate = async () => {
        if (!client) return;
        try {
          const peers = await client.getPeers();
          setPeers(peers);
        } catch (err) {
          // Silent
        }
      };

      client.on('connectionStateChange', handleStateChange);
      client.on('peerConnect', handlePeerUpdate);
      client.on('peerDisconnect', handlePeerUpdate);

      const hasPeers = directNodeAddrs.length > 0 || relayPeers.length > 0;
      
      if (hasPeers && !connectCalledRef.current) {
        connectCalledRef.current = true;
        setTimeout(() => {
          connect();
        }, 100);
      }
    };

    initializeClient();

    return () => {
      if (globalClient) {
        globalClient.off('connectionStateChange', () => {});
        globalClient.off('peerConnect', () => {});
        globalClient.off('peerDisconnect', () => {});
      }
    };
  }, []); // Empty deps - only initialize once on mount

  const disconnect = async () => {
    if (!globalClient) return;
    try {
      await globalClient.stop();
      setPeers([]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const store = async (data: Uint8Array, contentType?: string, signer?: any): Promise<StoreResult> => {
    if (!globalClient) {
      return { success: false, error: 'Client not initialized' };
    }
    return (globalClient as any).store(data, contentType, signer);
  };

  const retrieve = async (cid: string): Promise<RetrieveResult> => {
    if (!globalClient) {
      return { success: false, error: 'Client not initialized' };
    }
    return globalClient.retrieve(cid);
  };

  const getNodeHealth = async (peerId: string): Promise<NodeHealth | null> => {
    if (!globalClient) {
      return null;
    }
    return (globalClient as any).getNodeHealth(peerId);
  };

  const value: ByteCaveContextValue = {
    connectionState,
    peers,
    isConnected: connectionState === 'connected',
    connect,
    disconnect,
    store,
    retrieve,
    getNodeHealth,
    error
  };

  return (
    <ByteCaveContext.Provider value={value}>
      {children}
    </ByteCaveContext.Provider>
  );
}

export function useByteCaveContext() {
  const context = useContext(ByteCaveContext);
  if (!context) {
    throw new Error('useByteCaveContext must be used within ByteCaveProvider');
  }
  return context;
}
