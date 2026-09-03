"use client";

import {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fitGifDimensions,
  inferGifSourceKind,
  normalizeMediaUrl,
  validateGifSourceFile,
  type GifSourceKind,
} from "../lib/gif-media";
import { copyGifBlob } from "../lib/gif-clipboard";
import { createGifFrameEncoder, encodeStillImageGif } from "../lib/generated-image-gif";
import {
  createStillGifFrames,
  GIF_EXPORT_SETTINGS,
  type GifAnimationSpeed,
  type GifExportPreset,
  type StillGifEffect,
  type StillGifFrame,
} from "../lib/gif-effects";

type EditorMode = "imagegen" | "meme" | "gif";
type LayoutId = "poster" | "dialogue" | "sticker" | "editorial";

type MemeTemplate = {
  id: string;
  name: string;
  emoji: string;
  background: [string, string];
  accent: string;
  defaultTop: string;
  defaultBottom: string;
};

type FontOption = {
  id: "fun" | "bold" | "impact" | "round" | "song" | "kai" | "hand" | "mono";
  name: string;
  sample: string;
  family: string;
  weight: number;
};

type LayoutOption = {
  id: LayoutId;
  name: string;
  description: string;
};

type ImageGenerationResponse = {
  imageUrl?: string;
  model?: string;
  referenceUsed?: boolean;
  notice?: string;
  error?: string;
};

type ProviderSettings = {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  imageModelName: string;
};

const DEFAULT_PROVIDER: ProviderSettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  modelName: "gpt-5.6-sol",
  imageModelName: "gpt-image-2",
};

const PROVIDER_STORAGE = {
  enabled: "geng-yixia-provider-enabled",
  baseUrl: "geng-yixia-provider-base-url",
  imageModelName: "geng-yixia-provider-image-model-name",
  apiKey: "geng-yixia-provider-api-key",
};

const FONT_OPTIONS: FontOption[] = [
  { id: "fun", name: "快乐体", sample: "我真服了", family: "'ZCOOL KuaiLe', 'PingFang SC', sans-serif", weight: 400 },
  { id: "bold", name: "爆梗黑", sample: "笑不活了", family: "'Arial Black', 'PingFang SC', 'Microsoft YaHei', sans-serif", weight: 900 },
  { id: "impact", name: "综艺体", sample: "离大谱", family: "Impact, 'Heiti SC', 'Microsoft YaHei', sans-serif", weight: 900 },
  { id: "round", name: "可爱圆", sample: "好耶好耶", family: "'Arial Rounded MT Bold', 'Yuanti SC', 'Microsoft YaHei', sans-serif", weight: 800 },
  { id: "song", name: "报纸宋", sample: "震惊一下", family: "'Songti SC', SimSun, serif", weight: 800 },
  { id: "kai", name: "认真楷", sample: "淡定一点", family: "'Kaiti SC', KaiTi, serif", weight: 700 },
  { id: "hand", name: "潇洒手写", sample: "随它去吧", family: "'Xingkai SC', STXingkai, cursive", weight: 700 },
  { id: "mono", name: "故障等宽", sample: "加载失败", family: "'Courier New', 'Microsoft YaHei', monospace", weight: 900 },
];

const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: "poster", name: "巨字海报", description: "主梗抢占画面" },
  { id: "dialogue", name: "气泡对话", description: "像聊天截图" },
  { id: "sticker", name: "贴纸弹幕", description: "歪一点更有梗" },
  { id: "editorial", name: "杂志标题", description: "克制但有态度" },
];

const TEMPLATES: MemeTemplate[] = [
  {
    id: "deadline",
    name: "临近下班",
    emoji: "😶‍🌫️",
    background: ["#ffdf63", "#ff7a59"],
    accent: "#111111",
    defaultTop: "距离下班还有 5 分钟",
    defaultBottom: "老板：大家先别走",
  },
  {
    id: "loading",
    name: "大脑宕机",
    emoji: "🫠",
    background: ["#7dd3c7", "#c5f0e7"],
    accent: "#163a34",
    defaultTop: "你说得都对",
    defaultBottom: "但我的大脑正在加载",
  },
  {
    id: "shock",
    name: "瞳孔地震",
    emoji: "😳",
    background: ["#b9a7ff", "#7358ff"],
    accent: "#ffffff",
    defaultTop: "听说需求只改一点点",
    defaultBottom: "打开文档：37 条批注",
  },
  {
    id: "win",
    name: "今天稳赢",
    emoji: "😎",
    background: ["#ff8fb1", "#ffcfdd"],
    accent: "#5b1730",
    defaultTop: "事情还没开始做",
    defaultBottom: "气势上已经赢了",
  },
];

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function splitLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3,
) {
  const chars = Array.from(text.trim());
  if (!chars.length) return [];
  const lines: string[] = [];
  let current = "";
  for (const char of chars) {
    const candidate = current + char;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current.trim());
      current = char.trimStart();
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current) {
    const used = lines.join("").length;
    let lastLine = chars.slice(used).join("").trim();
    while (lastLine && context.measureText(lastLine).width > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    if (used + lastLine.length < chars.length && lastLine.length > 1) {
      lastLine = `${lastLine.slice(0, -1)}…`;
    }
    lines.push(lastLine);
  }
  return lines.filter(Boolean);
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function loadCanvasImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (/^https?:\/\//i.test(url)) {
      image.crossOrigin = "anonymous";
      image.referrerPolicy = "no-referrer";
    }
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片无法读取，请下载后再上传"));
    image.src = url;
  });
}

