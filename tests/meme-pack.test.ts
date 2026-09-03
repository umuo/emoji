import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  createMemePackArchive,
  getMemePackCells,
  getMemePackFilename,
  getMemePackLayout,
  MEME_PACK_LAYOUTS,
  MEME_PACK_COUNT,
} from "../lib/meme-pack";

test("splits a portrait sheet into a 3 by 4 grid", () => {
  const cells = getMemePackCells(1200, 1600);

  assert.equal(cells.length, 12);
  assert.deepEqual(cells[0], { index: 0, column: 0, row: 0, x: 0, y: 0, width: 400, height: 400 });
  assert.deepEqual(cells[11], { index: 11, column: 2, row: 3, x: 800, y: 1200, width: 400, height: 400 });
});

test("supports 2x2, 3x3, 3x4, and 4x4 packs", () => {
  assert.deepEqual(MEME_PACK_LAYOUTS.map(({ id, count }) => [id, count]), [
    ["2x2", 4],
    ["3x3", 9],
    ["3x4", 12],
    ["4x4", 16],
  ]);

  for (const layout of MEME_PACK_LAYOUTS) {
    const cells = getMemePackCells(1200, 1200, layout.columns, layout.rows);
    assert.equal(cells.length, layout.count);
    assert.equal(cells.at(-1)?.column, layout.columns - 1);
    assert.equal(cells.at(-1)?.row, layout.rows - 1);
  }
  assert.equal(getMemePackLayout("unknown").id, "3x4");
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

test("creates a ZIP for a selected pack size", async () => {
  const files = Array.from({ length: 4 }, (_, index) => ({
    name: getMemePackFilename(index, "gif"),
    data: new Uint8Array([index]),
  }));
  const archive = await createMemePackArchive(files, 4);
  const zip = await JSZip.loadAsync(archive);

  assert.equal(Object.keys(zip.files).length, 4);
  assert.ok(zip.file("梗一下-表情包-04.gif"));
});
