# ByteCave Browser Client

Browser-compatible P2P client library for connecting to the ByteCave decentralized storage network via WebRTC and WebSockets.

## Features

- **Fast Node Discovery** - Discover storage nodes in 1-2 seconds via relay peer directory
- **Pure P2P** - Connect via relay nodes, no HTTP endpoints required
- **WebRTC Support** - Direct browser-to-node P2P connections
- **Circuit Relay** - Relay-based connections for NAT traversal
- **FloodSub** - Peer announcements and discovery
- **Contract Integration** - Optional on-chain node registry support
- **React Hooks & Components** - Ready-to-use React integration
- **TypeScript** - Full type safety

## Installation

```bash
npm install @hashd/bytecave-browser
# or
yarn add @hashd/bytecave-browser
```

## Quick Start

```typescript
import { ByteCaveClient } from '@hashd/bytecave-browser';

// Initialize client
const client = new ByteCaveClient({
  contractAddress: '0x...', // Vault registry contract
  rpcUrl: 'https://...', // Ethereum RPC URL
  relayPeers: [
    '/dns4/relay.example.com/tcp/4002/ws/p2p/12D3KooW...'
  ],
  maxPeers: 10,
  connectionTimeout: 30000
});

// Start P2P client
await client.start();

// Store data
const result = await client.store(
  new TextEncoder().encode('Hello ByteCave!'),
  'text/plain'
);
console.log('Stored with CID:', result.cid);

// Retrieve data
const retrieved = await client.retrieve(result.cid);
console.log('Retrieved:', new TextDecoder().decode(retrieved.data));

// Stop client
await client.stop();
```

## Configuration

### ByteCaveConfig

```typescript
interface ByteCaveConfig {
  contractAddress: string;      // Vault registry contract address
  rpcUrl: string;                // Ethereum RPC endpoint
  relayPeers?: string[];         // Relay node multiaddrs
  maxPeers?: number;             // Maximum peer connections (default: 10)
  connectionTimeout?: number;    // Connection timeout in ms (default: 30000)
}
```

### Relay Peer Configuration

**Required**: At least one relay peer multiaddr for P2P discovery.

```typescript
relayPeers: [
  // WebSocket multiaddr (required for browsers)
  '/dns4/relay.example.com/tcp/4002/ws/p2p/12D3KooW...',
  // Multiple relays for redundancy (recommended)
  '/dns4/relay2.example.com/tcp/4002/ws/p2p/12D3KooW...'
]
```

**Getting Relay Multiaddrs:**

From relay HTTP info endpoint:
```bash
curl http://relay.example.com:9090/info
```

Or from relay node logs:
```bash
docker-compose logs relay1 | grep "Listening on"
```

**Important**: Use the WebSocket address (contains `/ws/`) for browser clients.

## API Reference

### ByteCaveClient

#### Constructor

```typescript
new ByteCaveClient(config: ByteCaveConfig)
```

#### Methods

**`start(): Promise<void>`**

Start the P2P client and connect to relay nodes.

```typescript
await client.start();
```

**`stop(): Promise<void>`**

Stop the P2P client and disconnect from all peers.

```typescript
await client.stop();
```

**`store(data: Uint8Array, contentType?: string): Promise<StoreResult>`**

Store data on the network.

```typescript
const result = await client.store(data, 'application/json');
// Returns: { success: true, cid: '...', peerId: '...' }
```

**`retrieve(cid: string): Promise<RetrieveResult>`**

Retrieve data from the network.

```typescript
const result = await client.retrieve('bafybei...');
// Returns: { success: true, data: Uint8Array, peerId: '...' }
```

**`getPeers(): PeerInfo[]`**

Get list of connected peers.

```typescript
const peers = client.getPeers();
// Returns: [{ peerId: '...', publicKey: '...', connected: true, ... }]
```

**`getConnectionState(): ConnectionState`**

Get current connection state.

```typescript
const state = client.getConnectionState();
// Returns: 'disconnected' | 'connecting' | 'connected' | 'error'
```

#### Events

**`on(event: string, callback: Function): void`**

Listen for events.

```typescript
client.on('connectionStateChange', (state) => {
  console.log('Connection state:', state);
});

client.on('peerConnect', (peer) => {
  console.log('Peer connected:', peer.peerId);
});

client.on('peerDisconnect', (peerId) => {
  console.log('Peer disconnected:', peerId);
});

client.on('peerAnnounce', (peer) => {
  console.log('Peer announced:', peer.peerId);
});
```

