export const CONTENT_REGISTRY_ABI = [
  "function registerContent(bytes32 cid, address owner, bytes32 appId) external",
  "function registerContent(string cid, string appId) external",
  "function isContentRegistered(bytes32 cid) external view returns (bool)",
  "function getContentRecord(bytes32 cid) external view returns (tuple(address owner, bytes32 appId, uint256 timestamp))"
] as const;
