import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  createMemePackArchive,
  getMemePackCells,
  getMemePackFilename,
  MEME_PACK_COUNT,
} from "../lib/meme-pack";

test("splits a portrait sheet into a 3 by 4 grid", () => {
  const cells = getMemePackCells(1200, 1600);

  assert.equal(cells.length, 12);
  assert.deepEqual(cells[0], { index: 0, column: 0, row: 0, x: 0, y: 0, width: 400, height: 400 });
  assert.deepEqual(cells[11], { index: 11, column: 2, row: 3, x: 800, y: 1200, width: 400, height: 400 });
});

test("creates a ZIP with all 12 sequentially named expressions", async () => {
  const files = Array.from({ length: MEME_PACK_COUNT }, (_, index) => ({
    name: getMemePackFilename(index, "png"),
    data: new Uint8Array([index]),
  }));
  const archive = await createMemePackArchive(files);
  const zip = await JSZip.loadAsync(archive);

  assert.equal(Object.keys(zip.files).length, 12);
  assert.ok(zip.file("梗一下-表情包-01.png"));
  assert.ok(zip.file("梗一下-表情包-12.png"));
});

test("rejects incomplete expression packs", async () => {
  await assert.rejects(() => createMemePackArchive([]), /必须包含 12 张/);
});
