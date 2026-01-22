# ByteCave Browser - Agent Guide

## Overview
ByteCave Browser is a browser-compatible P2P client library that enables web applications to connect directly to ByteCave storage nodes via WebRTC. It provides React hooks and a client API for decentralized storage.

## Critical Dependencies

### Internal Dependencies
- **bytecave-core** - Core types and utilities (NOT the full node implementation)
- Changes to bytecave-core may require rebuilding this package

### External Dependencies
- **@libp2p/webrtc** - WebRTC transport for browser P2P
- **ethers v6** - Ethereum wallet integration for signing
- **React** - React hooks and context providers (peer dependency)

## Build Process

### Standard Build
```bash
cd bytecave-browser
yarn build
```
- Uses `tsup` for bundling
- Outputs ESM and CJS formats to `dist/`
- Generates TypeScript declarations

### Build Output
- `dist/index.js` - ESM bundle
- `dist/index.cjs` - CommonJS bundle
- `dist/react/index.js` - React-specific exports
- `dist/*.d.ts` - TypeScript type definitions

## **CRITICAL: npm Publishing Workflow**

### After Making Changes
**YOU MUST FOLLOW THIS WORKFLOW:**

1. **Build and publish to npm**
   ```bash
   cd bytecave-browser
   yarn build
   npm publish --access public
   ```
   - This automatically builds, commits to git, and publishes to npm registry
   - Version is controlled in `package.json`

2. **Update dependent packages**
   In `web/` or `dashboard/`:
   ```bash
   yarn upgrade @gethashd/bytecave-browser@<version>
   ```
   - Use specific version number from `package.json`
   - Example: `yarn upgrade @gethashd/bytecave-browser@1.0.13`

### Why This Is Critical
- `web` and `dashboard` install bytecave-browser from **npm registry**, not from git
- If you don't publish to npm, dependent packages will use stale code
- Even after rebuilding locally, changes won't appear until published and upgraded

### Common Mistake
❌ **WRONG**: Build bytecave-browser → Rebuild web/dashboard → Test
- This will use OLD code because web/dashboard pull from npm

✅ **CORRECT**: Build & publish to npm → Upgrade in web/dashboard → Test
- This ensures latest code is used

### Version Management
- Bump version in `package.json` before publishing
- Follow semantic versioning: MAJOR.MINOR.PATCH
- Patch (1.0.x): Bug fixes
- Minor (1.x.0): New features, backward compatible
- Major (x.0.0): Breaking changes

## Key Architecture Concepts

### ByteCaveClient
Main client class for P2P storage operations:
- `store(data, contentType, signer)` - Store blob with optional authorization
- `retrieve(cid)` - Retrieve blob by CID
- Handles peer discovery via contract and floodsub announcements

### React Integration
- `<ByteCaveProvider>` - Context provider for React apps
- `useByteCave()` - Hook to access client instance
- `appId` prop is required and should be passed from app config

### Storage Authorization
- Uses ethers signer to create signed authorization
- Signature message format matches bytecave-core
- Includes `appId`, `contentHash`, `timestamp`, `nonce`

### shouldVerifyOnChain Flag
- **New parameter** in `storeToPeer()` function
- Defaults to `false` for browser/test storage
- Set to `true` for content that should be verified on-chain (messages, posts)
- Passed to node in `StoreRequest`

## Dependent Packages

### Web App (`/web`)
- Uses bytecave-browser for vault storage
- Installs from npm: `@gethashd/bytecave-browser`
- After bytecave-browser changes: `yarn upgrade @gethashd/bytecave-browser@<version>`

### Dashboard (`/dashboard`)
- Uses bytecave-browser for test storage
- Installs from npm: `@gethashd/bytecave-browser`
- After bytecave-browser changes: `yarn upgrade @gethashd/bytecave-browser@<version>`

## Testing Workflow

### After Code Changes
1. Bump version in `package.json`
2. Build and publish: `yarn build && npm publish --access public`
3. In web/dashboard: `yarn upgrade @gethashd/bytecave-browser@<version>`
4. Rebuild web/dashboard: `yarn build`
5. Hard refresh browser (Cmd+Shift+R) to clear cache
6. Test storage functionality

### Common Issues

#### Stale Code in Web/Dashboard
**Symptom**: Changes to bytecave-browser don't appear in web/dashboard
**Solution**: 
1. Verify bytecave-browser was published to npm (check version on npmjs.com)
2. Run `yarn upgrade @gethashd/bytecave-browser@<version>` in web/dashboard
3. Check `node_modules/@gethashd/bytecave-browser/package.json` version matches
4. Hard refresh browser

#### Type Errors After Changes
**Symptom**: TypeScript errors in web/dashboard after bytecave-browser changes
**Solution**:
1. Ensure bytecave-browser built successfully
2. Check type definitions in `dist/*.d.ts`
3. Upgrade in dependent packages
4. Restart TypeScript server in IDE

## Important Files

### Core Client
- `src/client.ts` - Main ByteCaveClient class
- `src/p2p-protocols.ts` - P2P protocol client (storeToPeer, etc.)
- `src/discovery.ts` - Contract-based node discovery

### React Integration
- `src/react/provider.tsx` - ByteCaveProvider component
- `src/react/hooks.ts` - useByteCave hook

### Type Definitions
- `src/types.ts` - Core type definitions
- `src/p2p-protocols.ts` - Protocol interfaces (StoreRequest, StoreResponse)

## Configuration

### ByteCaveConfig
Required configuration for client:
- `contractAddress` - ByteCave registry contract
- `rpcUrl` - Ethereum RPC endpoint
- `appId` - Application identifier (e.g., "hashd")
- `directNodeAddrs` - Optional direct node addresses
- `relayPeers` - Optional relay peer addresses

## Package Manager
- **Yarn** - Always use `yarn` not `npm`
- Lock file: `yarn.lock`

## Build Tools
- **tsup** - Fast TypeScript bundler
- **TypeScript** - Type checking and declaration generation
- Config: `tsup.config.ts`, `tsconfig.json`

## User Preferences
- User prefers separate components
- Avoid temporary fixes
- Fix lint errors at each step
- Use Yarn as package manager
- Always push to git after changes to this package
