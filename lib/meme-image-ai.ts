import { isPrivateHostname, parseProvider, type ProviderConfig } from "./meme-ai";
import { getMemePackLayout } from "./meme-pack-layouts";
import { createDuoInteractionPlan, createMemePackIntentPlan } from "./meme-pack-themes";

export type MemeImageEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_IMAGE_MODEL?: string;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const DEFAULT_IMAGE_REQUEST_TIMEOUT_MS = 115000;
const MEME_PACK_REQUEST_TIMEOUT_MS = 240000;

const stylePrompts: Record<string, string> = {
  internet: "中文互联网斗图风，反应强烈，构图直接，笑点一眼能看懂",
  sticker: "精致立体贴纸风，角色轮廓清晰，适合聊天软件发送",
  doodle: "松弛手绘涂鸦风，线条有个性，像朋友随手画出的神图",
  absurd: "荒诞超现实发疯风，视觉反差强，但主体仍然清楚",
  photo: "写实反应图风，像被精准抓拍到的情绪瞬间",
};

const MEME_IMAGE_SYSTEM_PROMPT = `
你是一名只创作社交表情包的视觉导演。无论用户描述什么，都要把需求转化成一张可以直接发在中文聊天中的表情包，而不是普通插画、风景照、商业海报、UI 截图或长篇漫画。

硬性要求：
1. 输出单张 1:1 方形表情包，主体明确，手机聊天窗口缩略图里也能一眼看懂。
2. 优先呈现夸张而准确的情绪、动作和反应，画面只保留一个核心笑点，避免复杂背景。
3. 如果用户提供参考图片，把其中的主体或角色转化为表情包并尽量保留可识别特征；不要只是给原图加滤镜。
4. 只有用户明确给出配字、台词或引号内文字时才在图中加入文字；必须尽量准确呈现原文，字少、醒目、对比强。用户没要求文字时不要擅自生成乱码。
5. 不添加平台水印、二维码、品牌 Logo 或多余边框。避免针对真实个人的羞辱、仇恨、威胁或恶意攻击。
6. 最终画面必须以“表情包是否好用、好笑、适合转发”为最高标准。
`.trim();

const MEME_PACK_SYSTEM_PROMPT = `
你是一名中文社交表情包套装设计师。请把用户上传照片中的人物转化成一整张人物表情包分镜表，尽量保留脸型、发型、五官与可识别特征，同时把动作和情绪适度夸张。

硬性要求：
1. 必须严格遵守“本次套装规格”指定的列数、行数和总数，所有格子大小完全一致。每格四周外侧至少 8% 必须是干净的背景安全区；人物的头发、脸、肩膀、手脚、衣服、道具、装饰和文字都不得进入安全区、触碰边界或被边界裁切。人物组合最多占格子宽度的 78% 和高度的 80%，使用留有呼吸感的中景构图。
2. 各格必须按从左到右、从上到下的顺序，分别覆盖“各格意图顺序”中的聊天表达，表情、动作和文案不得重复；你可以根据人物特征和对话场景调整成更自然的具体语气。
3. 每格由你自行创作一句 2–6 个汉字的简短中文配字。配字必须与该格表情和动作匹配，清楚、准确、醒目，不得出现乱码、拼音、英文或重复文案。
4. 所有文字必须完整放在各自格子的安全区域内，与人物和底边都留出明显间距，使用粗体高对比中文字体，在缩小后仍可辨认。
5. 每格使用简洁独立背景，背景必须铺满各自的矩形格子直到切割线。禁止圆角卡片、卡片阴影、格子间留缝、白边、边框、分隔条和整图外边距；“安全区”只限制人物和文字，不能把格子缩成带留白的卡片。不要添加格子编号、总标题、说明文字、水印、二维码或品牌 Logo。
6. 最终只输出一张符合本次套装规格的表情包大图，不要输出额外说明或单独图片。
`.trim();

