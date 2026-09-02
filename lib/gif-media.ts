export type GifSourceKind = "video" | "image";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "jpeg", "jpg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "ogg", "ogv", "webm"]);
const IMAGE_MIME_TYPES = new Set(["image/avif", "image/bmp", "image/jpeg", "image/png", "image/webp"]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/ogg", "video/quicktime", "video/webm", "video/x-m4v"]);

function extensionOf(value: string) {
  const cleanValue = value.split(/[?#]/, 1)[0];
  return cleanValue.slice(cleanValue.lastIndexOf(".") + 1).toLowerCase();
}

export function inferGifSourceKind(
  value: { name?: string; type?: string } | string,
  fallback: GifSourceKind,
): GifSourceKind {
  if (typeof value !== "string") {
    const mimeType = value.type?.toLowerCase() ?? "";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    return inferGifSourceKind(value.name ?? "", fallback);
  }

  const extension = extensionOf(value);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return fallback;
}

export function validateGifSourceFile(file: { name: string; size: number; type: string }) {
  const kind = inferGifSourceKind(file, "video");
  const extension = extensionOf(file.name);
  const supported = kind === "image"
    ? IMAGE_MIME_TYPES.has(file.type.toLowerCase()) || (!file.type && IMAGE_EXTENSIONS.has(extension))
    : VIDEO_MIME_TYPES.has(file.type.toLowerCase()) || (!file.type && VIDEO_EXTENSIONS.has(extension));

  if (!supported) {
    return { error: "仅支持常见图片或 MP4、MOV、WEBM 视频", kind } as const;
  }

  const maxBytes = kind === "image" ? 20 * 1024 * 1024 : 200 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      error: kind === "image" ? "图片请控制在 20 MB 以内" : "视频请控制在 200 MB 以内",
      kind,
    } as const;
  }

  return { error: "", kind } as const;
}

export function normalizeMediaUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error();
    }
    return parsed.href;
  } catch {
    throw new Error("请输入有效的 HTTP(S) 素材直链");
  }
}

export function fitGifDimensions(sourceWidth: number, sourceHeight: number, longestEdge: number) {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("无法读取素材尺寸");
  }
  const scale = longestEdge / Math.max(sourceWidth, sourceHeight);
  const even = (value: number) => {
    const rounded = Math.max(2, Math.round(value));
    return rounded % 2 === 0 ? rounded : rounded + 1;
  };
  return {
    width: even(sourceWidth * scale),
    height: even(sourceHeight * scale),
  };
}
