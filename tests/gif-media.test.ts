import assert from "node:assert/strict";
import test from "node:test";
import {
  fitGifDimensions,
  inferGifSourceKind,
  normalizeMediaUrl,
  validateGifSourceFile,
} from "../lib/gif-media";

test("detects uploaded and linked GIF source types", () => {
  assert.equal(inferGifSourceKind({ name: "clip.bin", type: "video/mp4" }, "image"), "video");
  assert.equal(inferGifSourceKind({ name: "photo.webp", type: "" }, "video"), "image");
  assert.equal(inferGifSourceKind("https://cdn.example.com/a/movie.mov?token=1", "image"), "video");
  assert.equal(inferGifSourceKind("https://cdn.example.com/download?id=1", "image"), "image");
});

test("validates file formats and per-kind size limits", () => {
  assert.deepEqual(
    validateGifSourceFile({ name: "photo.png", type: "image/png", size: 1024 }),
    { error: "", kind: "image" },
  );
  assert.match(
    validateGifSourceFile({ name: "large.mp4", type: "video/mp4", size: 201 * 1024 * 1024 }).error,
    /200 MB/,
  );
  assert.match(
    validateGifSourceFile({ name: "vector.svg", type: "image/svg+xml", size: 1024 }).error,
    /仅支持/,
  );
});

test("normalizes safe media URLs and rejects invalid schemes or credentials", () => {
  assert.equal(normalizeMediaUrl(" https://cdn.example.com/a%20b.png "), "https://cdn.example.com/a%20b.png");
  assert.throws(() => normalizeMediaUrl("data:image/png;base64,AAAA"), /HTTP\(S\)/);
  assert.throws(() => normalizeMediaUrl("https://user:secret@example.com/a.mp4"), /HTTP\(S\)/);
});

test("fits output dimensions within the selected longest edge", () => {
  assert.deepEqual(fitGifDimensions(1920, 1080, 480), { width: 480, height: 270 });
  assert.deepEqual(fitGifDimensions(1000, 1500, 480), { width: 320, height: 480 });
  assert.throws(() => fitGifDimensions(0, 1080, 480), /素材尺寸/);
});
