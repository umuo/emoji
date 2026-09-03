import assert from "node:assert/strict";
import test from "node:test";
import { createGifFrameEncoder, encodeStillImageGif } from "../lib/generated-image-gif";

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

test("encodes multiple frames with looping metadata", async () => {
  const first = new Uint8Array([255, 0, 0, 255]);
  const second = new Uint8Array([0, 0, 255, 255]);
  const encoder = await createGifFrameEncoder(1, 1, 16, 0);
  encoder.writeFrame(first, 80);
  encoder.writeFrame(second, 80);
  const bytes = encoder.finish();

  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), "GIF89a");
  assert.match(new TextDecoder().decode(bytes), /NETSCAPE2\.0/);
  assert.equal(bytes.at(-1), 0x3b);
});

test("omits looping metadata when the animation should play once", async () => {
  const encoder = await createGifFrameEncoder(1, 1, 16, -1);
  encoder.writeFrame(new Uint8Array([255, 255, 255, 255]), 80);
  encoder.writeFrame(new Uint8Array([0, 0, 0, 255]), 80);
  const bytes = encoder.finish();

  assert.doesNotMatch(new TextDecoder().decode(bytes), /NETSCAPE2\.0/);
});
