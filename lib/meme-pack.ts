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

function scoreGridBoundary(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  position: number,
  axis: "x" | "y",
) {
  const crossLength = axis === "x" ? height : width;
  const sampleStep = Math.max(1, Math.floor(crossLength / 256));
  let differenceTotal = 0;
  let strongEdges = 0;
  let luminanceTotal = 0;
  let luminanceSquaredTotal = 0;
  let samples = 0;

  for (let cross = 0; cross < crossLength; cross += sampleStep) {
    const x = axis === "x" ? position : cross;
    const y = axis === "y" ? position : cross;
    const previousX = axis === "x" ? position - 1 : cross;
    const previousY = axis === "y" ? position - 1 : cross;
    const currentIndex = (y * width + x) * 4;
    const previousIndex = (previousY * width + previousX) * 4;
    const difference = (
      Math.abs(pixels[currentIndex] - pixels[previousIndex])
      + Math.abs(pixels[currentIndex + 1] - pixels[previousIndex + 1])
      + Math.abs(pixels[currentIndex + 2] - pixels[previousIndex + 2])
    ) / 3;
    const luminance = (
      pixels[currentIndex] * 0.2126
      + pixels[currentIndex + 1] * 0.7152
      + pixels[currentIndex + 2] * 0.0722
    );
    differenceTotal += difference;
    if (difference >= 28) strongEdges += 1;
    luminanceTotal += luminance;
    luminanceSquaredTotal += luminance * luminance;
    samples += 1;
  }

  if (!samples) return 0;
  const differenceAverage = differenceTotal / samples;
  const strongEdgeCoverage = strongEdges / samples;
  const luminanceAverage = luminanceTotal / samples;
  const variance = Math.max(0, luminanceSquaredTotal / samples - luminanceAverage ** 2);
  const uniformLineBonus = Math.max(0, 30 - Math.sqrt(variance)) * 0.8;
  return differenceAverage + strongEdgeCoverage * 80 + uniformLineBonus;
}

function detectAxisBoundaries(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  segments: number,
  axis: "x" | "y",
) {
  const length = axis === "x" ? width : height;
  const nominalSize = length / segments;
  const searchRadius = Math.max(2, Math.round(nominalSize * 0.16));
  const boundaries = [0];

  for (let index = 1; index < segments; index += 1) {
    const expected = Math.round(nominalSize * index);
    const start = Math.max(1, expected - searchRadius);
    const end = Math.min(length - 1, expected + searchRadius);
    let bestPosition = expected;
    let bestScore = scoreGridBoundary(pixels, width, height, expected, axis);

    for (let position = start; position <= end; position += 1) {
      const distancePenalty = Math.abs(position - expected) / searchRadius * 4;
      const score = scoreGridBoundary(pixels, width, height, position, axis) - distancePenalty;
      if (score > bestScore + 0.5) {
        bestScore = score;
        bestPosition = position;
      }
    }
    boundaries.push(bestPosition);
  }

  boundaries.push(length);
  return boundaries;
}

export function detectMemePackCells(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  columns = MEME_PACK_COLUMNS,
  rows = MEME_PACK_ROWS,
): MemePackCell[] {
  if (pixels.length !== width * height * 4) {
    throw new Error("表情包大图像素数据无效");
  }
  const fallbackCells = getMemePackCells(width, height, columns, rows);
  const xBoundaries = detectAxisBoundaries(pixels, width, height, columns, "x");
  const yBoundaries = detectAxisBoundaries(pixels, width, height, rows, "y");

  return fallbackCells.map((fallback) => {
    const left = xBoundaries[fallback.column];
    const right = xBoundaries[fallback.column + 1];
    const top = yBoundaries[fallback.row];
    const bottom = yBoundaries[fallback.row + 1];
    const detectedWidth = right - left;
    const detectedHeight = bottom - top;
    if (detectedWidth < width / columns * 0.6 || detectedHeight < height / rows * 0.6) {
      return fallback;
    }
    const trimX = Math.max(1, Math.round(detectedWidth * 0.015));
    const trimY = Math.max(1, Math.round(detectedHeight * 0.015));
    return {
      ...fallback,
      x: left + trimX,
      y: top + trimY,
      width: detectedWidth - trimX * 2,
      height: detectedHeight - trimY * 2,
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