export async function handleGenerateMemeImage(request: Request, env: MemeImageEnv): Promise<Response> {
  if (request.method !== "POST") return jsonError("只支持 POST 请求", 405);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("请求内容必须是表单数据", 400);
  }

  const prompt = typeof form.get("prompt") === "string"
    ? String(form.get("prompt")).trim().slice(0, 600)
    : "";
  const styleId = typeof form.get("style") === "string" ? String(form.get("style")) : "internet";
  const style = stylePrompts[styleId] || stylePrompts.internet;
  if (prompt.length < 2) return jsonError("请描述一下想生成什么表情包", 400);

  const imageEntry = form.get("image");
  const referenceImage = imageEntry && typeof imageEntry !== "string" ? imageEntry : null;
  if (referenceImage) {
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(referenceImage.type)) {
      return jsonError("参考图片仅支持 PNG、JPG 或 WEBP", 400);
    }
    if (referenceImage.size > 10 * 1024 * 1024) {
      return jsonError("参考图片请控制在 10 MB 以内", 400);
    }
  }

  const providerResult = resolveProvider(form.get("provider"), env);
  if ("error" in providerResult) return jsonError(providerResult.error || "自定义接口设置不完整", 400);
  const provider = providerResult.value;
  const imageModelName = provider.imageModelName || env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const fullPrompt = `${MEME_IMAGE_SYSTEM_PROMPT}\n\n视觉风格：${style}\n\n用户需求：${prompt}`;
  const action = referenceImage ? "edits" : "generations";
  const endpoint = buildImageEndpoint(provider.baseUrl, action);

  try {
    let response = await callImageProvider(endpoint, provider, imageModelName, fullPrompt, referenceImage, false);
    if (!response.ok && [400, 415, 422].includes(response.status)) {
      response = await callImageProvider(endpoint, provider, imageModelName, fullPrompt, referenceImage, true);
    }
    if (response.status >= 300 && response.status < 400) {
      return jsonError("生图接口返回了跳转响应，请在 Base URL 中填写最终 HTTPS 地址", 502);
    }
    if (!response.ok) {
      const providerError = await readProviderError(response, provider.apiKey);
      return jsonError(providerError || `生图接口返回 ${response.status}`, 502);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return jsonError("生图接口没有返回有效 JSON", 502);
    }
    const image = readImageResult(payload);
    if (!image) return jsonError("生图接口响应中没有图片数据", 502);

    return new Response(JSON.stringify({
      imageUrl: image.url,
      model: imageModelName,
      referenceUsed: Boolean(referenceImage),
      notice: referenceImage ? "已参考上传图片生成新的表情包" : "已根据提示词生成表情包",
    }), { headers: jsonHeaders });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError("生图时间有点久，请稍后重试", 504);
    }
    const message = error instanceof Error ? error.message : "生图接口连接失败";
    return jsonError(`生图接口连接失败：${message}`, 502);
  }
}

