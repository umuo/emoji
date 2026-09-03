import { MEME_PACK_COLUMNS, MEME_PACK_COUNT, MEME_PACK_ROWS } from "./meme-pack-layouts";

export * from "./meme-pack-layouts";

export type MemePackCell = {
  index: number;
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getMemePackCells(
  width: number,
  height: number,
  columns = MEME_PACK_COLUMNS,
  rows = MEME_PACK_ROWS,
): MemePackCell[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("表情包大图尺寸无效");
  }
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
    throw new Error("表情包网格规格无效");
  }

  const cellWidth = width / columns;
  const cellHeight = height / rows;
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      index,
      column,
      row,
      x: column * cellWidth,
      y: row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    };
  });
}

export function getMemePackFilename(index: number, extension: "png" | "gif") {
  return `梗一下-表情包-${String(index + 1).padStart(2, "0")}.${extension}`;
}

export async function createMemePackArchive(
  files: Array<{ name: string; data: Blob | Uint8Array }>,
  expectedCount = MEME_PACK_COUNT,
) {
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || files.length !== expectedCount) {
    throw new Error(`压缩包必须包含 ${expectedCount} 张表情包`);
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  files.forEach((file) => zip.file(file.name, file.data));
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
