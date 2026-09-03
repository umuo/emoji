export async function encodeStillImageGif(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("GIF 尺寸无效");
  }
  if (rgba.length !== width * height * 4) {
    throw new Error("GIF 像素数据不完整");
  }

  const { GIFEncoder, applyPalette, quantize } = await import("gifenc");
  const palette = quantize(rgba, 256);
  const indexed = applyPalette(rgba, palette);
  const encoder = GIFEncoder();
  encoder.writeFrame(indexed, width, height, { palette, delay: 1000, repeat: 0 });
  encoder.finish();
  return encoder.bytes().slice();
}
