"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type EditorMode = "ai" | "meme" | "gif";

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

type AiIdea = {
  label: string;
  top: string;
  bottom: string;
  emoji: string;
  palette: keyof typeof PALETTES;
  fontId: FontOption["id"];
};

type AiResponse = {
  source: "ai" | "local";
  notice?: string;
  emotion: string;
  candidates: AiIdea[];
  error?: string;
};

const PALETTES = {
  sunset: { background: ["#ffdf63", "#ff6b46"] as [string, string], accent: "#171714" },
  mint: { background: ["#8cd8ca", "#d9f5ef"] as [string, string], accent: "#163a34" },
  violet: { background: ["#b9a7ff", "#7358ff"] as [string, string], accent: "#ffffff" },
  pink: { background: ["#ff8fb1", "#ffd4e0"] as [string, string], accent: "#5b1730" },
  ice: { background: ["#a7dcff", "#edf8ff"] as [string, string], accent: "#17425b" },
  lime: { background: ["#d5ef62", "#8cd8ca"] as [string, string], accent: "#24320f" },
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

function fileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const [mode, setMode] = useState<EditorMode>("ai");
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [topText, setTopText] = useState(TEMPLATES[0].defaultTop);
  const [bottomText, setBottomText] = useState(TEMPLATES[0].defaultBottom);
  const [fontSize, setFontSize] = useState(64);
  const [textColor, setTextColor] = useState("#ffffff");
  const [outlineColor, setOutlineColor] = useState("#111111");
  const [fontId, setFontId] = useState<FontOption["id"]>("bold");
  const [aiVisual, setAiVisual] = useState<MemeTemplate | null>(null);
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [copyStatus, setCopyStatus] = useState("复制图片");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [feeling, setFeeling] = useState("我真服了。。。");
  const [aiTone, setAiTone] = useState("natural");
  const [aiIdeas, setAiIdeas] = useState<AiIdea[]>([]);
  const [aiEmotion, setAiEmotion] = useState("");
  const [aiSource, setAiSource] = useState<"ai" | "local" | "">("");
  const [aiNotice, setAiNotice] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const [videoUrl, setVideoUrl] = useState("");
  const [videoName, setVideoName] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [startAt, setStartAt] = useState(0);
  const [clipLength, setClipLength] = useState(3);
  const [gifFps, setGifFps] = useState(8);
  const [gifDimension, setGifDimension] = useState(480);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [gifUrl, setGifUrl] = useState("");
  const [gifBytes, setGifBytes] = useState(0);
  const [gifError, setGifError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  const manualTemplate = useMemo(
    () => TEMPLATES.find((template) => template.id === templateId) ?? TEMPLATES[0],
    [templateId],
  );
  const selectedTemplate = aiVisual ?? manualTemplate;
  const selectedFont = FONT_OPTIONS.find((font) => font.id === fontId) ?? FONT_OPTIONS[0];

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

    const drawText = (text: string, anchorY: number, fromBottom = false) => {
      context.font = `${selectedFont.weight} ${fontSize}px ${selectedFont.family}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineJoin = "round";
      context.miterLimit = 2;
      const lines = splitLines(context, text, size - 140, 3);
      const lineHeight = fontSize * 1.2;
      const blockHeight = (lines.length - 1) * lineHeight;
      const firstY = fromBottom ? anchorY - blockHeight : anchorY;
      lines.forEach((line, index) => {
        const y = firstY + index * lineHeight;
        context.strokeStyle = outlineColor;
        context.lineWidth = Math.max(8, fontSize * 0.16);
        context.strokeText(line, size / 2, y);
        context.fillStyle = textColor;
        context.fillText(line, size / 2, y);
      });
    };

    drawText(topText, 105);
    drawText(bottomText, size - 110, true);

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
  }, [bottomText, fontSize, outlineColor, selectedFont, selectedTemplate, textColor, topText, uploadedImage]);

  useEffect(() => {
    paintMeme();
  }, [paintMeme]);

  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    document.fonts.ready.then(() => paintMeme());
  }, [fontId, paintMeme]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (gifUrl) URL.revokeObjectURL(gifUrl);
    };
  }, [gifUrl, videoUrl]);

  const pickTemplate = (template: MemeTemplate) => {
    setTemplateId(template.id);
    setAiVisual(null);
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
      setAiVisual(null);
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

  const applyAiIdea = (idea: AiIdea, index: number) => {
    const palette = PALETTES[idea.palette] ?? PALETTES.sunset;
    setAiVisual({
      id: `ai-${index}`,
      name: idea.label,
      emoji: Array.from(idea.emoji || "😶").slice(0, 3).join(""),
      background: palette.background,
      accent: palette.accent,
      defaultTop: idea.top,
      defaultBottom: idea.bottom,
    });
    setTopText(idea.top.slice(0, 40));
    setBottomText(idea.bottom.slice(0, 40));
    setFontId(idea.fontId);
    setUploadedImage(null);
    setUploadName("");
  };

  const generateFromFeeling = async () => {
    if (feeling.trim().length < 2 || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    setAiNotice("");

    try {
      const response = await fetch("/api/generate-meme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feeling: feeling.trim(), tone: aiTone }),
      });
      const data = (await response.json()) as AiResponse;
      if (!response.ok || data.error) throw new Error(data.error || "生成失败，请稍后再试");
      if (!Array.isArray(data.candidates) || !data.candidates.length) {
        throw new Error("这次没接住情绪，再试一次吧");
      }
      setAiIdeas(data.candidates);
      setAiEmotion(data.emotion);
      setAiSource(data.source);
      setAiNotice(data.notice || "");
      applyAiIdea(data.candidates[0], 0);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "生成失败，请稍后再试");
    } finally {
      setAiLoading(false);
    }
  };

  const loadVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      setGifError("视频请控制在 200 MB 以内");
      event.target.value = "";
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setVideoDuration(0);
    setStartAt(0);
    setClipLength(3);
    setGifUrl("");
    setGifBytes(0);
    setGifError("");
    setProgress(0);
    event.target.value = "";
  };

  const onVideoMetadata = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    setVideoDuration(video.duration);
    setClipLength(Math.min(3, video.duration));
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
    if (!video || !videoDuration || converting) return;
    setConverting(true);
    setGifError("");
    setProgress(0);
    if (gifUrl) {
      URL.revokeObjectURL(gifUrl);
      setGifUrl("");
    }

    try {
      const { GIFEncoder, applyPalette, quantize } = await import("gifenc");
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      const isLandscape = sourceWidth >= sourceHeight;
      const outputWidth = isLandscape
        ? gifDimension
        : Math.max(2, Math.round((sourceWidth / sourceHeight) * gifDimension));
      const outputHeight = isLandscape
        ? Math.max(2, Math.round((sourceHeight / sourceWidth) * gifDimension))
        : gifDimension;
      const width = outputWidth % 2 === 0 ? outputWidth : outputWidth + 1;
      const height = outputHeight % 2 === 0 ? outputHeight : outputHeight + 1;
      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = width;
      frameCanvas.height = height;
      const context = frameCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("浏览器无法创建画布");

      const safeLength = Math.min(clipLength, 6, videoDuration - startAt);
      const frameCount = Math.max(1, Math.ceil(safeLength * gifFps));
      const encoder = GIFEncoder();
      for (let frame = 0; frame < frameCount; frame += 1) {
        const time = Math.min(startAt + frame / gifFps, videoDuration - 0.01);
        await seekVideo(video, Math.max(0, time));
        context.drawImage(video, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        const rgba = new Uint8Array(imageData.data.buffer);
        const palette = quantize(rgba, 128);
        const indexed = applyPalette(rgba, palette);
        encoder.writeFrame(indexed, width, height, {
          palette,
          delay: Math.round(1000 / gifFps),
        });
        setProgress(Math.round(((frame + 1) / frameCount) * 100));
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      encoder.finish();
      const bytes = encoder.bytes();
      const blob = new Blob([bytes.slice().buffer], { type: "image/gif" });
      const url = URL.createObjectURL(blob);
      setGifUrl(url);
      setGifBytes(blob.size);
    } catch (error) {
      setGifError(error instanceof Error ? error.message : "转换失败，请换一个视频试试");
    } finally {
      setConverting(false);
    }
  };

  const maxStart = Math.max(0, videoDuration - 0.2);
  const maxClip = Math.max(0.2, Math.min(6, videoDuration - startAt || 6));

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="梗一下首页">
          <span className="brand-face" aria-hidden="true">:D</span>
          <span>梗一下</span>
        </a>
        <div className="header-note"><span className="privacy-dot" /> 素材本地处理 · AI 只读你的心情</div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">30 秒，造个好梗</p>
          <h1>不学 PS，<br /><span>也能做表情包。</span></h1>
        </div>
        <p className="hero-copy">说出现在的感受，AI 帮你接梗。<br />图片和视频也都能自己做。</p>
      </section>

      <section className="creator-shell" aria-label="表情包创作工具">
        <div className="mode-tabs" role="tablist" aria-label="选择工具">
          <button
            className={mode === "ai" ? "active" : ""}
            onClick={() => setMode("ai")}
            role="tab"
            aria-selected={mode === "ai"}
          >
            <span>01</span> AI 心情出图 <b>NEW</b>
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
            <span>03</span> 视频转 GIF
          </button>
        </div>

        {mode !== "gif" ? (
          <div className="workspace">
            <section className="control-panel" aria-label="编辑设置">
              {mode === "ai" ? (
                <>
                  <div className="section-heading">
                    <span>1</span>
                    <div><h2>现在是什么感受？</h2><p>越像你平时说话，生成的梗越自然</p></div>
                  </div>

                  <div className="feeling-field">
                    <textarea
                      value={feeling}
                      onChange={(event) => setFeeling(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) generateFromFeeling();
                      }}
                      maxLength={120}
                      placeholder="比如：我真服了。。。"
                      aria-label="描述当前感受"
                    />
                    <span>{feeling.length}/120</span>
                  </div>

                  <div className="feeling-examples" aria-label="感受示例">
                    {["我真服了。。。", "累到不想说话", "今天也太爽了吧", "尴尬得想换个星球"].map((example) => (
                      <button key={example} onClick={() => setFeeling(example)}>{example}</button>
                    ))}
                  </div>

                  <p className="mini-label">想要什么语气</p>
                  <div className="tone-grid">
                    {[
                      ["natural", "自然吐槽"],
                      ["work", "打工人"],
                      ["cute", "可爱一点"],
                      ["savage", "嘴替模式"],
                      ["absurd", "抽象发疯"],
                    ].map(([id, label]) => (
                      <button key={id} className={aiTone === id ? "selected" : ""} onClick={() => setAiTone(id)}>{label}</button>
                    ))}
                  </div>

                  <button className="button ai-generate-button" onClick={generateFromFeeling} disabled={aiLoading || feeling.trim().length < 2}>
                    <span className="sparkle" aria-hidden="true">✦</span>
                    {aiLoading ? "AI 正在琢磨你的心情…" : "AI 帮我出三套梗"}
                    <span aria-hidden="true">→</span>
                  </button>
                  {aiError && <p className="error-message">{aiError}</p>}

                  {aiIdeas.length > 0 && (
                    <div className="ai-results">
                      <div className="ai-results-title">
                        <span>{aiSource === "ai" ? "AI 已接住" : "灵感已接住"} · {aiEmotion}</span>
                        <small>点一套换上</small>
                      </div>
                      <div className="idea-list">
                        {aiIdeas.map((idea, index) => (
                          <button
                            key={`${idea.label}-${index}`}
                            className={aiVisual?.id === `ai-${index}` ? "selected" : ""}
                            onClick={() => applyAiIdea(idea, index)}
                          >
                            <span className="idea-emoji">{idea.emoji}</span>
                            <span><b>{idea.label}</b><small>{idea.top} / {idea.bottom}</small></span>
                          </button>
                        ))}
                      </div>
                      {aiNotice && <p className="ai-notice">{aiNotice}</p>}
                    </div>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}

              <div className="divider" />

              <div className="section-heading compact">
                <span>2</span>
                <div><h2>{mode === "ai" ? "不满意就自己改" : "写点什么"}</h2><p>文案和字体都会实时更新</p></div>
              </div>

              <label className="field-label" htmlFor="top-copy">上方文字</label>
              <div className="text-field-wrap">
                <textarea id="top-copy" value={topText} onChange={(event) => setTopText(event.target.value)} maxLength={40} />
                <small>{topText.length}/40</small>
              </div>

              <label className="field-label" htmlFor="bottom-copy">下方文字</label>
              <div className="text-field-wrap">
                <textarea id="bottom-copy" value={bottomText} onChange={(event) => setBottomText(event.target.value)} maxLength={40} />
                <small>{bottomText.length}/40</small>
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
              <p className="local-hint">✓ {mode === "ai" ? "仅你的感受用于生成文案，图片仍在本地处理" : "图片只在当前浏览器中处理，不会上传"}</p>
            </section>
          </div>
        ) : (
          <div className="workspace gif-workspace">
            <section className="control-panel" aria-label="GIF 转换设置">
              <div className="section-heading">
                <span>1</span>
                <div><h2>放入一段视频</h2><p>最长截取 6 秒，效果更轻巧</p></div>
              </div>

              <label className={`video-drop ${videoUrl ? "has-file" : ""}`}>
                <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={loadVideo} />
                <span className="film-icon" aria-hidden="true">▶</span>
                <strong>{videoName || "点击选择视频"}</strong>
                <small>{videoUrl ? "点击可重新选择" : "MP4 / MOV / WEBM · 最大 200 MB"}</small>
              </label>

              {videoUrl && (
                <>
                  <div className="divider" />
                  <div className="section-heading compact">
                    <span>2</span>
                    <div><h2>选取精彩片段</h2><p>拖动参数，预估输出效果</p></div>
                  </div>

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

                  <div className="select-row">
                    <label><span>流畅度</span><select value={gifFps} onChange={(event) => setGifFps(Number(event.target.value))}><option value="6">省空间 · 6 FPS</option><option value="8">推荐 · 8 FPS</option><option value="12">流畅 · 12 FPS</option></select></label>
                    <label><span>最长边</span><select value={gifDimension} onChange={(event) => setGifDimension(Number(event.target.value))}><option value="320">320 px</option><option value="480">480 px</option><option value="640">640 px</option></select></label>
                  </div>

                  <button className="button primary convert-button" onClick={convertToGif} disabled={converting}>
                    {converting ? `正在生成 ${progress}%` : "生成 GIF"}
                    <span>{converting ? "···" : "→"}</span>
                  </button>
                  {converting && <div className="progress-track" aria-label={`转换进度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>}
                  {gifError && <p className="error-message">{gifError}</p>}
                </>
              )}
            </section>

            <section className="preview-panel" aria-label="视频与 GIF 预览">
              <div className="preview-title"><span>{gifUrl ? "GIF 已生成" : "视频预览"}</span><small>{videoDuration ? `${videoDuration.toFixed(1)} 秒` : "等待视频"}</small></div>
              <div className={`video-stage ${!videoUrl ? "empty" : ""}`}>
                {gifUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={gifUrl} alt="生成的 GIF 预览" />
                ) : videoUrl ? (
                  <video ref={videoRef} src={videoUrl} controls playsInline onLoadedMetadata={onVideoMetadata} />
                ) : (
                  <div className="empty-state"><span>GIF</span><p>上传后在这里预览</p><small>所有转换都在本机完成</small></div>
                )}
              </div>
              {gifUrl ? (
                <>
                  <div className="gif-result-meta"><span>生成成功 ✓</span><b>{fileSizeLabel(gifBytes)}</b></div>
                  <a className="button primary full-button" href={gifUrl} download={`梗一下-${Date.now()}.gif`}>下载 GIF <span>↓</span></a>
                  <button className="text-button" onClick={() => { URL.revokeObjectURL(gifUrl); setGifUrl(""); setProgress(0); }}>调整参数重新生成</button>
                </>
              ) : (
                <p className="local-hint">✓ 无需上传服务器，敏感视频也放心用</p>
              )}
            </section>
          </div>
        )}
      </section>

      <section className="benefits" aria-label="产品特点">
        <article><span>01</span><h3>AI 懂你的情绪</h3><p>一句真实感受，马上得到三套不同语气的表情包方案。</p></article>
        <article><span>02</span><h3>素材不出本机</h3><p>图片和视频在浏览器中处理，隐私不用赌运气。</p></article>
        <article><span>03</span><h3>八种字体随便换</h3><p>从快乐体到宋体、楷体和手写体，生成就能直接发。</p></article>
      </section>

      <footer><span>梗一下 · 让每句话都有表情</span><small>Made for 灵感爆发的那一刻</small></footer>
    </main>
  );
}
