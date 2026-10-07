export function installMapRelease(root: string, publicMaps: string): Promise<string>;
export function createMapRelease(root: string, source: unknown): Promise<string>;
export function verifyMapRelease(root: string): Promise<{ release: string; manifest: unknown }>;
