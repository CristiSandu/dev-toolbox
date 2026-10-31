export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const LARGE_TEXT_BYTES = 256 * 1024;
export const textBytes = (text: string) => new TextEncoder().encode(text).byteLength;
