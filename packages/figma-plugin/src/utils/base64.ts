// Custom base64 encoder for the Figma plugin sandbox (no btoa available)

const CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    result += CHARS[b1 >> 2];
    result += CHARS[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < len ? CHARS[((b2 & 15) << 2) | (b3 >> 6)] : "=";
    result += i + 2 < len ? CHARS[b3 & 63] : "=";
  }

  return result;
}

// Decode base64 to Uint8Array
export function base64ToUint8Array(base64: string): Uint8Array {
  const lookup = new Map<string, number>();
  for (let i = 0; i < CHARS.length; i++) lookup.set(CHARS[i], i);

  const clean = base64.replace(/=/g, "");
  const len = clean.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let pos = 0;

  for (let i = 0; i < len; i += 4) {
    const b1 = lookup.get(clean[i]) || 0;
    const b2 = lookup.get(clean[i + 1]) || 0;
    const b3 = lookup.get(clean[i + 2]) || 0;
    const b4 = lookup.get(clean[i + 3]) || 0;

    bytes[pos++] = (b1 << 2) | (b2 >> 4);
    if (i + 2 < len) bytes[pos++] = ((b2 & 15) << 4) | (b3 >> 2);
    if (i + 3 < len) bytes[pos++] = ((b3 & 3) << 6) | b4;
  }

  return bytes.slice(0, pos);
}