export default function Home() {
  const [mode, setMode] = useState<EditorMode>("imagegen");
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [topText, setTopText] = useState(TEMPLATES[0].defaultTop);
  const [bottomText, setBottomText] = useState(TEMPLATES[0].defaultBottom);
  const [fontSize, setFontSize] = useState(64);
  const [textColor, setTextColor] = useState("#ffffff");
  const [outlineColor, setOutlineColor] = useState("#111111");
  const [fontId, setFontId] = useState<FontOption["id"]>("bold");
  const [layoutId, setLayoutId] = useState<LayoutId>("poster");
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [copyStatus, setCopyStatus] = useState("复制图片");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [useCustomProvider, setUseCustomProvider] = useState(false);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(DEFAULT_PROVIDER);
  const [draftSettings, setDraftSettings] = useState<ProviderSettings>(DEFAULT_PROVIDER);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  const [imagePrompt, setImagePrompt] = useState("一只加班到灵魂出窍的橘猫，配字“我没事，我还能加班”");
  const [imageStyle, setImageStyle] = useState("internet");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceUrl, setReferenceUrl] = useState("");
  const referenceObjectUrlRef = useRef("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [generatedImageModel, setGeneratedImageModel] = useState("");
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageGenError, setImageGenError] = useState("");
  const [imageGenNotice, setImageGenNotice] = useState("");
  const [imageGifDownloading, setImageGifDownloading] = useState(false);
  const [imageGifError, setImageGifError] = useState("");
  const [imageCopyStatus, setImageCopyStatus] = useState("复制图片");
  const [imageWorkflowBusy, setImageWorkflowBusy] = useState<"edit" | "gif" | "">("");

  const [gifSourceKind, setGifSourceKind] = useState<GifSourceKind>("video");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceLink, setSourceLink] = useState("");
  const [sourceReady, setSourceReady] = useState(false);
  const [sourceWidth, setSourceWidth] = useState(0);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [startAt, setStartAt] = useState(0);
  const [clipLength, setClipLength] = useState(3);
  const [gifFps, setGifFps] = useState(8);
  const [gifExportPreset, setGifExportPreset] = useState<GifExportPreset>("compact");
  const [stillGifEffect, setStillGifEffect] = useState<StillGifEffect>("shake");
  const [stillGifSpeed, setStillGifSpeed] = useState<GifAnimationSpeed>("normal");
  const [gifRepeat, setGifRepeat] = useState(0);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [gifUrl, setGifUrl] = useState("");
  const [gifBytes, setGifBytes] = useState(0);
  const [gifError, setGifError] = useState("");
  const [gifCopyStatus, setGifCopyStatus] = useState("复制 GIF");
  const [gifCopying, setGifCopying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const gifPreviewRef = useRef<HTMLImageElement>(null);
  const sourceObjectUrlRef = useRef("");
  const gifObjectUrlRef = useRef("");
  const gifBlobRef = useRef<Blob | null>(null);

  const manualTemplate = useMemo(
    () => TEMPLATES.find((template) => template.id === templateId) ?? TEMPLATES[0],
    [templateId],
  );
  const selectedTemplate = manualTemplate;
  const selectedFont = FONT_OPTIONS.find((font) => font.id === fontId) ?? FONT_OPTIONS[0];
  const selectedLayout = LAYOUT_OPTIONS.find((layout) => layout.id === layoutId) ?? LAYOUT_OPTIONS[0];

  const paintMeme = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const size = 1080;
    canvas.width = size;
    canvas.height = size;
    context.clearRect(0, 0, size, size);

    if (uploadedImage) {
      drawCover(context, uploadedImage, size, size);
      const shade = context.createLinearGradient(0, 0, 0, size);
      shade.addColorStop(0, "rgba(0,0,0,.36)");
      shade.addColorStop(0.35, "rgba(0,0,0,0)");
      shade.addColorStop(0.65, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,.42)");
      context.fillStyle = shade;
      context.fillRect(0, 0, size, size);
    } else {
      const gradient = context.createLinearGradient(60, 40, size - 60, size - 40);
      gradient.addColorStop(0, selectedTemplate.background[0]);
      gradient.addColorStop(1, selectedTemplate.background[1]);
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);

      context.save();
      context.globalAlpha = 0.13;
      context.fillStyle = selectedTemplate.accent;
      for (let row = 0; row < 7; row += 1) {
        for (let column = 0; column < 7; column += 1) {
          if ((row + column) % 2 === 0) {
            context.beginPath();
            context.arc(90 + column * 165, 90 + row * 165, 18, 0, Math.PI * 2);
            context.fill();
          }
        }
      }
      context.restore();
      context.font = "380px Apple Color Emoji, Segoe UI Emoji, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(selectedTemplate.emoji, size / 2, size / 2 + 36);
    }

    const measureLines = (
      text: string,
      textSize: number,
      maxWidth: number,
      maxLines = 3,
      weight = selectedFont.weight,
      family = selectedFont.family,
    ) => {
      context.save();
      context.font = `${weight} ${textSize}px ${family}`;
      const lines = splitLines(context, text, maxWidth, maxLines);
      context.restore();
      return lines;
    };

    const paintLines = (
      lines: string[],
      options: {
        x: number;
        y: number;
        textSize: number;
        align?: CanvasTextAlign;
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
        lineHeight?: number;
        weight?: number;
        family?: string;
      },
    ) => {
      const {
        x,
        y,
        textSize,
        align = "left",
        fill = textColor,
        stroke = outlineColor,
        strokeWidth = Math.max(7, textSize * 0.12),
        lineHeight = textSize * 1.08,
        weight = selectedFont.weight,
        family = selectedFont.family,
      } = options;
      context.save();
      context.font = `${weight} ${textSize}px ${family}`;
      context.textAlign = align;
      context.textBaseline = "middle";
      context.lineJoin = "round";
      context.miterLimit = 2;
      lines.forEach((line, index) => {
        const lineY = y + index * lineHeight;
        if (strokeWidth > 0) {
          context.strokeStyle = stroke;
          context.lineWidth = strokeWidth;
          context.strokeText(line, x, lineY);
        }
        context.fillStyle = fill;
        context.fillText(line, x, lineY);
      });
      context.restore();
    };

    const drawSticker = (
      text: string,
      x: number,
      y: number,
      width: number,
      fill: string,
      foreground: string,
      rotation: number,
      textSize: number,
      maxLines = 2,
    ) => {
      const paddingX = 34;
      const lines = measureLines(text, textSize, width - paddingX * 2, maxLines);
      const lineHeight = textSize * 1.08;
      const height = Math.max(86, lines.length * lineHeight + 42);
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.shadowColor = "rgba(23,23,20,.28)";
      context.shadowBlur = 0;
      context.shadowOffsetX = 12;
      context.shadowOffsetY = 12;
      roundedRectPath(context, -width / 2, -height / 2, width, height, 18);
      context.fillStyle = fill;
      context.fill();
      context.shadowColor = "transparent";
      context.strokeStyle = "#171714";
      context.lineWidth = 7;
      context.stroke();
      paintLines(lines, {
        x: -width / 2 + paddingX,
        y: -((lines.length - 1) * lineHeight) / 2,
        textSize,
        fill: foreground,
        stroke: foreground === "#171714" ? "#171714" : outlineColor,
        strokeWidth: foreground === "#171714" ? 0 : Math.max(5, textSize * .08),
        lineHeight,
      });
      context.restore();
    };

    const drawBubble = (
      text: string,
      x: number,
      y: number,
      width: number,
      fill: string,
      foreground: string,
      label: string,
      tailOnRight = false,
    ) => {
      const textSize = Math.min(68, Math.max(42, fontSize * .78));
      const lines = measureLines(text, textSize, width - 76, 3);
      const lineHeight = textSize * 1.12;
      const height = Math.max(150, lines.length * lineHeight + 86);
      context.save();
      roundedRectPath(context, x, y, width, height, 34);
      context.fillStyle = fill;
      context.fill();
      context.strokeStyle = "#171714";
      context.lineWidth = 8;
      context.stroke();
      context.beginPath();
      if (tailOnRight) {
        context.moveTo(x + width - 118, y + height - 5);
        context.lineTo(x + width - 48, y + height + 52);
        context.lineTo(x + width - 58, y + height - 5);
      } else {
        context.moveTo(x + 72, y + height - 5);
        context.lineTo(x + 28, y + height + 52);
        context.lineTo(x + 128, y + height - 5);
      }
      context.closePath();
      context.fillStyle = fill;
      context.fill();
      context.strokeStyle = "#171714";
      context.lineWidth = 8;
      context.stroke();
      context.fillStyle = "#171714";
      context.font = "900 24px Arial, PingFang SC, sans-serif";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(label, x + 36, y + 30);
      paintLines(lines, {
        x: x + 38,
        y: y + 72,
        textSize,
        fill: foreground,
        stroke: foreground,
        strokeWidth: 0,
        lineHeight,
      });
      context.restore();
      return height;
    };

    const mainSize = Math.min(122, Math.max(62, fontSize * 1.36));
    const supportSize = Math.min(62, Math.max(34, fontSize * .68));

    if (layoutId === "poster") {
      context.save();
      context.translate(1012, 500);
      context.rotate(Math.PI / 2);
      context.font = "900 22px Arial, sans-serif";
      context.textAlign = "center";
      context.fillStyle = "rgba(23,23,20,.7)";
      context.fillText("TODAY'S MOOD  ·  TODAY'S MOOD", 0, 0);
      context.restore();
      drawSticker(topText, 390, 156, 650, "#ffd84d", "#171714", -.035, supportSize, 2);
      context.fillStyle = "#171714";
      context.fillRect(68, 570, 150, 18);
      const posterLines = measureLines(bottomText, mainSize, 930, 3);
      paintLines(posterLines, {
        x: 70,
        y: 650,
        textSize: mainSize,
        fill: textColor,
        stroke: outlineColor,
        strokeWidth: Math.max(10, mainSize * .13),
        lineHeight: mainSize * 1.02,
      });
    } else if (layoutId === "dialogue") {
      drawBubble(topText, 68, 110, 720, "rgba(255,253,248,.95)", "#171714", "我");
      drawBubble(bottomText, 292, 690, 720, "#ffd84d", "#171714", "现实", true);
    } else if (layoutId === "sticker") {
      context.save();
      context.font = "900 86px Arial, sans-serif";
      context.fillStyle = "#ff6b46";
      context.fillText("✦", 850, 180);
      context.fillStyle = "#ffd84d";
      context.fillText("!!!", 76, 840);
      context.restore();
      drawSticker(topText, 410, 190, 760, "#fffdf8", "#171714", -.055, Math.min(70, supportSize * 1.08), 2);
      drawSticker(bottomText, 640, 770, 790, "#171714", textColor, .045, Math.min(92, mainSize * .76), 3);
      context.save();
      context.translate(116, 500);
      context.rotate(-.08);
      context.fillStyle = "#8cd8ca";
      context.strokeStyle = "#171714";
      context.lineWidth = 5;
      context.fillRect(-20, -42, 180, 70);
      context.strokeRect(-20, -42, 180, 70);
      context.fillStyle = "#171714";
      context.font = "900 24px monospace";
      context.fillText("MOOD #01", 0, 4);
      context.restore();
    } else {
      context.fillStyle = "#ff6b46";
      context.fillRect(0, 0, 44, size);
      context.save();
      context.translate(24, 540);
      context.rotate(-Math.PI / 2);
      context.font = "900 18px monospace";
      context.textAlign = "center";
      context.fillStyle = "#171714";
      context.fillText("GENG YI XIA · DAILY EMOTION", 0, 0);
      context.restore();
      drawSticker(topText, 360, 148, 560, "#ffd84d", "#171714", -.02, supportSize, 2);
      context.fillStyle = "rgba(23,23,20,.9)";
      context.strokeStyle = "rgba(255,255,255,.9)";
      context.lineWidth = 6;
      roundedRectPath(context, 72, 600, 936, 350, 8);
      context.fill();
      context.stroke();
      const editorialLines = measureLines(bottomText, Math.min(104, mainSize), 850, 3);
      paintLines(editorialLines, {
        x: 110,
        y: 690,
        textSize: Math.min(104, mainSize),
        fill: textColor,
        stroke: outlineColor,
        strokeWidth: Math.max(5, mainSize * .07),
        lineHeight: Math.min(104, mainSize) * 1.02,
      });
      context.fillStyle = "#ffd84d";
      context.font = "900 20px monospace";
      context.textAlign = "right";
      context.fillText("VOL. 01 / FEELING", 978, 924);
    }

    context.save();
    context.font = "700 24px Arial, PingFang SC, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.fillStyle = "rgba(255,255,255,.76)";
    context.strokeStyle = "rgba(0,0,0,.35)";
    context.lineWidth = 4;
    context.strokeText("梗一下 · 本地创作", size - 24, size - 20);
    context.fillText("梗一下 · 本地创作", size - 24, size - 20);
    context.restore();
  }, [bottomText, fontSize, layoutId, outlineColor, selectedFont, selectedTemplate, textColor, topText, uploadedImage]);

  useEffect(() => {
    paintMeme();
  }, [paintMeme]);

  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    document.fonts.ready.then(() => paintMeme());
  }, [fontId, paintMeme]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved: ProviderSettings = {
        baseUrl: localStorage.getItem(PROVIDER_STORAGE.baseUrl) || DEFAULT_PROVIDER.baseUrl,
        apiKey: sessionStorage.getItem(PROVIDER_STORAGE.apiKey) || "",
        modelName: DEFAULT_PROVIDER.modelName,
        imageModelName: localStorage.getItem(PROVIDER_STORAGE.imageModelName) || DEFAULT_PROVIDER.imageModelName,
      };
      const enabled = localStorage.getItem(PROVIDER_STORAGE.enabled) === "true";
      setProviderSettings(saved);
      setDraftSettings(saved);
      setUseCustomProvider(enabled);
      setDraftEnabled(enabled);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  useEffect(() => () => {
    if (sourceObjectUrlRef.current) URL.revokeObjectURL(sourceObjectUrlRef.current);
    if (gifObjectUrlRef.current) URL.revokeObjectURL(gifObjectUrlRef.current);
    if (referenceObjectUrlRef.current) URL.revokeObjectURL(referenceObjectUrlRef.current);
  }, []);

  const pickTemplate = (template: MemeTemplate) => {
    setTemplateId(template.id);
    setTopText(template.defaultTop);
    setBottomText(template.defaultBottom);
    setUploadedImage(null);
    setUploadName("");
  };

  const loadImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setUploadedImage(image);
      setUploadName(file.name);
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
    event.target.value = "";
  };

  const downloadMeme = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `梗一下-${Date.now()}.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  const copyMeme = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.clipboard || typeof ClipboardItem === "undefined") {
      setCopyStatus("请用下载");
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopyStatus("已复制 ✓");
      } catch {
        setCopyStatus("请用下载");
      }
      setTimeout(() => setCopyStatus("复制图片"), 1800);
    }, "image/png");
  };

  const openSettings = () => {
    setDraftSettings(providerSettings);
    setDraftEnabled(useCustomProvider);
    setSettingsError("");
    setShowApiKey(false);
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const baseUrl = draftSettings.baseUrl.trim().replace(/\/+$/, "");
    const imageModelName = draftSettings.imageModelName.trim();

    if (draftEnabled) {
      try {
        const parsed = new URL(baseUrl);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
          throw new Error();
        }
      } catch {
        setSettingsError("Base URL 必须是有效的 HTTPS 地址");
        return;
      }
      if (!imageModelName) {
        setSettingsError("请填写生图模型名称");
        return;
      }
    }

    const nextSettings = {
      baseUrl: baseUrl || DEFAULT_PROVIDER.baseUrl,
      apiKey: draftSettings.apiKey.trim(),
      modelName: DEFAULT_PROVIDER.modelName,
      imageModelName: imageModelName || DEFAULT_PROVIDER.imageModelName,
    };
    setProviderSettings(nextSettings);
    setUseCustomProvider(draftEnabled);
    localStorage.setItem(PROVIDER_STORAGE.enabled, String(draftEnabled));
    localStorage.setItem(PROVIDER_STORAGE.baseUrl, nextSettings.baseUrl);
    localStorage.setItem(PROVIDER_STORAGE.imageModelName, nextSettings.imageModelName);
    if (nextSettings.apiKey) {
      sessionStorage.setItem(PROVIDER_STORAGE.apiKey, nextSettings.apiKey);
    } else {
      sessionStorage.removeItem(PROVIDER_STORAGE.apiKey);
    }
    setSettingsOpen(false);
  };

  const resetSettings = () => {
    setDraftSettings(DEFAULT_PROVIDER);
    setDraftEnabled(false);
    setProviderSettings(DEFAULT_PROVIDER);
    setUseCustomProvider(false);
    Object.values(PROVIDER_STORAGE).forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    setSettingsError("");
  };

  const loadReferenceImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageGenError("参考图片仅支持 JPG、PNG 或 WEBP");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageGenError("参考图片请控制在 10 MB 以内");
      return;
    }
    if (referenceObjectUrlRef.current) URL.revokeObjectURL(referenceObjectUrlRef.current);
    const nextReferenceUrl = URL.createObjectURL(file);
    referenceObjectUrlRef.current = nextReferenceUrl;
    setReferenceFile(file);
    setReferenceUrl(nextReferenceUrl);
    setGeneratedImageUrl("");
    setGeneratedImageModel("");
    setImageGenNotice("");
    setImageGenError("");
    setImageGifError("");
    setImageCopyStatus("复制图片");
  };

  const removeReferenceImage = () => {
    if (referenceObjectUrlRef.current) URL.revokeObjectURL(referenceObjectUrlRef.current);
    referenceObjectUrlRef.current = "";
    setReferenceFile(null);
    setReferenceUrl("");
    setGeneratedImageUrl("");
    setGeneratedImageModel("");
    setImageGenNotice("");
    setImageGifError("");
    setImageCopyStatus("复制图片");
  };

  const generateMemeImage = async () => {
    const prompt = imagePrompt.trim();
    if (prompt.length < 2 || imageGenerating) return;
    setImageGenerating(true);
    setImageGenError("");
    setImageGenNotice("");
    setImageGifError("");
    setImageCopyStatus("复制图片");

    try {
      const form = new FormData();
      form.append("prompt", prompt);
      form.append("style", imageStyle);
      if (referenceFile) form.append("image", referenceFile, referenceFile.name);
      if (useCustomProvider) form.append("provider", JSON.stringify(providerSettings));

      const response = await fetch("/api/generate-image", { method: "POST", body: form });
      const data = (await response.json()) as ImageGenerationResponse;
      if (!response.ok || data.error || !data.imageUrl) {
        throw new Error(data.error || "这次没有生成图片，请再试一次");
      }
      setGeneratedImageUrl(data.imageUrl);
      setGeneratedImageModel(data.model || "");
      setImageGenNotice(data.notice || "表情包生成完成");
    } catch (error) {
      setImageGenError(error instanceof Error ? error.message : "生图失败，请稍后再试");
    } finally {
      setImageGenerating(false);
    }
  };

  const downloadGeneratedImageGif = async () => {
    if (!generatedImageUrl || imageGifDownloading) return;
    setImageGifDownloading(true);
    setImageGifError("");

    try {
      const source = await loadCanvasImage(generatedImageUrl);
      if (!source.naturalWidth || !source.naturalHeight) {
        throw new Error("生成图片尚未加载完成，请稍后再试");
      }

      const maxEdge = Math.min(1024, Math.max(source.naturalWidth, source.naturalHeight));
      const { width, height } = fitGifDimensions(source.naturalWidth, source.naturalHeight, maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("浏览器无法创建 GIF 画布");
      context.drawImage(source, 0, 0, width, height);

      const rgba = new Uint8Array(context.getImageData(0, 0, width, height).data.buffer);
      const bytes = await encodeStillImageGif(rgba, width, height);
      const blob = new Blob([bytes.buffer], { type: "image/gif" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `梗一下-AI表情包-${Date.now()}.gif`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      const isSecurityError = error instanceof DOMException && error.name === "SecurityError";
      setImageGifError(isSecurityError
        ? "图片来源禁止跨域读取，暂时无法转成 GIF；你仍可下载高清图"
        : error instanceof Error ? error.message : "GIF 生成失败，请稍后再试");
    } finally {
      setImageGifDownloading(false);
    }
  };

  const copyGeneratedImage = async () => {
    if (!generatedImageUrl || imageCopyStatus !== "复制图片") return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setImageCopyStatus("请使用下载");
      window.setTimeout(() => setImageCopyStatus("复制图片"), 2000);
      return;
    }

    setImageCopyStatus("复制中…");
    setImageGifError("");
    try {
      const source = await loadCanvasImage(generatedImageUrl);
      const canvas = document.createElement("canvas");
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器无法创建复制画布");
      context.drawImage(source, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("无法生成可复制图片"));
        }, "image/png");
      });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setImageCopyStatus("已复制 ✓");
    } catch (error) {
      setImageCopyStatus("复制失败");
      setImageGifError(error instanceof Error ? error.message : "图片复制失败，请使用下载");
    } finally {
      window.setTimeout(() => setImageCopyStatus("复制图片"), 2200);
    }
  };

  const clearGifResult = () => {
    if (gifObjectUrlRef.current) URL.revokeObjectURL(gifObjectUrlRef.current);
    gifObjectUrlRef.current = "";
    gifBlobRef.current = null;
    setGifUrl("");
    setGifBytes(0);
    setProgress(0);
    setGifCopyStatus("复制 GIF");
    setGifCopying(false);
  };

  const clearGifSource = () => {
    if (sourceObjectUrlRef.current) URL.revokeObjectURL(sourceObjectUrlRef.current);
    sourceObjectUrlRef.current = "";
    clearGifResult();
    setSourceUrl("");
    setSourceName("");
    setSourceReady(false);
    setSourceWidth(0);
    setSourceHeight(0);
    setVideoDuration(0);
    setStartAt(0);
    setClipLength(3);
    setGifError("");
  };

  const setGifSource = (kind: GifSourceKind, url: string, name: string, ownedObjectUrl = "") => {
    if (sourceObjectUrlRef.current) URL.revokeObjectURL(sourceObjectUrlRef.current);
    sourceObjectUrlRef.current = ownedObjectUrl;
    clearGifResult();
    setGifSourceKind(kind);
    setSourceUrl(url);
    setSourceName(name);
    setSourceReady(false);
    setSourceWidth(0);
    setSourceHeight(0);
    setVideoDuration(0);
    setStartAt(0);
    setClipLength(3);
    setGifError("");
  };

  const continueEditingGeneratedImage = async () => {
    if (!generatedImageUrl || imageWorkflowBusy) return;
    setImageWorkflowBusy("edit");
    setImageGifError("");
    try {
      const image = await loadCanvasImage(generatedImageUrl);
      setUploadedImage(image);
      setUploadName("AI 生成图片");
      setTopText("");
      setBottomText("");
      setMode("meme");
      window.requestAnimationFrame(() => document.querySelector(".creator-shell")?.scrollIntoView({ behavior: "smooth" }));
    } catch (error) {
      setImageGifError(error instanceof Error ? error.message : "暂时无法继续编辑这张图片");
    } finally {
      setImageWorkflowBusy("");
    }
  };

  const animateGeneratedImage = () => {
    if (!generatedImageUrl || imageWorkflowBusy) return;
    setImageWorkflowBusy("gif");
    setSourceLink("");
    setStillGifEffect("shake");
    setGifSource("image", generatedImageUrl, "AI 生成图片.png");
    setMode("gif");
    window.requestAnimationFrame(() => document.querySelector(".creator-shell")?.scrollIntoView({ behavior: "smooth" }));
    setImageWorkflowBusy("");
  };

  const acceptGifFile = (file: File) => {
    if (converting) return;
    const validation = validateGifSourceFile(file);
    if (validation.error) {
      setGifError(validation.error);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setSourceLink("");
    setGifSource(validation.kind, objectUrl, file.name, objectUrl);
  };

  const loadGifFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) acceptGifFile(file);
  };

  const loadRemoteGifSource = (rawUrl = sourceLink) => {
    if (converting) return;
    try {
      const normalizedUrl = normalizeMediaUrl(rawUrl);
      const kind = inferGifSourceKind(normalizedUrl, gifSourceKind);
      const parsed = new URL(normalizedUrl);
      const filename = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname);
      setSourceLink(normalizedUrl);
      setGifSource(kind, normalizedUrl, filename);
    } catch (error) {
      setGifError(error instanceof Error ? error.message : "素材直链格式不正确");
    }
  };

  const switchGifSourceKind = (kind: GifSourceKind) => {
    if (kind === gifSourceKind || converting) return;
    clearGifSource();
    setSourceLink("");
    setGifSourceKind(kind);
  };

  const handleGifPaste = (event: ReactClipboardEvent<HTMLElement>) => {
    if (converting || settingsOpen) return;
    const target = event.target as HTMLElement;
    const isUnrelatedEditable = (
      target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target.isContentEditable
    ) && !target.hasAttribute("data-gif-source-link");
    if (isUnrelatedEditable) return;

    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"));
    const imageFile = imageItem?.getAsFile();
    if (imageFile) {
      event.preventDefault();
      const extension = imageFile.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
      acceptGifFile(new File([imageFile], `粘贴图片-${Date.now()}.${extension}`, { type: imageFile.type }));
      return;
    }

    const pastedText = event.clipboardData.getData("text/plain").trim();
    if (/^https?:\/\//i.test(pastedText)) {
      event.preventDefault();
      setSourceLink(pastedText);
      loadRemoteGifSource(pastedText);
    }
  };

  const onVideoMetadata = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) {
      setGifError("无法读取视频信息，请换一个文件或直链");
      return;
    }
    setSourceReady(true);
    setSourceWidth(video.videoWidth);
    setSourceHeight(video.videoHeight);
    setVideoDuration(video.duration);
    setClipLength(Math.min(3, video.duration));
    setGifError("");
  };

  const onImageLoaded = () => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth || !image.naturalHeight) return;
    setSourceReady(true);
    setSourceWidth(image.naturalWidth);
    setSourceHeight(image.naturalHeight);
    setGifError("");
  };

  const onGifSourceError = () => {
    setSourceReady(false);
    setGifError("无法加载素材。请确认直链可公开访问，或下载素材后上传");
  };

  const seekVideo = (video: HTMLVideoElement, target: number) =>
    new Promise<void>((resolve, reject) => {
      if (Math.abs(video.currentTime - target) < 0.002) {
        resolve();
        return;
      }
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("读取视频帧超时"));
      }, 5000);
      const done = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener("seeked", done);
      };
      video.addEventListener("seeked", done, { once: true });
      video.currentTime = target;
    });

  const convertToGif = async () => {
    const video = videoRef.current;
    const image = imageRef.current;
    if (!sourceReady || converting) return;
    if (gifSourceKind === "video" && (!video || !videoDuration)) return;
    if (gifSourceKind === "image" && !image) return;
    setConverting(true);
    setGifError("");
    setProgress(0);
    clearGifResult();

    try {
      const exportSettings = GIF_EXPORT_SETTINGS[gifExportPreset];
      const { width, height } = fitGifDimensions(sourceWidth, sourceHeight, exportSettings.maxEdge);
      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = width;
      frameCanvas.height = height;
      const context = frameCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("浏览器无法创建画布");

      const repeat = gifSourceKind === "image" && stillGifEffect === "still" ? -1 : gifRepeat;
      const encoder = await createGifFrameEncoder(width, height, exportSettings.colors, repeat);
      const writeCurrentFrame = (
        source: CanvasImageSource,
        delay: number,
        transform?: StillGifFrame,
      ) => {
        context.clearRect(0, 0, width, height);
        if (transform) {
          context.save();
          context.translate(
            width / 2 + transform.offsetX * width,
            height / 2 + transform.offsetY * height,
          );
          context.rotate((transform.rotation * Math.PI) / 180);
          const drawWidth = width * transform.scale;
          const drawHeight = height * transform.scale;
          context.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
          context.restore();
          if (transform.flash > 0) {
            context.fillStyle = `rgba(255,255,255,${transform.flash})`;
            context.fillRect(0, 0, width, height);
          }
        } else {
          context.drawImage(source, 0, 0, width, height);
        }
        const imageData = context.getImageData(0, 0, width, height);
        const rgba = new Uint8Array(imageData.data.buffer);
        encoder.writeFrame(rgba, delay);
      };

      if (gifSourceKind === "image" && image) {
        const animation = createStillGifFrames(stillGifEffect, stillGifSpeed);
        for (let frame = 0; frame < animation.frames.length; frame += 1) {
          writeCurrentFrame(
            image,
            animation.delay,
            animation.frames[frame],
          );
          setProgress(Math.round(((frame + 1) / animation.frames.length) * 100));
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      } else if (video) {
        const safeLength = Math.min(clipLength, 6, videoDuration - startAt);
        const frameCount = Math.max(1, Math.ceil(safeLength * gifFps));
        for (let frame = 0; frame < frameCount; frame += 1) {
          const time = Math.min(startAt + frame / gifFps, videoDuration - 0.01);
          await seekVideo(video, Math.max(0, time));
          writeCurrentFrame(video, Math.round(1000 / gifFps));
          setProgress(Math.round(((frame + 1) / frameCount) * 100));
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }
      const bytes = encoder.finish();
      const blob = new Blob([bytes.slice().buffer], { type: "image/gif" });
      const url = URL.createObjectURL(blob);
      gifObjectUrlRef.current = url;
      gifBlobRef.current = blob;
      setGifUrl(url);
      setGifBytes(blob.size);
    } catch (error) {
      const isSecurityError = error instanceof DOMException && error.name === "SecurityError";
      setGifError(isSecurityError
        ? "直链素材禁止跨域读取（CORS），请先下载到本地再上传"
        : error instanceof Error ? error.message : "转换失败，请换一个素材试试");
    } finally {
      setConverting(false);
    }
  };

  const copyGif = async () => {
    const gifBlob = gifBlobRef.current;
    if (
      !gifBlob
      || !navigator.clipboard?.write
      || typeof ClipboardItem === "undefined"
      || gifCopying
    ) {
      setGifCopyStatus("请使用下载");
      return;
    }

    setGifCopying(true);
    setGifCopyStatus("复制中…");
    try {
      const mode = await copyGifBlob({
        gifBlob,
        canWriteGif: typeof ClipboardItem.supports === "function" && ClipboardItem.supports("image/gif"),
        createItem: (representations) => new ClipboardItem(representations),
        write: (items) => navigator.clipboard.write(items),
        createPngFallback: async () => {
          const image = gifPreviewRef.current;
          if (!image) throw new Error("GIF 预览尚未就绪");
          if (!image.complete) await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("浏览器无法创建画布");
          context.drawImage(image, 0, 0);
          return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error("无法生成复制预览"));
            }, "image/png");
          });
        },
      });
      setGifCopyStatus(mode === "gif" ? "已复制 GIF ✓" : "已复制预览 ✓");
    } catch {
      setGifCopyStatus("复制失败，请下载");
    } finally {
      setGifCopying(false);
      window.setTimeout(() => setGifCopyStatus("复制 GIF"), 2200);
    }
  };

  const maxStart = Math.max(0, videoDuration - 0.2);
  const maxClip = Math.max(0.2, Math.min(6, videoDuration - startAt || 6));

  return (
    <main onPaste={mode === "gif" ? handleGifPaste : undefined}>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="梗一下首页">
          <span className="brand-face" aria-hidden="true">:D</span>
          <span>梗一下</span>
        </a>
        <div className="header-actions">
          <div className="header-note"><span className="privacy-dot" /> 流向透明 · 密钥不落盘</div>
          <button className="settings-button" type="button" onClick={openSettings}>
            <span aria-hidden="true">⚙</span>
            <span>AI 设置</span>
            <small>{useCustomProvider ? providerSettings.imageModelName : "站点默认"}</small>
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">30 秒，造个好梗</p>
          <h1>不学 PS，<br /><span>也能做表情包。</span></h1>
        </div>
        <p className="hero-copy">描述画面，或者直接上传素材。<br />AI 生图、图片编辑、GIF 一站做好。</p>
      </section>

      <section className="creator-shell" aria-label="表情包创作工具">
        <div className="mode-tabs" role="tablist" aria-label="选择工具">
          <button
            className={mode === "imagegen" ? "active" : ""}
            onClick={() => setMode("imagegen")}
            role="tab"
            aria-selected={mode === "imagegen"}
          >
            <span>01</span> AI 生图 <b>NEW</b>
          </button>
          <button
            className={mode === "meme" ? "active" : ""}
            onClick={() => setMode("meme")}
            role="tab"
            aria-selected={mode === "meme"}
          >
            <span>02</span> 图片表情包
          </button>
          <button
            className={mode === "gif" ? "active" : ""}
            onClick={() => setMode("gif")}
            role="tab"
            aria-selected={mode === "gif"}
          >
            <span>03</span> 图片 / 视频转 GIF
          </button>
        </div>

        {mode === "imagegen" ? (
          <div className="workspace imagegen-workspace">
            <section className="control-panel imagegen-controls" aria-label="AI 生图设置">
              <div className="section-heading">
                <span>1</span>
                <div><h2>描述你的表情包</h2><p>一句话讲清主角、情绪和笑点</p></div>
              </div>

              <div className="image-prompt-field">
                <textarea
                  value={imagePrompt}
                  onChange={(event) => setImagePrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) generateMemeImage();
                  }}
                  maxLength={600}
                  placeholder="比如：一只被周一吓到瞳孔地震的橘猫，配字“怎么又周一”"
                  aria-label="表情包生图提示词"
                />
                <span>{imagePrompt.length}/600</span>
              </div>

              <div className="image-prompt-examples" aria-label="提示词示例">
                {[
                  "一只无语到翻白眼的猫，配字“你开心就好”",
                  "打工人灵魂出窍地坐在电脑前，适合回复加班消息",
                  "开心得原地起飞的柴犬，夸张贴纸表情包",
                ].map((example) => (
                  <button key={example} onClick={() => setImagePrompt(example)}>{example}</button>
                ))}
              </div>

              <p className="mini-label">选一种画风</p>
              <div className="image-style-grid" aria-label="选择生图风格">
                {[
                  ["internet", "斗图经典", "直接 · 好懂"],
                  ["sticker", "立体贴纸", "精致 · 可爱"],
                  ["doodle", "手绘发疯", "松弛 · 有梗"],
                  ["absurd", "抽象超现实", "离谱 · 抓眼"],
                  ["photo", "写实反应图", "真实 · 戏剧"],
                ].map(([id, label, description]) => (
                  <button key={id} className={imageStyle === id ? "selected" : ""} onClick={() => setImageStyle(id)}>
                    <b>{label}</b><small>{description}</small>
                  </button>
                ))}
              </div>

              <div className="divider" />

              <div className="section-heading compact">
                <span>2</span>
                <div><h2>参考图（可选）</h2><p>上传角色或照片，AI 会参考主体重画</p></div>
              </div>

              {referenceUrl && referenceFile ? (
                <div className="reference-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={referenceUrl} alt="参考图片预览" />
                  <span><b>{referenceFile.name}</b><small>{fileSizeLabel(referenceFile.size)} · 将发送给 AI 服务</small></span>
                  <button type="button" onClick={removeReferenceImage} aria-label="移除参考图片">×</button>
                </div>
              ) : (
                <label className="reference-upload">
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={loadReferenceImage} />
                  <span aria-hidden="true">＋</span>
                  <b>添加一张参考图</b>
                  <small>JPG / PNG / WEBP · 最大 10 MB</small>
                </label>
              )}

              <button className="button image-generate-button" onClick={generateMemeImage} disabled={imageGenerating || imagePrompt.trim().length < 2}>
                <span className="sparkle" aria-hidden="true">✦</span>
                {imageGenerating ? "正在把脑洞画出来，可能需要 1–2 分钟…" : referenceFile ? "参考这张图生成表情包" : "生成一张原创表情包"}
                <span aria-hidden="true">→</span>
              </button>
              <button className="provider-shortcut" type="button" onClick={openSettings}>
                生图模型：{useCustomProvider ? `${providerSettings.imageModelName} · 自定义接口` : "站点默认接口"}
                <span>切换 →</span>
              </button>
              {imageGenError && <p className="error-message">{imageGenError}</p>}
              <p className="reference-disclosure">参考图只会在你点击生成时，发送给当前配置的 AI 服务；手动做图和 GIF 仍完全在本机处理。</p>
            </section>

            <section className="preview-panel imagegen-preview" aria-label="AI 生图预览">
              <div className="preview-title"><span>{generatedImageUrl ? "新鲜出炉" : "AI 画布"}</span><small>1:1 · 1024 × 1024</small></div>
              <div className={`imagegen-stage ${generatedImageUrl ? "has-image" : "empty"}`} aria-busy={imageGenerating}>
                {generatedImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={generatedImageUrl} alt="AI 生成的表情包" />
                ) : (
                  <div className="imagegen-empty"><span>AI</span><p>等待你的脑洞</p><small>提示词或参考图，都能变成一张新表情包</small></div>
                )}
                {imageGenerating && (
                  <div className="generation-loader"><span>✦</span><b>正在生成表情包</b><small>请别关闭页面，复杂画面会多等一会儿</small></div>
                )}
              </div>
              {generatedImageUrl ? (
                <>
                  <div className="image-result-meta"><span>{imageGenNotice || "生成成功 ✓"}</span><b>{generatedImageModel || "AI Image"}</b></div>
                  <div className="action-row image-result-actions">
                    <a className="button primary" href={generatedImageUrl} download="梗一下-AI表情包.png">下载高清图 <span>↓</span></a>
                    <button className="button secondary" type="button" onClick={copyGeneratedImage} disabled={imageCopyStatus === "复制中…"}>
                      {imageCopyStatus}
                    </button>
                  </div>
                  <div className="image-workflow-actions">
                    <button type="button" onClick={continueEditingGeneratedImage} disabled={Boolean(imageWorkflowBusy)}>
                      <span aria-hidden="true">✎</span>
                      <b>{imageWorkflowBusy === "edit" ? "正在载入…" : "继续编辑"}</b>
                      <small>改文字、字体与版式</small>
                    </button>
                    <button type="button" onClick={animateGeneratedImage} disabled={Boolean(imageWorkflowBusy)}>
                      <span aria-hidden="true">↝</span>
                      <b>制作动态 GIF</b>
                      <small>抖动、弹跳、缩放、闪烁</small>
                    </button>
                  </div>
                  {imageGifError && <p className="error-message image-gif-error">{imageGifError}</p>}
                  <div className="image-result-links">
                    <button className="text-button" type="button" onClick={downloadGeneratedImageGif} disabled={imageGifDownloading}>
                      {imageGifDownloading ? "正在生成…" : "直接下载静态 GIF"}
                    </button>
                    <button className="text-button" type="button" onClick={generateMemeImage} disabled={imageGenerating}>同一提示词再生成</button>
                  </div>
                </>
              ) : (
                <p className="local-hint">✦ 系统会自动把需求收敛为适合聊天转发的单张表情包</p>
              )}
            </section>
          </div>
        ) : mode === "meme" ? (
          <div className="workspace">
            <section className="control-panel" aria-label="编辑设置">
              <div className="section-heading">
                <span>1</span>
                <div><h2>选一张底图</h2><p>热门模板，或者用你自己的</p></div>
              </div>

              <div className="template-grid">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className={`template-card ${!uploadedImage && template.id === templateId ? "selected" : ""}`}
                    onClick={() => pickTemplate(template)}
                    style={{
                      background: `linear-gradient(135deg, ${template.background[0]}, ${template.background[1]})`,
                    }}
                    aria-label={`使用${template.name}模板`}
                  >
                    <span>{template.emoji}</span>
                    <small>{template.name}</small>
                  </button>
                ))}
              </div>

              <label className={`upload-button ${uploadedImage ? "has-file" : ""}`}>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={loadImage} />
                <span className="upload-plus">＋</span>
                <span>{uploadName || "上传自己的图片"}<small>JPG / PNG / WEBP</small></span>
              </label>

              <div className="divider" />

              <div className="section-heading compact">
                <span>2</span>
                <div><h2>写点什么</h2><p>版式、文案和字体都会实时更新</p></div>
              </div>

              <label className="field-label" htmlFor="top-copy">铺垫文案</label>
              <div className="text-field-wrap">
                <textarea id="top-copy" value={topText} onChange={(event) => setTopText(event.target.value)} maxLength={40} />
                <small>{topText.length}/40</small>
              </div>

              <label className="field-label" htmlFor="bottom-copy">包袱文案</label>
              <div className="text-field-wrap">
                <textarea id="bottom-copy" value={bottomText} onChange={(event) => setBottomText(event.target.value)} maxLength={40} />
                <small>{bottomText.length}/40</small>
              </div>

              <p className="mini-label layout-label">排版玩法 · {selectedLayout.name}</p>
              <div className="layout-grid" aria-label="选择文字排版">
                {LAYOUT_OPTIONS.map((layout) => (
                  <button
                    key={layout.id}
                    className={layoutId === layout.id ? `selected ${layout.id}` : layout.id}
                    onClick={() => setLayoutId(layout.id)}
                    aria-label={`使用${layout.name}排版`}
                  >
                    <span className="layout-mini" aria-hidden="true"><i /><i /><i /></span>
                    <span><b>{layout.name}</b><small>{layout.description}</small></span>
                  </button>
                ))}
              </div>

              <p className="mini-label font-label">字体风格 · {selectedFont.name}</p>
              <div className="font-grid" aria-label="选择字体">
                {FONT_OPTIONS.map((font) => (
                  <button
                    key={font.id}
                    className={fontId === font.id ? "selected" : ""}
                    onClick={() => setFontId(font.id)}
                    style={{ fontFamily: font.family, fontWeight: font.weight }}
                    aria-label={`使用${font.name}`}
                  >
                    <span>{font.sample}</span><small>{font.name}</small>
                  </button>
                ))}
              </div>

              <div className="style-row">
                <label>
                  <span>字号 {fontSize}</span>
                  <input type="range" min="42" max="92" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />
                </label>
                <label className="color-control">
                  <span>文字</span>
                  <input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} aria-label="文字颜色" />
                </label>
                <label className="color-control">
                  <span>描边</span>
                  <input type="color" value={outlineColor} onChange={(event) => setOutlineColor(event.target.value)} aria-label="描边颜色" />
                </label>
              </div>
            </section>

            <section className="preview-panel" aria-label="效果预览">
              <div className="preview-title"><span>实时预览</span><small>1080 × 1080</small></div>
              <div className="canvas-stage">
                <canvas ref={canvasRef} aria-label="表情包预览" />
                <span className="tape tape-one" />
                <span className="tape tape-two" />
              </div>
              <div className="action-row">
                <button className="button secondary" onClick={copyMeme}>{copyStatus}</button>
                <button className="button primary" onClick={downloadMeme}>下载高清 PNG <span>↓</span></button>
              </div>
              <p className="local-hint">✓ 图片只在当前浏览器中处理，不会上传</p>
            </section>
          </div>
        ) : (
          <div className="workspace gif-workspace">
            <section className="control-panel" aria-label="GIF 转换设置">
              <div className="media-kind-tabs" role="tablist" aria-label="选择 GIF 素材类型">
                <button type="button" role="tab" disabled={converting} aria-selected={gifSourceKind === "video"} className={gifSourceKind === "video" ? "active" : ""} onClick={() => switchGifSourceKind("video")}>视频转 GIF</button>
                <button type="button" role="tab" disabled={converting} aria-selected={gifSourceKind === "image"} className={gifSourceKind === "image" ? "active" : ""} onClick={() => switchGifSourceKind("image")}>图片转 GIF</button>
              </div>

              <div className="section-heading">
                <span>1</span>
                <div>
                  <h2>{gifSourceKind === "video" ? "放入一段视频" : "放入一张图片"}</h2>
                  <p>{gifSourceKind === "video" ? "上传文件或粘贴可访问的视频直链" : "支持上传、粘贴剪贴板图片或图片直链"}</p>
                </div>
              </div>

              <label className={`video-drop ${sourceUrl ? "has-file" : ""}`}>
                <input
                  type="file"
                  disabled={converting}
                  accept={gifSourceKind === "video" ? "video/mp4,video/webm,video/quicktime,video/ogg" : "image/jpeg,image/png,image/webp,image/avif,image/bmp"}
                  onChange={loadGifFile}
                />
                <span className="film-icon" aria-hidden="true">{gifSourceKind === "video" ? "▶" : "▧"}</span>
                <strong>{sourceName || (gifSourceKind === "video" ? "点击选择视频" : "点击选择图片")}</strong>
                <small>{sourceUrl ? "点击可重新选择" : gifSourceKind === "video" ? "MP4 / MOV / WEBM · 最大 200 MB" : "JPG / PNG / WEBP 等 · 最大 20 MB"}</small>
              </label>

              <div className="source-or"><span>或者使用直链</span></div>
              <div className="source-link-row">
                <input
                  type="url"
                  data-gif-source-link
                  disabled={converting}
                  value={sourceLink}
                  onChange={(event) => setSourceLink(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") loadRemoteGifSource();
                  }}
                  placeholder={gifSourceKind === "video" ? "粘贴 https://…/video.mp4" : "粘贴 https://…/image.jpg"}
                  aria-label={gifSourceKind === "video" ? "视频直链" : "图片直链"}
                />
                <button type="button" onClick={() => loadRemoteGifSource()} disabled={converting || !sourceLink.trim()}>读取</button>
              </div>
              <p className="paste-hint">⌘V / Ctrl+V：{gifSourceKind === "image" ? "可直接粘贴剪贴板图片或图片直链" : "可直接粘贴视频直链"}</p>

              {sourceUrl && (
                <>
                  <div className="divider" />
                  <div className="section-heading compact">
                    <span>2</span>
                    <div>
                      <h2>{gifSourceKind === "video" ? "选取精彩片段" : "让图片动起来"}</h2>
                      <p>{gifSourceKind === "video" ? "最长截取 6 秒，效果更轻巧" : "选择一个适合这张梗图的循环动效"}</p>
                    </div>
                  </div>

                  {gifSourceKind === "video" && sourceReady && (
                    <>
                      <label className="range-setting">
                        <span><b>开始时间</b><output>{startAt.toFixed(1)}s</output></span>
                        <input
                          type="range"
                          min="0"
                          max={maxStart}
                          step="0.1"
                          value={startAt}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setStartAt(value);
                            setClipLength((length) => Math.min(length, Math.max(0.2, videoDuration - value)));
                            if (videoRef.current) videoRef.current.currentTime = value;
                          }}
                        />
                      </label>

                      <label className="range-setting">
                        <span><b>片段长度</b><output>{clipLength.toFixed(1)}s</output></span>
                        <input type="range" min="0.2" max={maxClip} step="0.1" value={Math.min(clipLength, maxClip)} onChange={(event) => setClipLength(Number(event.target.value))} />
                      </label>
                    </>
                  )}

                  {gifSourceKind === "image" && (
                    <div className="effect-grid" aria-label="选择图片动效">
                      {[
                        ["still", "静态兼容", "■"],
                        ["shake", "发疯抖动", "≋"],
                        ["bounce", "开心弹跳", "↕"],
                        ["zoom", "强调缩放", "⊕"],
                        ["flash", "高亮闪烁", "✦"],
                      ].map(([id, label, icon]) => (
                        <button
                          key={id}
                          type="button"
                          className={stillGifEffect === id ? "selected" : ""}
                          onClick={() => setStillGifEffect(id as StillGifEffect)}
                          disabled={converting}
                        >
                          <span aria-hidden="true">{icon}</span>
                          <b>{label}</b>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="select-row">
                    {gifSourceKind === "video" ? (
                      <label><span>流畅度</span><select value={gifFps} onChange={(event) => setGifFps(Number(event.target.value))}><option value="6">省空间 · 6 FPS</option><option value="8">推荐 · 8 FPS</option><option value="12">流畅 · 12 FPS</option></select></label>
                    ) : (
                      <label><span>动效速度</span><select value={stillGifSpeed} onChange={(event) => setStillGifSpeed(event.target.value as GifAnimationSpeed)} disabled={stillGifEffect === "still"}><option value="slow">慢一点</option><option value="normal">刚刚好</option><option value="fast">快一点</option></select></label>
                    )}
                    <label><span>循环次数</span><select value={gifRepeat} onChange={(event) => setGifRepeat(Number(event.target.value))} disabled={gifSourceKind === "image" && stillGifEffect === "still"}><option value="-1">播放一次</option><option value="2">循环 3 次</option><option value="0">一直循环</option></select></label>
                  </div>

                  <p className="mini-label export-label">导出规格</p>
                  <div className="export-preset-grid" aria-label="选择 GIF 导出规格">
                    <button type="button" className={gifExportPreset === "compact" ? "selected" : ""} onClick={() => setGifExportPreset("compact")} disabled={converting}>
                      <b>小体积</b><small>360px · 64 色 · 更易发送</small>
                    </button>
                    <button type="button" className={gifExportPreset === "hd" ? "selected" : ""} onClick={() => setGifExportPreset("hd")} disabled={converting}>
                      <b>高清 GIF</b><small>640px · 128 色 · 细节更多</small>
                    </button>
                  </div>

                  <button className="button primary convert-button" onClick={convertToGif} disabled={converting || !sourceReady}>
                    {converting ? `正在生成 ${progress}%` : sourceReady ? gifSourceKind === "image" && stillGifEffect !== "still" ? "生成动态 GIF" : "生成 GIF" : "正在读取素材…"}
                    <span>{converting ? "···" : "→"}</span>
                  </button>
                  {converting && <div className="progress-track" aria-label={`转换进度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>}
                </>
              )}
              {gifError && <p className="error-message">{gifError}</p>}
            </section>

            <section className="preview-panel" aria-label="素材与 GIF 预览">
              <div className="preview-title">
                <span>{gifUrl ? "GIF 已生成" : gifSourceKind === "video" ? "视频预览" : "图片预览"}</span>
                <small>{gifSourceKind === "video" && videoDuration ? `${videoDuration.toFixed(1)} 秒` : sourceReady ? `${sourceWidth} × ${sourceHeight}` : gifSourceKind === "video" ? "等待视频" : "等待图片"}</small>
              </div>
              <div className={`video-stage ${!sourceUrl ? "empty" : ""}`}>
                {gifUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img ref={gifPreviewRef} src={gifUrl} alt="生成的 GIF 预览" />
                ) : sourceUrl && gifSourceKind === "video" ? (
                  <video ref={videoRef} src={sourceUrl} crossOrigin="anonymous" controls playsInline onLoadedMetadata={onVideoMetadata} onError={onGifSourceError} />
                ) : sourceUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img ref={imageRef} src={sourceUrl} crossOrigin="anonymous" referrerPolicy="no-referrer" alt="待转换图片预览" onLoad={onImageLoaded} onError={onGifSourceError} />
                ) : (
                  <div className="empty-state"><span>GIF</span><p>上传、粘贴或使用直链</p><small>转换过程仍在当前浏览器完成</small></div>
                )}
              </div>
              {gifUrl ? (
                <>
                  <div className="gif-result-meta"><span>生成成功 ✓</span><b>{fileSizeLabel(gifBytes)}</b></div>
                  <div className="action-row gif-action-row">
                    <button className="button secondary" type="button" onClick={copyGif} disabled={gifCopying}>{gifCopyStatus}</button>
                    <a className="button primary" href={gifUrl} download="梗一下.gif">下载 GIF <span>↓</span></a>
                  </div>
                  <p className="copy-hint">支持 GIF 剪贴板的浏览器会保留动图；其他浏览器自动复制可粘贴的预览。</p>
                  <button className="text-button" onClick={clearGifResult}>调整参数重新生成</button>
                </>
              ) : (
                <p className="local-hint">✓ 上传与粘贴的素材不会离开当前浏览器；直链只从原地址读取</p>
              )}
            </section>
          </div>
        )}
      </section>

      <section className="benefits" aria-label="产品特点">
        <article><span>01</span><h3>AI 生图接着玩</h3><p>成图可以复制、继续编辑，或加上抖动与弹跳效果做成动态 GIF。</p></article>
        <article><span>02</span><h3>素材流向说清楚</h3><p>手动图片与视频在本机处理；参考图仅在 AI 生图时发送给所选服务。</p></article>
        <article><span>03</span><h3>手动编辑也够好玩</h3><p>四种构图、八种字体与自定义配色，随时把 AI 灵感改成你的梗。</p></article>
      </section>

      <footer><span>梗一下 · 让每句话都有表情</span><small>Made for 灵感爆发的那一刻</small></footer>

      {settingsOpen && (
        <div className="settings-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-header">
              <div>
                <p>OPENAI COMPATIBLE</p>
                <h2 id="settings-title">AI 接口设置</h2>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="关闭设置">×</button>
            </div>

            <label className="settings-toggle">
              <span><b>使用自定义接口</b><small>关闭时使用站点默认服务</small></span>
              <input type="checkbox" checked={draftEnabled} onChange={(event) => setDraftEnabled(event.target.checked)} />
              <i aria-hidden="true" />
            </label>

            <div className={`settings-fields ${draftEnabled ? "" : "disabled"}`}>
              <label className="settings-field">
                <span>Base URL</span>
                <input
                  type="url"
                  value={draftSettings.baseUrl}
                  onChange={(event) => setDraftSettings((current) => ({ ...current, baseUrl: event.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  disabled={!draftEnabled}
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <small>填写 API 根地址，通常以 /v1 结尾</small>
              </label>

              <label className="settings-field">
                <span>API Key</span>
                <div className="api-key-wrap">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={draftSettings.apiKey}
                    onChange={(event) => setDraftSettings((current) => ({ ...current, apiKey: event.target.value }))}
                    placeholder="sk-..."
                    disabled={!draftEnabled}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                  <button type="button" onClick={() => setShowApiKey((visible) => !visible)} disabled={!draftEnabled}>
                    {showApiKey ? "隐藏" : "显示"}
                  </button>
                </div>
                <small>仅保存在当前浏览器会话；无鉴权的兼容接口可留空</small>
              </label>

              <label className="settings-field">
                <span>Image Model Name</span>
                <input
                  type="text"
                  value={draftSettings.imageModelName}
                  onChange={(event) => setDraftSettings((current) => ({ ...current, imageModelName: event.target.value }))}
                  placeholder="gpt-image-2"
                  disabled={!draftEnabled}
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <small>用于“AI 生图”的图片模型 ID，接口需兼容 Images API</small>
              </label>
            </div>

            <div className="settings-security">
              <span aria-hidden="true">⌁</span>
              <p><b>密钥如何使用？</b><br />生成时经本站临时转发到你填写的接口，不写入源码、日志或数据库。关闭浏览器会话后自动清除。</p>
            </div>
            {settingsError && <p className="settings-error">{settingsError}</p>}

            <div className="settings-actions">
              <button className="reset-settings" type="button" onClick={resetSettings}>恢复默认</button>
              <button className="button primary" type="button" onClick={saveSettings}>保存设置 <span>✓</span></button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
