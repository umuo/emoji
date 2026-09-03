type RgbaPixels = Uint8Array | Uint8ClampedArray;

function validateFrame(rgba: RgbaPixels, width: number, height: number) {
  if (rgba.length !== width * height * 4) {
    throw new Error("GIF 像素数据不完整");
  }
}

export async function createGifFrameEncoder(
  width: number,
  height: number,
  maxColors = 128,
  repeat = 0,
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("GIF 尺寸无效");
  }
  if (!Number.isInteger(maxColors) || maxColors < 2 || maxColors > 256) {
    throw new Error("GIF 色彩数量无效");
  }

  const { GIFEncoder, applyPalette, quantize } = await import("gifenc");
  const encoder = GIFEncoder();
  let frameCount = 0;

  return {
    writeFrame(rgba: RgbaPixels, delay: number) {
      validateFrame(rgba, width, height);
      const palette = quantize(rgba, maxColors);
      const indexed = applyPalette(rgba, palette);
      encoder.writeFrame(indexed, width, height, {
        palette,
        delay,
        ...(frameCount === 0 ? { repeat } : {}),
      });
      frameCount += 1;
    },
    finish() {
      if (!frameCount) throw new Error("GIF 至少需要一帧");
      encoder.finish();
      return encoder.bytes().slice();
    },
  };
}

export async function encodeStillImageGif(
  rgba: RgbaPixels,
  width: number,
  height: number,
) {
  const encoder = await createGifFrameEncoder(width, height, 256, -1);
  encoder.writeFrame(rgba, 1000);
  return encoder.finish();
}
