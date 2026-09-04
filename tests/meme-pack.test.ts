import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  createMemePackArchive,
  detectMemePackCells,
  getMemePackCanvasAspectRatio,
  getMemePackCells,
  getMemePackFilename,
  getMemePackLayout,
  getMemePackSourceAspectRatio,
  MEME_PACK_LAYOUTS,
  MEME_PACK_COUNT,
} from "../lib/meme-pack";

function createOffsetGridPixels(
  width: number,
  height: number,
  xBoundaries: number[],
  yBoundaries: number[],
) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < yBoundaries.length - 1; row += 1) {
    for (let column = 0; column < xBoundaries.length - 1; column += 1) {
      const red = 25 + column * 100;
      const green = 30 + row * 50;
      for (let y = yBoundaries[row]; y < yBoundaries[row + 1]; y += 1) {
        for (let x = xBoundaries[column]; x < xBoundaries[column + 1]; x += 1) {
          const offset = (y * width + x) * 4;
          pixels[offset] = red;
          pixels[offset + 1] = green;
          pixels[offset + 2] = 25 + row * 70;
          pixels[offset + 3] = 255;
        }
      }
    }
  }
  return pixels;
}

test("splits a portrait sheet into a 3 by 4 grid", () => {
  const cells = getMemePackCells(1200, 1600);

  assert.equal(cells.length, 12);
  assert.deepEqual(cells[0], { index: 0, column: 0, row: 0, x: 0, y: 0, width: 400, height: 400 });
  assert.deepEqual(cells[11], { index: 11, column: 2, row: 3, x: 800, y: 1200, width: 400, height: 400 });
});

test("detects shifted AI grid boundaries instead of blindly slicing equal rows", () => {
  const width = 120;
  const height = 160;
  const pixels = createOffsetGridPixels(width, height, [0, 38, 82, 120], [0, 44, 78, 124, 160]);
  const cells = detectMemePackCells(pixels, width, height, 3, 4);

  assert.equal(cells.length, 12);
  assert.ok(cells[3].y >= 44, `second row should begin after the detected boundary, got ${cells[3].y}`);
  assert.ok(cells[6].y >= 78, `third row should begin after the detected boundary, got ${cells[6].y}`);
  assert.ok(cells[1].x >= 38, `second column should begin after the detected boundary, got ${cells[1].x}`);
  assert.ok(cells[3].height < 40, `shifted row should not include the previous card, got ${cells[3].height}`);
});

test("does not mistake a partial-width caption edge for a row boundary", () => {
  const width = 120;
  const height = 160;
  const pixels = createOffsetGridPixels(width, height, [0, 40, 80, 120], [0, 40, 80, 120, 160]);
  for (const captionY of [35, 75, 115]) {
    for (let x = 0; x < width; x += 1) {
      if (x % 8 > 1) continue;
      const offset = (captionY * width + x) * 4;
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
    }
  }

  const cells = detectMemePackCells(pixels, width, height, 3, 4);
  assert.equal(cells[3].y, 40);
  assert.equal(cells[6].y, 80);
  assert.equal(cells[9].y, 120);
});

test("uses the requested AI canvas ratio instead of forcing every preview tile square", () => {
  assert.equal(getMemePackCanvasAspectRatio(getMemePackLayout("3x4")), 2 / 3);
  assert.equal(getMemePackCanvasAspectRatio(getMemePackLayout("2x2")), 1);
  assert.equal(getMemePackCanvasAspectRatio(getMemePackLayout("3x3")), 1);
  assert.equal(getMemePackCanvasAspectRatio(getMemePackLayout("4x4")), 1);
});

test("adapts the preview to the dimensions the image provider actually returned", () => {
  assert.equal(getMemePackSourceAspectRatio(1024, 1024), 1);
  assert.equal(getMemePackSourceAspectRatio(1024, 1536), 2 / 3);
  assert.throws(() => getMemePackSourceAspectRatio(0, 1024), /原图尺寸无效/);
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