export async function handleGenerateMemePack(request: Request, env: MemeImageEnv): Promise<Response> {
  if (request.method !== "POST") return jsonError("只支持 POST 请求", 405);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("请求内容必须是表单数据", 400);
  }

  const imageEntry = form.get("image");
  const referenceImage = imageEntry && typeof imageEntry !== "string" ? imageEntry : null;
  if (!referenceImage) return jsonError("请先上传一张清晰的人物照片", 400);
  if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(referenceImage.type)) {
    return jsonError("人物照片仅支持 PNG、JPG 或 WEBP", 400);
  }
  if (referenceImage.size > 10 * 1024 * 1024) {
    return jsonError("人物照片请控制在 10 MB 以内", 400);
  }
  const secondImageEntry = form.get("image2");
  const secondReferenceImage = secondImageEntry && typeof secondImageEntry !== "string" ? secondImageEntry : null;
  if (secondReferenceImage) {
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(secondReferenceImage.type)) {
      return jsonError("搭档照片仅支持 PNG、JPG 或 WEBP", 400);
    }
    if (secondReferenceImage.size > 10 * 1024 * 1024) {
      return jsonError("搭档照片请控制在 10 MB 以内", 400);
    }
  }

  const preference = typeof form.get("prompt") === "string"
    ? String(form.get("prompt")).trim().slice(0, 300)
    : "";
  const scenario = typeof form.get("scenario") === "string"
    ? String(form.get("scenario")).trim().slice(0, 300)
    : "";
  const styleId = typeof form.get("style") === "string" ? String(form.get("style")) : "sticker";
  const style = stylePrompts[styleId] || stylePrompts.sticker;
  const layout = getMemePackLayout(typeof form.get("layout") === "string" ? String(form.get("layout")) : null);
  const plan = createMemePackIntentPlan(
    typeof form.get("theme") === "string" ? String(form.get("theme")) : null,
    layout.count,
  );
  if (plan.theme.id === "scenario" && scenario.length < 2) {
    return jsonError("请先输入一句对话或场景", 400);
  }
  const providerResult = resolveProvider(form.get("provider"), env);
  if ("error" in providerResult) return jsonError(providerResult.error || "自定义接口设置不完整", 400);
  const provider = providerResult.value;
  const imageModelName = provider.imageModelName || env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const subjectInstruction = secondReferenceImage
    ? "主体模式：双人互动。参考图 1 与参考图 2 是两个不同人物，分别保留两人的可识别特征，不能把两张脸融合成一个人。每一格都必须是有因果关系的双人微场景：一人发起动作，另一人必须通过目光、手势、身体位移或接触作出明确回应；两人都要随格改变表情和姿势，并轮换动作发起者。禁止两人只是并排面向镜头各自做表情，禁止其中一人连续保持中性站姿或充当静止背景。"
    : "主体模式：单人。以参考图 1 中的人物为每一格的唯一主角，保持人物身份和外貌一致。";
  const duoInteractions = secondReferenceImage ? createDuoInteractionPlan(layout.count) : [];
  const numberedIntents = plan.intents.map((intent, index) => secondReferenceImage
    ? `${index + 1}. 聊天意图：${intent}；双向互动动作：${duoInteractions[index]}。动作可按聊天意图调整，但必须保留一方发起、另一方回应的关系。`
    : `${index + 1}. ${intent}`).join("\n");
  const verticalCuts = Array.from({ length: layout.columns - 1 }, (_, index) => `${(((index + 1) / layout.columns) * 100).toFixed(2)}%`).join("、");
  const horizontalCuts = Array.from({ length: layout.rows - 1 }, (_, index) => `${(((index + 1) / layout.rows) * 100).toFixed(2)}%`).join("、");
  const gridInstruction = `精确切割坐标：竖向切割边界必须位于画布宽度的 ${verticalCuts || "无"}；横向切割边界必须位于画布高度的 ${horizontalCuts || "无"}。这些边界是隐形坐标，不要画出线条；边界必须笔直贯穿整张画布且不得偏移。`;
  const fullPrompt = `${MEME_PACK_SYSTEM_PROMPT}\n\n${subjectInstruction}\n本次套装规格：严格 ${layout.columns} 列 × ${layout.rows} 行，共 ${layout.count} 个格子。\n${gridInstruction}\n套装主题：${plan.theme.label}（${plan.theme.description}）。${scenario ? `\n用户给出的对话或场景：${scenario}\n所有格子都要围绕这个场景形成不同而自然的回应。` : ""}\n各格意图顺序：\n${numberedIntents}\n视觉风格：${style}${preference ? `\n\n用户补充偏好：${preference}` : ""}`;
  const endpoint = buildImageEndpoint(provider.baseUrl, "edits");
  const referenceImages = secondReferenceImage
    ? [referenceImage, secondReferenceImage]
    : referenceImage;
  const packQuality = layout.count >= 12 ? "low" : "medium";

  try {
    let response = await callImageProvider(
      endpoint,
      provider,
      imageModelName,
      fullPrompt,
      referenceImages,
      false,
      { size: layout.size, timeoutMs: MEME_PACK_REQUEST_TIMEOUT_MS, quality: packQuality },
    );
    if (!response.ok && [400, 415, 422].includes(response.status)) {
      response = await callImageProvider(
        endpoint,
        provider,
        imageModelName,
        fullPrompt,
        referenceImages,
        true,
        { timeoutMs: MEME_PACK_REQUEST_TIMEOUT_MS },
      );
    }
    if (response.status >= 300 && response.status < 400) {
      return jsonError("生图接口返回了跳转响应，请在 Base URL 中填写最终 HTTPS 地址", 502);
    }
    if (response.status === 524) {
      return jsonError(`上游生图服务生成这张 ${layout.label} 整图时超时（524）。本站已按快速模式请求 1 张整图，请重试；若上游仍繁忙，可暂时选择 2×2 或 3×3。`, 504);
    }
    if (!response.ok) {
      const providerError = await readProviderError(response, provider.apiKey);
      return jsonError(providerError || `表情套装接口返回 ${response.status}`, 502);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return jsonError("生图接口没有返回有效 JSON", 502);
    }
    const image = readImageResult(payload);
    if (!image) return jsonError("生图接口响应中没有表情套装图片", 502);

    return new Response(JSON.stringify({
      imageUrl: image.url,
      model: imageModelName,
      referenceUsed: true,
      subjectMode: secondReferenceImage ? "duo" : "single",
      effectPlan: plan.effects,
      reactionPlan: plan.intents,
      notice: `${layout.label} ${secondReferenceImage ? "双人互动" : plan.theme.label}表情套装生成完成`,
    }), { headers: jsonHeaders });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError(`AI 生成这张 ${layout.label} 表情套装整图超时，请重试。系统每次只生成 1 张整图，完成后再切成 ${layout.count} 张。`, 504);
    }
    const message = error instanceof Error ? error.message : "生图接口连接失败";
    return jsonError(`表情套装生成失败：${message}`, 502);
  }
}

