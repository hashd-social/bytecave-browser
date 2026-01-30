/**
 * WebSocket Storage Client for Browser
 * Sends storage requests to relay, which routes to storage nodes
 */

interface StorageRequestMessage {
  type: 'storage-request';
  requestId: string;
  data: string; // base64
  contentType: string;
  hashIdToken?: number;
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

interface RetrieveRequestMessage {
  type: 'retrieve-request';
  requestId: string;
  cid: string;
}

interface RetrieveResponseMessage {
  type: 'retrieve-response';
  requestId: string;
  success: boolean;
  data?: string; // base64
  mimeType?: string;
  error?: string;
}

type Message = StorageRequestMessage | StorageResponseMessage | RetrieveRequestMessage | RetrieveResponseMessage;

export interface StoreViaWebSocketOptions {
  data: Uint8Array;
  contentType: string;
  hashIdToken?: number;
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
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(private relayUrl: string) {}

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[Storage WS] Already connected');
      return;
    }

    console.log('[Storage WS] Connecting to relay:', this.relayUrl);
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.relayUrl);

      this.ws.onopen = () => {
        console.log('[Storage WS] ✓ Connected to relay');
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
    } else if (message.type === 'retrieve-response') {
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.requestId);
        
        if (message.success && message.data) {
          // Convert base64 to Uint8Array
          const binaryString = atob(message.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          pending.resolve({ success: true, data: bytes, mimeType: message.mimeType });
        } else {
          pending.resolve({ success: false, error: message.error || 'Retrieval failed' });
        }
      }
    }
  }

  async store(options: StoreViaWebSocketOptions): Promise<{ success: boolean; cid?: string; error?: string }> {
    console.log('[Storage WS] store() called, data size:', options.data.length, 'bytes');
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[Storage WS] Not connected, connecting now...');
      await this.connect();
    }

    const requestId = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15);

    console.log('[Storage WS] Converting data to base64...');
    // Convert Uint8Array to base64
    // Chunk the data to avoid stack overflow with large files
    const chunkSize = 8192;
    let binaryString = '';
    for (let i = 0; i < options.data.length; i += chunkSize) {
      const chunk = options.data.subarray(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
    }
    const base64Data = btoa(binaryString);
    console.log('[Storage WS] Base64 data length:', base64Data.length);

    const request: StorageRequestMessage = {
      type: 'storage-request',
      requestId,
      data: base64Data,
      contentType: options.contentType,
      hashIdToken: options.hashIdToken,
      authorization: options.authorization
    };

    console.log('[Storage WS] Creating promise for request:', requestId);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[Storage WS] Request timed out:', requestId);
        this.pendingRequests.delete(requestId);
        reject(new Error('Storage request timeout'));
      }, options.timeout || 30000);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      try {
        console.log('[Storage WS] Sending request to relay, WS state:', this.ws?.readyState);
        this.ws!.send(JSON.stringify(request));
        console.log('[Storage WS] ✓ Sent storage request:', requestId);
      } catch (error: any) {
        console.error('[Storage WS] Failed to send request:', error.message);
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

  async retrieve(cid: string, timeout: number = 30000): Promise<{ success: boolean; data?: Uint8Array; mimeType?: string; error?: string }> {
    // Ensure connection is established
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    
    // Wait for WebSocket to be in OPEN state (with timeout)
    const connectionTimeout = 5000; // 5 seconds max wait
    const startTime = Date.now();
    while ((!this.ws || this.ws.readyState !== WebSocket.OPEN) && (Date.now() - startTime < connectionTimeout)) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return {
        success: false,
        error: 'WebSocket connection timeout'
      };
    }

    const requestId = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15);

    const request: RetrieveRequestMessage = {
      type: 'retrieve-request',
      requestId,
      cid
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Retrieval request timeout'));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutHandle });

      try {
        this.ws!.send(JSON.stringify(request));
        console.log('[Storage WS] Sent retrieval request:', requestId, 'CID:', cid);
      } catch (error: any) {
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
