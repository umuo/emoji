"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type EditorMode = "meme" | "gif";

type MemeTemplate = {
  id: string;
  name: string;
  emoji: string;
  background: [string, string];
  accent: string;
  defaultTop: string;
  defaultBottom: string;
};

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
  const [mode, setMode] = useState<EditorMode>("meme");
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [topText, setTopText] = useState(TEMPLATES[0].defaultTop);
  const [bottomText, setBottomText] = useState(TEMPLATES[0].defaultBottom);
  const [fontSize, setFontSize] = useState(64);
  const [textColor, setTextColor] = useState("#ffffff");
  const [outlineColor, setOutlineColor] = useState("#111111");
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [copyStatus, setCopyStatus] = useState("复制图片");
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((template) => template.id === templateId) ?? TEMPLATES[0],
    [templateId],
  );

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
      context.font = `900 ${fontSize}px Arial, PingFang SC, Microsoft YaHei, sans-serif`;
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
  }, [bottomText, fontSize, outlineColor, selectedTemplate, textColor, topText, uploadedImage]);

  useEffect(() => {
    paintMeme();
  }, [paintMeme]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (gifUrl) URL.revokeObjectURL(gifUrl);
    };
  }, [gifUrl, videoUrl]);

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
        <div className="header-note"><span className="privacy-dot" /> 图片和视频不会离开你的设备</div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">30 秒，造个好梗</p>
          <h1>不学 PS，<br /><span>也能做表情包。</span></h1>
        </div>
        <p className="hero-copy">选模板、加文案、直接发。<br />视频也能一键变成 GIF。</p>
      </section>

      <section className="creator-shell" aria-label="表情包创作工具">
        <div className="mode-tabs" role="tablist" aria-label="选择工具">
          <button
            className={mode === "meme" ? "active" : ""}
            onClick={() => setMode("meme")}
            role="tab"
            aria-selected={mode === "meme"}
          >
            <span>01</span> 图片表情包
          </button>
          <button
            className={mode === "gif" ? "active" : ""}
            onClick={() => setMode("gif")}
            role="tab"
            aria-selected={mode === "gif"}
          >
            <span>02</span> 视频转 GIF <b>NEW</b>
          </button>
        </div>

        {mode === "meme" ? (
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
                <div><h2>写点什么</h2><p>文案会自动换行</p></div>
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
        <article><span>01</span><h3>打开就能做</h3><p>不注册、不学习复杂软件，灵感来了马上开工。</p></article>
        <article><span>02</span><h3>素材不出本机</h3><p>图片和视频在浏览器中处理，隐私不用赌运气。</p></article>
        <article><span>03</span><h3>生成就能发</h3><p>高清 PNG 和标准 GIF，微信、群聊、评论区都好用。</p></article>
      </section>

      <footer><span>梗一下 · 让每句话都有表情</span><small>Made for 灵感爆发的那一刻</small></footer>
    </main>
  );
}