function resolveProvider(value: FormDataEntryValue | null, env: MemeImageEnv) {
  if (typeof value === "string" && value.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return { error: "自定义 AI 设置不是有效 JSON" } as const;
    }
    return parseProvider(parsed);
  }
  if (!env.OPENAI_API_KEY) {
    return { error: "请先在 AI 设置中启用自定义接口，并填写生图模型" } as const;
  }
  return {
    value: {
      baseUrl: "https://api.openai.com/v1",
      apiKey: env.OPENAI_API_KEY,
      modelName: env.OPENAI_MODEL || "gpt-5.6-sol",
      imageModelName: env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    } satisfies ProviderConfig,
  } as const;
}

function buildImageEndpoint(baseUrl: string, action: "generations" | "edits") {
  if (/\/images\/(?:generations|edits)$/i.test(baseUrl)) {
    return baseUrl.replace(/\/images\/(?:generations|edits)$/i, `/images/${action}`);
  }
  return `${baseUrl}/images/${action}`;
}

async function callImageProvider(
  endpoint: string,
  provider: ProviderConfig,
  model: string,
  prompt: string,
  image: File | File[] | null,
  minimal: boolean,
  options: { size?: string; timeoutMs?: number; quality?: "low" | "medium" } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs || DEFAULT_IMAGE_REQUEST_TIMEOUT_MS,
  );
  const headers: Record<string, string> = {};
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

  let body: BodyInit;
  if (image) {
    const upstream = new FormData();
    upstream.append("model", model);
    upstream.append("prompt", prompt);
    const images = Array.isArray(image) ? image : [image];
    const fieldName = images.length > 1 ? "image[]" : "image";
    images.forEach((file, index) => {
      upstream.append(fieldName, file, file.name || `reference-${index + 1}.png`);
    });
    if (!minimal) {
      upstream.append("size", options.size || "1024x1024");
      upstream.append("quality", options.quality || "medium");
    }
    body = upstream;
  } else {
    headers["content-type"] = "application/json";
    body = JSON.stringify({
      model,
      prompt,
      ...(!minimal ? { size: options.size || "1024x1024", quality: options.quality || "medium" } : {}),
    });
  }

  try {
    return await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function readImageResult(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const object = payload as Record<string, unknown>;
  const pools = [object.data, object.images, object.output];
  const first = pools.find(Array.isArray)?.[0];
  const item = first && typeof first === "object" ? first as Record<string, unknown> : object;
  const rawBase64 = [item.b64_json, item.base64, item.image_base64, object.b64_json]
    .find((value) => typeof value === "string") as string | undefined;
  if (rawBase64) {
    if (rawBase64.startsWith("data:image/")) return { url: rawBase64 };
    if (rawBase64.length > 40 * 1024 * 1024 || !/^[A-Za-z0-9+/=\r\n]+$/.test(rawBase64)) return null;
    return { url: `data:image/png;base64,${rawBase64.replace(/[\r\n]/g, "")}` };
  }

  const rawUrl = [item.url, item.image_url, object.url].find((value) => typeof value === "string") as string | undefined;
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" || isPrivateHostname(parsed.hostname)) return null;
    return { url: parsed.toString() };
  } catch {
    return null;
  }
}

async function readProviderError(response: Response, apiKey: string) {
  try {
    const text = (await response.text()).slice(0, 1200);
    const payload = JSON.parse(text) as {
      error?: { message?: unknown; code?: unknown } | string;
      message?: unknown;
    };
    const code = typeof payload.error === "object" && payload.error
      ? payload.error.code
      : undefined;
    if (code === "moderation_blocked") return "这个提示词未通过生图安全检查，请减少攻击性或针对个人的描述";
    const message = typeof payload.error === "string"
      ? payload.error
      : typeof payload.error?.message === "string"
        ? payload.error.message
        : typeof payload.message === "string"
          ? payload.message
          : "";
    const safeMessage = apiKey ? message.replaceAll(apiKey, "[REDACTED]") : message;
    return safeMessage.replace(/[\r\n\t]+/g, " ").slice(0, 220);
  } catch {
    return "";
  }
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), { status, headers: jsonHeaders });
}
