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

function analyzeGridBoundary(
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

  if (!samples) return { score: 0, edgeCoverage: 0, luminanceDeviation: Number.POSITIVE_INFINITY };
  const differenceAverage = differenceTotal / samples;
  const strongEdgeCoverage = strongEdges / samples;
  const luminanceAverage = luminanceTotal / samples;
  const variance = Math.max(0, luminanceSquaredTotal / samples - luminanceAverage ** 2);
  const luminanceDeviation = Math.sqrt(variance);
  const uniformLineBonus = Math.max(0, 30 - luminanceDeviation) * 0.8;
  return {
    score: differenceAverage + strongEdgeCoverage * 180 + uniformLineBonus,
    edgeCoverage: strongEdgeCoverage,
    luminanceDeviation,
  };
}

// Duo captions often hide part of a boundary. Require a background-color
// transition in every panel, excluding black text and white sticker outlines.
function duoBackgroundBoundaryScore(
  pixels: Uint8ClampedArray, width: number, height: number,
  position: number, axis: "x" | "y", crossSegments: number,
) {
  const crossLength = axis === "x" ? height : width;
  let total = 0;
  for (let segment = 0; segment < crossSegments; segment += 1) {
    const start = Math.ceil(crossLength * segment / crossSegments);
    const end = Math.floor(crossLength * (segment + 1) / crossSegments);
    let matches = 0;
    for (let cross = start; cross < end; cross += 1) {
      const offset = (axis === "y" ? position * width + cross : cross * width + position) * 4;
      const previous = offset - (axis === "y" ? width : 1) * 4;
      const a = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      const b = [pixels[previous], pixels[previous + 1], pixels[previous + 2]];
      const background = (rgb: number[]) => Math.min(...rgb) > 65
        && Math.max(...rgb) > 145 && Math.max(...rgb) - Math.min(...rgb) > 25;
      if (background(a) && background(b)
        && a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / 3 >= 18) matches += 1;
    }
    const coverage = matches / Math.max(1, end - start);
    if (coverage < 0.3) return 0;
    total += coverage;
  }
  return total / crossSegments;
}

function detectAxisBoundaries(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  segments: number,
  axis: "x" | "y",
  duoCrossSegments = 0,
) {
  const length = axis === "x" ? width : height;
  const nominalSize = length / segments;
  const searchRadius = Math.max(2, Math.round(nominalSize * 0.1));
  const boundaries = [0];

  for (let index = 1; index < segments; index += 1) {
    const expected = Math.round(nominalSize * index);
    const start = Math.max(1, expected - searchRadius);
    const end = Math.min(length - 1, expected + searchRadius);
    let bestPosition = expected;
    let bestScore = analyzeGridBoundary(pixels, width, height, expected, axis).score;

    for (let position = start; position <= end; position += 1) {
      const analysis = analyzeGridBoundary(pixels, width, height, position, axis);
      const isContinuousBoundary = analysis.edgeCoverage >= 0.85;
      if (!isContinuousBoundary) continue;
      const distancePenalty = Math.abs(position - expected) / searchRadius * 8;
      const score = analysis.score - distancePenalty;
      if (score > bestScore + 12) {
        bestScore = score;
        bestPosition = position;
      }
    }
    boundaries.push(bestPosition);
    if (duoCrossSegments) {
      let backgroundScore = duoBackgroundBoundaryScore(pixels, width, height, bestPosition, axis, duoCrossSegments);
      for (let position = start; position <= end; position += 1) {
        const score = duoBackgroundBoundaryScore(pixels, width, height, position, axis, duoCrossSegments);
        if (score > backgroundScore + 0.05) {
          backgroundScore = score;
          boundaries[boundaries.length - 1] = position;
        }
      }
    }
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
  subjectMode: "single" | "duo" = "single",
): MemePackCell[] {
  if (pixels.length !== width * height * 4) {
    throw new Error("表情包大图像素数据无效");
  }
  const fallbackCells = getMemePackCells(width, height, columns, rows);
  const xBoundaries = detectAxisBoundaries(pixels, width, height, columns, "x", subjectMode === "duo" ? rows : 0);
  const yBoundaries = detectAxisBoundaries(pixels, width, height, rows, "y", subjectMode === "duo" ? columns : 0);

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
    return {
      ...fallback,
      x: left,
      y: top,
      width: detectedWidth,
      height: detectedHeight,
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