**`off(event: string, callback: Function): void`**

Remove event listener.

```typescript
client.off('peerConnect', callback);
```

## HashD Protocol (`hashd://`)

Load content from ByteCave network using `hashd://` URLs - works just like regular HTTP URLs!

### URL Format

```
hashd://{cid}
hashd://{cid}?type=image/png
```

### Core Functions

```typescript
import { 
  parseHashdUrl, 
  createHashdUrl, 
  fetchHashdContent 
} from '@hashd/bytecave-browser';

// Parse hashd:// URL
const parsed = parseHashdUrl('hashd://abc123...');
// { protocol: 'hashd:', cid: 'abc123...', mimeType: undefined }

// Create hashd:// URL
const url = createHashdUrl('abc123...', { mimeType: 'image/png' });
// 'hashd://abc123...?type=image/png'

// Fetch content (returns blob URL)
const result = await fetchHashdContent(url, client);
// { blobUrl: 'blob:...', mimeType: 'image/png', cached: false }
```

## React Integration

### Hooks

```typescript
import { useHashdImage, useHashdContent } from '@hashd/bytecave-browser/react';

function ProfilePicture({ cid }) {
  const { src, loading, error } = useHashdImage(`hashd://${cid}`, { 
    client,
    placeholder: '/default-avatar.png' 
  });

  if (loading) return <Spinner />;
  if (error) return <ErrorIcon />;
  
  return <img src={src} alt="Profile" className="w-32 h-32 rounded-full" />;
}

// Generic content hook
function ContentViewer({ url }) {
  const { blobUrl, loading, error, mimeType } = useHashdContent(url, { client });
  
  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;
  
  if (mimeType?.startsWith('image/')) {
    return <img src={blobUrl} />;
  } else if (mimeType?.startsWith('video/')) {
    return <video src={blobUrl} controls />;
  }
  
  return <a href={blobUrl} download>Download</a>;
}
```

### Components

Drop-in replacements for standard HTML elements:

```typescript
import { HashdImage, HashdVideo, HashdAudio } from '@hashd/bytecave-browser/react';

// Image
<HashdImage 
  src="hashd://abc123..." 
  client={byteCaveClient}
  alt="Profile picture"
  className="w-32 h-32 rounded-full"
  placeholder="/loading.png"
  loadingComponent={<Spinner />}
  errorComponent={<ErrorIcon />}
/>

// Video
<HashdVideo 
  src="hashd://def456..." 
  client={byteCaveClient}
  controls
  className="w-full"
/>

// Audio
<HashdAudio 
  src="hashd://ghi789..." 
  client={byteCaveClient}
  controls
/>

// Render prop pattern
<HashdContent url="hashd://abc123..." client={client}>
  {({ blobUrl, loading, error }) => {
    if (loading) return <Spinner />;
    if (error) return <Error />;
    return <img src={blobUrl} />;
  }}
</HashdContent>
```

### Available Hooks

**`useHashdContent(url, options)`** - Generic content loader
- Returns: `{ blobUrl, data, mimeType, loading, error, cached, refetch }`

**`useHashdImage(url, options)`** - Image-specific loader
- Returns: `{ src, blobUrl, loading, error, cached, refetch }`
- Includes `placeholder` option

**`useHashdMedia(url, options)`** - Video/audio loader
- Returns: `{ src, blobUrl, loading, error, cached, refetch }`

**`useHashdBatch(urls, options)`** - Batch load multiple URLs
- Returns: `{ results: Map, loading, errors: Map }`

### Custom Hook Example

```typescript
import { useState, useEffect } from 'react';
import { ByteCaveClient } from '@hashd/bytecave-browser';

export function useByteCave(config) {
  const [client, setClient] = useState(null);
  const [peers, setPeers] = useState([]);
  const [connectionState, setConnectionState] = useState('disconnected');

  useEffect(() => {
    const bytecave = new ByteCaveClient(config);
    
    bytecave.on('connectionStateChange', setConnectionState);
    bytecave.on('peerConnect', () => setPeers(bytecave.getPeers()));
    bytecave.on('peerDisconnect', () => setPeers(bytecave.getPeers()));
    
    setClient(bytecave);
    
    return () => {
      bytecave.stop();
    };
  }, []);

  return { client, peers, connectionState };
}
```

### Complete Example

```typescript
import { ByteCaveClient } from '@hashd/bytecave-browser';
import { HashdImage } from '@hashd/bytecave-browser/react';
import { useState, useEffect } from 'react';

