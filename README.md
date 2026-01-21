# ByteCave Browser Client

Browser-compatible P2P client library for connecting to the ByteCave decentralized storage network via WebRTC and WebSockets.

## Features

- **Fast Node Discovery** - Discover storage nodes in 1-2 seconds via relay peer directory protocol
- **WebRTC P2P Connections** - Direct browser-to-node connections using WebRTC transport (via libp2p)
- **Circuit Relay Fallback** - Relay-based P2P connections for NAT traversal when direct WebRTC fails
- **Pure P2P Architecture** - All communication via libp2p protocols (no HTTP endpoints required)
- **FloodSub Announcements** - Peer discovery and announcements via pubsub
- **Contract Integration** - Optional on-chain node registry verification
- **HashD Protocol** - Custom `hashd://` URL scheme with caching and helpers
- **React Hooks & Components** - Ready-to-use React integration
- **TypeScript** - Full type safety

## Installation

```bash
npm install @gethashd/bytecave-browser
# or
yarn add @gethashd/bytecave-browser
```

## Quick Start

```typescript
import { ByteCaveClient } from '@gethashd/bytecave-browser';

// Initialize client
const client = new ByteCaveClient({
  appId: 'my-app', // Required: Application identifier
  relayPeers: [
    '/dns4/relay.example.com/tcp/4002/ws/p2p/12D3KooW...'
  ],
  vaultNodeRegistryAddress: '0x...', // VaultNodeRegistry contract
  contentRegistryAddress: '0x...', // ContentRegistry contract
  rpcUrl: 'https://...', // Ethereum RPC URL
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
  appId: string;                       // Required: Application identifier for storage authorization
  relayPeers?: string[];               // Relay node multiaddrs for P2P connections
  directNodeAddrs?: string[];          // Direct node multiaddrs (WebRTC without relay)
  vaultNodeRegistryAddress?: string;   // Optional: VaultNodeRegistry contract for node verification
  contentRegistryAddress?: string;     // Optional: ContentRegistry contract
  rpcUrl?: string;                     // Optional: Ethereum RPC (required if using contracts)
  maxPeers?: number;                   // Maximum peer connections (default: 10)
  connectionTimeout?: number;          // Connection timeout in ms (default: 30000)
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

**`store(data: Uint8Array, mimeType?: string, signer?: any): Promise<StoreResult>`**

Store data on the network.

```typescript
const result = await client.store(data, 'text/plain', signer);
// Returns: { success: true, cid: '...', peerId: '...' }
```

**Note:** `mimeType` is optional and defaults to `'application/octet-stream'`. Use standard MIME types like `'text/plain'`, `'image/jpeg'`, `'application/json'`, etc.

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

Custom URL scheme for loading content from ByteCave network. **Note:** `hashd://` URLs are not automatically resolved by browsers - you must use the provided utilities to parse and fetch content.

### URL Format

```
hashd://{cid}
hashd://{cid}?type=image/png
hashd://{cid}?type=image/png&decrypt=true
```

### Core Functions

```typescript
import { 
  parseHashdUrl, 
  createHashdUrl, 
  fetchHashdContent,
  prefetchHashdContent,
  clearHashdCache,
  getHashdCacheStats,
  revokeHashdUrl
} from '@gethashd/bytecave-browser';

// Parse hashd:// URL into components
const parsed = parseHashdUrl('hashd://bafybei...?type=image/png');
// { protocol: 'hashd:', cid: 'bafybei...', mimeType: 'image/png', raw: '...' }

// Create hashd:// URL from CID
const url = createHashdUrl('bafybei...', { mimeType: 'image/png' });
// 'hashd://bafybei...?type=image/png'

// Fetch content and get blob URL (with automatic caching)
const result = await fetchHashdContent(url, client);
// { data: Uint8Array, blobUrl: 'blob:...', mimeType: 'image/png', cached: false }

// Prefetch and cache content
await prefetchHashdContent('hashd://bafybei...', client);

// Cache management
const stats = getHashdCacheStats(); // { size: 5 }
clearHashdCache(); // Clear all cached blob URLs
revokeHashdUrl('bafybei...'); // Revoke specific blob URL
```

### How It Works

1. **Parse** - `parseHashdUrl()` extracts CID and metadata from URL
2. **Fetch** - `fetchHashdContent()` retrieves data via P2P from ByteCave network
3. **Cache** - Blob URLs are automatically cached (1 hour TTL)
4. **Reuse** - Subsequent requests for same CID return cached blob URL

### React Hooks

For React apps, use hooks instead of manual fetching:

```typescript
import { useHashdUrl } from '@gethashd/bytecave-browser';

function ImageDisplay({ cid }) {
  const { blobUrl, loading, error } = useHashdUrl(`hashd://${cid}`);
  
  if (loading) return <Spinner />;
  if (error) return <Error message={error} />;
  return <img src={blobUrl} alt="Image" />;
}
```

## React Integration

### Provider Setup (Recommended)

The easiest way to use ByteCave in React is with the `ByteCaveProvider`:

```typescript
import { ByteCaveProvider } from '@gethashd/bytecave-browser';

function App() {
  return (
    <ByteCaveProvider
      vaultNodeRegistryAddress={process.env.REACT_APP_VAULT_REGISTRY}
      rpcUrl={process.env.REACT_APP_RPC_URL}
      relayPeers={process.env.REACT_APP_RELAY_PEERS?.split(',')}
    >
      <YourApp />
    </ByteCaveProvider>
  );
}
```

Then use hooks anywhere in your app:

```typescript
import { useByteCaveContext, useHashdUrl } from '@gethashd/bytecave-browser';

