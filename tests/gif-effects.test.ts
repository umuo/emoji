import assert from "node:assert/strict";
import test from "node:test";
import { createStillGifFrames, GIF_EXPORT_SETTINGS } from "../lib/gif-effects";

test("builds a single frame for static GIF compatibility", () => {
  const result = createStillGifFrames("still", "normal");
  assert.equal(result.frames.length, 1);
  assert.equal(result.delay, 1000);
  assert.deepEqual(result.frames[0], {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    flash: 0,
  });
});

test("builds distinct animated frame plans for every effect", () => {
  const shake = createStillGifFrames("shake", "normal");
  const bounce = createStillGifFrames("bounce", "normal");
  const zoom = createStillGifFrames("zoom", "normal");
  const flash = createStillGifFrames("flash", "normal");

  assert.equal(shake.frames.length, 12);
  assert.ok(shake.frames.some((frame) => frame.offsetX !== 0 && frame.rotation !== 0));
  assert.ok(bounce.frames.some((frame) => frame.offsetY < 0));
  assert.ok(zoom.frames.some((frame) => frame.scale > 1.05));
  assert.ok(flash.frames.some((frame) => frame.flash > 0));
});

test("uses fewer pixels and colors for compact exports", () => {
  assert.ok(GIF_EXPORT_SETTINGS.compact.maxEdge < GIF_EXPORT_SETTINGS.hd.maxEdge);
  assert.ok(GIF_EXPORT_SETTINGS.compact.colors < GIF_EXPORT_SETTINGS.hd.colors);
});

test("changes animation timing with the selected speed", () => {
  const slow = createStillGifFrames("shake", "slow");
  const fast = createStillGifFrames("shake", "fast");

  assert.ok(slow.delay > fast.delay);
  assert.ok(slow.frames.length > fast.frames.length);
});
