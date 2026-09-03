export const MEME_PACK_COLUMNS = 3;
export const MEME_PACK_ROWS = 4;
export const MEME_PACK_COUNT = MEME_PACK_COLUMNS * MEME_PACK_ROWS;

export type MemePackCell = {
  index: number;
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getMemePackCells(width: number, height: number): MemePackCell[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("表情包大图尺寸无效");
  }

  const cellWidth = width / MEME_PACK_COLUMNS;
  const cellHeight = height / MEME_PACK_ROWS;
  return Array.from({ length: MEME_PACK_COUNT }, (_, index) => {
    const column = index % MEME_PACK_COLUMNS;
    const row = Math.floor(index / MEME_PACK_COLUMNS);
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
) {
  if (files.length !== MEME_PACK_COUNT) {
    throw new Error(`压缩包必须包含 ${MEME_PACK_COUNT} 张表情包`);
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