function ImageGallery() {
  const { store, retrieve, isConnected } = useByteCaveContext();
  
  // Display image from hashd:// URL
  const { blobUrl, loading, error } = useHashdUrl('hashd://abc123...');
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return <img src={blobUrl} alt="Stored image" />;
}

function Uploader() {
  const { store, isConnected } = useByteCaveContext();
  
  const handleUpload = async (file: File) => {
    const data = new Uint8Array(await file.arrayBuffer());
    const result = await store(data, file.type);
    console.log('Uploaded with CID:', result.cid);
  };
  
  return (
    <input 
      type="file" 
      onChange={(e) => handleUpload(e.target.files[0])}
      disabled={!isConnected}
    />
  );
}
```

### Available Hooks

**`useByteCaveContext()`** - Access ByteCave client from context

Must be used within `ByteCaveProvider`. Returns:
```typescript
{
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error',
  peers: PeerInfo[],
  isConnected: boolean,
  connect: () => Promise<void>,
  disconnect: () => Promise<void>,
  store: (data: Uint8Array, contentType?: string, signer?: any) => Promise<StoreResult>,
  retrieve: (cid: string) => Promise<RetrieveResult>,
  getNodeHealth: (peerId: string) => Promise<NodeHealth | null>,
  error: string | null
}
```

**`useHashdUrl(url)`** - Convert hashd:// URL to blob URL

```typescript
function ImageDisplay({ cid }) {
  const { blobUrl, loading, error } = useHashdUrl(`hashd://${cid}`);
  
  if (loading) return <Spinner />;
  if (error) return <Error message={error} />;
  
  return <img src={blobUrl} alt="Image" />;
}
```

**`useHashdImage(url, options)`** - Image-specific loader

```typescript
function ProfilePicture({ cid }) {
  const { src, loading, error } = useHashdImage(`hashd://${cid}`, { 
    client,
    placeholder: '/default-avatar.png' 
  });

  if (loading) return <Spinner />;
  if (error) return <ErrorIcon />;
  
  return <img src={src} alt="Profile" className="w-32 h-32 rounded-full" />;
}
```

**`useHashdContent(url, options)`** - Generic content loader

```typescript
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

**`useHashdMedia(url, options)`** - Video/audio loader

Returns: `{ src, blobUrl, loading, error, cached, refetch }`

**`useHashdBatch(urls, options)`** - Batch load multiple URLs

```typescript
function Gallery({ cids }) {
  const urls = cids.map(cid => `hashd://${cid}`);
  const { results, loading, errors } = useHashdBatch(urls, { client });
  
  if (loading) return <Spinner />;
  
  return (
    <div className="grid grid-cols-3 gap-4">
      {Array.from(results.entries()).map(([url, result]) => (
        <img key={url} src={result.blobUrl} alt="" />
      ))}
    </div>
  );
}
```

### Components

Drop-in replacements for standard HTML elements:

```typescript
import { HashdImage, HashdVideo, HashdAudio } from '@gethashd/bytecave-browser/react';

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


### Complete Example with Provider

```typescript
import { ByteCaveProvider, useByteCaveContext, useHashdUrl } from '@gethashd/bytecave-browser';

// Wrap your app with the provider
function App() {
  return (
    <ByteCaveProvider
      vaultNodeRegistryAddress={process.env.REACT_APP_VAULT_REGISTRY}
      rpcUrl={process.env.REACT_APP_RPC_URL}
      relayPeers={process.env.REACT_APP_RELAY_PEERS?.split(',')}
    >
      <Gallery />
    </ByteCaveProvider>
  );
}

// Use hooks in any component
function Gallery() {
  const { isConnected, store } = useByteCaveContext();
  const { blobUrl, loading, error } = useHashdUrl(
    'hashd://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
  );

  const handleUpload = async (file: File) => {
    const data = new Uint8Array(await file.arrayBuffer());
    const result = await store(data, file.type);
    console.log('Uploaded:', result.cid);
  };

  if (!isConnected) return <div>Connecting to ByteCave...</div>;

  return (
    <div>
      <h1>ByteCave Gallery</h1>
      
      {/* Display image */}
      {loading && <div>Loading image...</div>}
      {error && <div>Error: {error}</div>}
      {blobUrl && <img src={blobUrl} alt="Decentralized" className="max-w-md" />}
      
      {/* Upload new image */}
      <input type="file" onChange={(e) => handleUpload(e.target.files[0])} />
    </div>
  );
}
```

### Complete Example without Provider

If you prefer manual client management:

```typescript
import { ByteCaveClient } from '@gethashd/bytecave-browser';
import { HashdImage } from '@gethashd/bytecave-browser';
import { useState, useEffect } from 'react';

function App() {
  const [client, setClient] = useState(null);

  useEffect(() => {
    const bytecave = new ByteCaveClient({
      relayPeers: process.env.REACT_APP_RELAY_PEERS?.split(','),
      vaultNodeRegistryAddress: process.env.REACT_APP_VAULT_REGISTRY,
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
  ConnectionState,
  HashdUrl,
  FetchOptions,
  FetchResult
} from '@gethashd/bytecave-browser';
```

## License

MIT

## Related Packages

- **bytecave-core** - Storage node implementation
- **bytecave-relay** - Relay node for NAT traversal
- **bytecave-desktop** - Desktop application

## Support

For issues and questions, please open an issue on GitHub.