function App() {
  const [client, setClient] = useState(null);

  useEffect(() => {
    const bytecave = new ByteCaveClient({
      relayPeers: [process.env.REACT_APP_RELAY_PEERS],
      contractAddress: process.env.REACT_APP_VAULT_REGISTRY,
      rpcUrl: process.env.REACT_APP_RPC_URL
    });
    
    bytecave.start().then(() => setClient(bytecave));
    
    return () => bytecave.stop();
  }, []);

  if (!client) return <div>Connecting to ByteCave...</div>;

  return (
    <div>
      <h1>ByteCave Gallery</h1>
      <HashdImage 
        src="hashd://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
        client={client}
        alt="Decentralized image"
        className="max-w-md"
      />
    </div>
  );
}
```

## Environment Variables

For React apps, configure relay peers via environment:

```bash
# .env
REACT_APP_RELAY_PEERS=/dns4/relay.example.com/tcp/4002/ws/p2p/12D3KooW...
```

Then in your app:

```typescript
const relayPeers = process.env.REACT_APP_RELAY_PEERS?.split(',') || [];

const client = new ByteCaveClient({
  contractAddress: process.env.REACT_APP_VAULT_REGISTRY,
  rpcUrl: process.env.REACT_APP_RPC_URL,
  relayPeers
});
```

## How It Works

### Fast Discovery via Peer Directory

On startup, the browser queries the relay's peer directory protocol for instant node discovery:

1. **Connect to Relay** - Browser connects to relay via WebSocket
2. **Query Peer Directory** - Browser dials `/bytecave/relay/peers/1.0.0` protocol
3. **Receive Peer List** - Relay responds with list of storage nodes and circuit relay addresses
4. **Dial Nodes** - Browser dials each node through the relay
5. **Fetch Health Data** - Immediate health check via P2P protocol

**Discovery time: 1-2 seconds** (down from 2+ minutes with gossip-only)

### Pure P2P Discovery

1. **Connect to Relay** - Browser connects to relay via WebSocket
2. **Announce Presence** - Node announces on FloodSub `bytecave-announce` topic
3. **Discover Peers** - DHT and pubsub discover other nodes through relay
4. **Establish Connection** - Direct WebRTC or relayed connection
5. **Store/Retrieve** - P2P protocols for data operations

### Pure P2P Architecture

- ✅ No HTTP health endpoint calls
- ✅ No HTTP multiaddr fetching
- ✅ Pure libp2p protocols (Peer Directory, FloodSub, DHT)
- ✅ Works entirely over P2P network
- ✅ Browser connects directly to storage nodes via WebRTC or relay

## Protocols

- **Peer Directory** (`/bytecave/relay/peers/1.0.0`) - Fast node discovery
- **Health Protocol** (`/bytecave/health/1.0.0`) - Node health checks
- **WebSocket** - Browser to relay connection
- **WebRTC** - Direct browser-to-node connections
- **Circuit Relay v2** - NAT traversal
- **FloodSub** - Peer announcements
- **DHT** (via relay) - Distributed peer routing

## Browser Compatibility

- Chrome/Edge 89+
- Firefox 87+
- Safari 15.4+
- Opera 75+

Requires WebRTC and WebSocket support.

## Troubleshooting

### No Peers Discovered

**Check relay configuration:**
```typescript
console.log('Relay peers:', config.relayPeers);
```

**Verify relay is running:**
```bash
curl http://relay.example.com:4002
```

**Check browser console:**
```
[ByteCave] Using relay peers: [...]
[ByteCave] ✓ Connected to relay: ...
```

### Connection Failed

1. Verify relay multiaddr format includes `/ws/`
2. Check firewall allows WebSocket connections
3. Ensure relay peer ID matches running relay
4. Try connecting to relay directly in browser DevTools

### CORS Issues

WebSocket connections don't have CORS restrictions. If you see CORS errors, you may be using HTTP instead of WS.

## Development

```bash
# Install dependencies
yarn install

# Build
yarn build

# Run tests
yarn test

# Watch mode
yarn dev
```

## TypeScript Support

Full TypeScript definitions included:

```typescript
import type { 
  ByteCaveConfig,
  PeerInfo,
  StoreResult,
  RetrieveResult,
  ConnectionState
} from '@hashd/bytecave-browser';
```

## License

MIT

## Related Packages

- **bytecave-core** - Storage node implementation
- **bytecave-relay** - Relay node for NAT traversal
- **bytecave-desktop** - Desktop application

## Support

For issues and questions, please open an issue on GitHub.
