/**
 * WebSocket Storage Client for Browser
 * Sends storage requests to relay, which routes to storage nodes
 */

interface StorageRequestMessage {
  type: 'storage-request';
  requestId: string;
  data: string; // base64
  contentType: string;
  authorization?: {
    signature: string;
    address: string;
    timestamp: number;
    nonce: string;
    appId: string;
    contentHash: string;
  };
}

interface StorageResponseMessage {
  type: 'storage-response';
  requestId: string;
  success: boolean;
  cid?: string;
  error?: string;
}

type Message = StorageRequestMessage | StorageResponseMessage;

export interface StoreViaWebSocketOptions {
  data: Uint8Array;
  contentType: string;
  authorization?: {
    signature: string;
    address: string;
    timestamp: number;
    nonce: string;
    appId: string;
    contentHash: string;
  };
  timeout?: number;
}

export class StorageWebSocketClient {
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, {
    resolve: (result: { success: boolean; cid?: string; error?: string }) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(private relayUrl: string) {}

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.relayUrl);

      this.ws.onopen = () => {
        console.log('[Storage WS] Connected to relay');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as Message;
          this.handleMessage(message);
        } catch (error: any) {
          console.error('[Storage WS] Failed to parse message:', error.message);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Storage WS] WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        console.log('[Storage WS] Connection closed');
        this.ws = null;
        // Reject all pending requests
        for (const [requestId, pending] of this.pendingRequests.entries()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('WebSocket connection closed'));
        }
        this.pendingRequests.clear();
      };
    });
  }

  private handleMessage(message: Message): void {
    if (message.type === 'storage-response') {
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.requestId);
        
        if (message.success && message.cid) {
          pending.resolve({ success: true, cid: message.cid });
        } else {
          pending.resolve({ success: false, error: message.error || 'Storage failed' });
        }
      }
    }
  }

  async store(options: StoreViaWebSocketOptions): Promise<{ success: boolean; cid?: string; error?: string }> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const requestId = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15);

    // Convert Uint8Array to base64
    const base64Data = btoa(String.fromCharCode(...options.data));

    const request: StorageRequestMessage = {
      type: 'storage-request',
      requestId,
      data: base64Data,
      contentType: options.contentType,
      authorization: options.authorization
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Storage request timeout'));
      }, options.timeout || 30000);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      try {
        this.ws!.send(JSON.stringify(request));
        console.log('[Storage WS] Sent storage request:', requestId);
      } catch (error: any) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Clear all pending requests
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
