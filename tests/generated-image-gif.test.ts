import assert from "node:assert/strict";
import test from "node:test";
import { encodeStillImageGif } from "../lib/generated-image-gif";

test("encodes an AI image frame as a downloadable GIF", async () => {
  const rgba = new Uint8Array([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ]);

  const bytes = await encodeStillImageGif(rgba, 2, 2);

  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), "GIF89a");
  assert.equal(bytes.at(-1), 0x3b);
  assert.ok(bytes.length > 20);
});

test("rejects incomplete frame data", async () => {
  await assert.rejects(() => encodeStillImageGif(new Uint8Array(4), 2, 2), /像素数据不完整/);
});
