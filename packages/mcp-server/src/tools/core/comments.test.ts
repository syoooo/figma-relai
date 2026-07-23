import { describe, expect, test } from "bun:test";
import { parseFileKey } from "./comments.js";

describe("parseFileKey", () => {
  test("extracts key from /file/ and /design/ URLs", () => {
    expect(parseFileKey("https://www.figma.com/file/AbC123xYz456pQr789/My-File?node-id=1-2"))
      .toBe("AbC123xYz456pQr789");
    expect(parseFileKey("https://figma.com/design/AbC123xYz456pQr789/My-File"))
      .toBe("AbC123xYz456pQr789");
  });

  test("accepts a bare key, rejects garbage", () => {
    expect(parseFileKey("AbC123xYz456pQr789")).toBe("AbC123xYz456pQr789");
    expect(parseFileKey("not a key")).toBeNull();
    expect(parseFileKey("short")).toBeNull();
    expect(parseFileKey("https://example.com/file/AbC123xYz456pQr789")).toBeNull();
  });
});
