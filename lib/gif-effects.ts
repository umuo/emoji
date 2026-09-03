export type StillGifEffect = "still" | "shake" | "bounce" | "zoom" | "flash";
export type GifAnimationSpeed = "slow" | "normal" | "fast";
export type GifExportPreset = "compact" | "hd";

export type StillGifFrame = {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  flash: number;
};

const SPEED_SETTINGS: Record<GifAnimationSpeed, { frames: number; delay: number }> = {
  slow: { frames: 16, delay: 100 },
  normal: { frames: 12, delay: 80 },
  fast: { frames: 10, delay: 60 },
};

export const GIF_EXPORT_SETTINGS: Record<GifExportPreset, { maxEdge: number; colors: number }> = {
  compact: { maxEdge: 360, colors: 64 },
  hd: { maxEdge: 640, colors: 128 },
};

export function createStillGifFrames(effect: StillGifEffect, speed: GifAnimationSpeed) {
  if (effect === "still") {
    return { delay: 1000, frames: [{ scale: 1, offsetX: 0, offsetY: 0, rotation: 0, flash: 0 }] };
  }

  const settings = SPEED_SETTINGS[speed];
  const frames = Array.from({ length: settings.frames }, (_, index): StillGifFrame => {
    const phase = (index / settings.frames) * Math.PI * 2;
    if (effect === "shake") {
      return {
        scale: 1.045,
        offsetX: Math.sin(phase * 3) * 0.014,
        offsetY: Math.cos(phase * 4) * 0.009,
        rotation: Math.sin(phase * 3) * 1.6,
        flash: 0,
      };
    }
    if (effect === "bounce") {
      const lift = Math.abs(Math.sin(phase));
      return {
        scale: 1.06 + lift * 0.04,
        offsetX: 0,
        offsetY: -lift * 0.045,
        rotation: Math.sin(phase) * 0.8,
        flash: 0,
      };
    }
    if (effect === "zoom") {
      return {
        scale: 1 + (1 - Math.cos(phase)) * 0.06,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        flash: 0,
      };
    }
    return {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      flash: index % 4 === 0 ? 0.3 : 0,
    };
  });

  return { delay: settings.delay, frames };
}
