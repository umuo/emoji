declare module "gifenc" {
  export type Palette = number[][];

  export type FrameOptions = {
    palette: Palette;
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
  };

  export type Encoder = {
    writeFrame: (
      indexedPixels: Uint8Array,
      width: number,
      height: number,
      options: FrameOptions,
    ) => void;
    finish: () => void;
    bytes: () => Uint8Array;
  };

  export function GIFEncoder(options?: { auto?: boolean }): Encoder;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: Record<string, unknown>,
  ): Palette;
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: "rgb444" | "rgb565" | "rgba4444",
  ): Uint8Array;
}
