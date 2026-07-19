export type MemeAiEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

export type MemeIdea = {
  label: string;
  top: string;
  bottom: string;
  emoji: string;
  palette: "sunset" | "mint" | "violet" | "pink" | "ice" | "lime";
  fontId: "fun" | "bold" | "impact" | "round" | "song" | "kai" | "hand" | "mono";
};

type MemeAiResult = {
  emotion: string;
  candidates: MemeIdea[];
};

type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  modelName: string;
};

const toneNames: Record<string, string> = {
  natural: "自然吐槽",
  work: "打工人",
  cute: "可爱一点",
  savage: "嘴替模式",
  absurd: "抽象发疯",
};

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

const SYSTEM_PROMPT =
  "你是很懂中文互联网语感的表情包导演。根据用户的真实感受，生成三套可以直接发到聊天里的梗图方案。上方文案负责交代场景，下方文案负责包袱或情绪落点；每段不超过18个汉字，口语自然、不要鸡汤、不要解释。三套要明显不同：一套克制、一套夸张、一套意外反转。不得输出仇恨、威胁、歧视或针对个人的恶毒攻击。emoji 只放一个表情；palette 和 fontId 必须从给定枚举中选择。只返回符合要求的 JSON 对象，不要 Markdown。";

const MEME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    emotion: { type: "string", description: "4到8个字的中文情绪标签" },
    candidates: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string", description: "2到5个字的方案名" },
          top: { type: "string" },
          bottom: { type: "string" },
          emoji: { type: "string" },
          palette: { type: "string", enum: ["sunset", "mint", "violet", "pink", "ice", "lime"] },
          fontId: { type: "string", enum: ["fun", "bold", "impact", "round", "song", "kai", "hand", "mono"] },
        },
        required: ["label", "top", "bottom", "emoji", "palette", "fontId"],
      },
    },
  },
  required: ["emotion", "candidates"],
} as const;

const palettes = new Set<MemeIdea["palette"]>(["sunset", "mint", "violet", "pink", "ice", "lime"]);
const fontIds = new Set<MemeIdea["fontId"]>(["fun", "bold", "impact", "round", "song", "kai", "hand", "mono"]);

export async function handleGenerateMeme(request: Request, env: MemeAiEnv): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "只支持 POST 请求" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  let body: { feeling?: unknown; tone?: unknown; provider?: unknown };
  try {
    body = (await request.json()) as { feeling?: unknown; tone?: unknown; provider?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: "请求内容不是有效 JSON" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const feeling = typeof body.feeling === "string" ? body.feeling.trim().slice(0, 120) : "";
  const tone = typeof body.tone === "string" && toneNames[body.tone] ? body.tone : "natural";
  if (feeling.length < 2) {
    return new Response(JSON.stringify({ error: "多说两个字，我才接得住这个情绪" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  if (body.provider !== undefined) {
    const provider = parseProvider(body.provider);
    if ("error" in provider) {
      return new Response(JSON.stringify({ error: provider.error }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    try {
      const result = await generateWithCompatibleProvider(feeling, tone, provider.value);
      return new Response(
        JSON.stringify({
          source: "compatible",
          notice: `由 ${provider.value.modelName} 生成 · 使用自定义接口`,
          ...result,
        }),
        { headers: jsonHeaders },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "自定义 AI 接口连接失败";
      return new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: jsonHeaders,
      });
    }
  }

  if (!env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({
        source: "local",
        notice: "当前使用本地灵感模式；配置 OpenAI API 后会自动切换为 AI 创作。",
        ...createLocalIdeas(feeling, tone),
      }),
      { headers: jsonHeaders },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5.6-sol",
        store: false,
        reasoning: { effort: "low" },
        max_output_tokens: 900,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: SYSTEM_PROMPT,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `我的感受：${feeling}\n希望风格：${toneNames[tone]}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "meme_ideas",
            strict: true,
            schema: MEME_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    const outputText = payload.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text;
    if (!outputText) throw new Error("OpenAI response did not include output text");

    const parsed = parseMemeResult(outputText);

    return new Response(JSON.stringify({ source: "ai", ...parsed }), { headers: jsonHeaders });
  } catch {
    return new Response(
      JSON.stringify({
        source: "local",
        notice: "AI 暂时没接上，已用本地灵感模式给你生成。",
        ...createLocalIdeas(feeling, tone),
      }),
      { headers: jsonHeaders },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseProvider(value: unknown): { value: ProviderConfig } | { error: string } {
  if (!value || typeof value !== "object") return { error: "自定义接口设置不完整" };
  const raw = value as Record<string, unknown>;
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim().replace(/\/+$/, "") : "";
  const apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  const modelName = typeof raw.modelName === "string" ? raw.modelName.trim() : "";

  if (!baseUrl || baseUrl.length > 300) return { error: "Base URL 无效或过长" };
  if (!modelName || modelName.length > 120) return { error: "Model Name 无效或过长" };
  if (apiKey.length > 2048) return { error: "API Key 过长" };

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return { error: "Base URL 不是有效网址" };
  }
  if (parsed.protocol !== "https:") return { error: "Base URL 仅支持 HTTPS" };
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { error: "Base URL 不能包含账号、查询参数或锚点" };
  }
  if (isPrivateHostname(parsed.hostname)) {
    return { error: "Base URL 不能指向本机、内网或保留地址" };
  }

  return { value: { baseUrl: parsed.toString().replace(/\/+$/, ""), apiKey, modelName } };
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".nip.io") ||
    host.endsWith(".sslip.io") ||
    host.endsWith(".xip.io") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe8") ||
    host.startsWith("fe9") ||
    host.startsWith("fea") ||
    host.startsWith("feb")
  ) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((part) => part > 255)) return true;
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] >= 224
  );
}

async function generateWithCompatibleProvider(feeling: string, tone: string, provider: ProviderConfig) {
  const endpoint = provider.baseUrl.endsWith("/chat/completions")
    ? provider.baseUrl
    : `${provider.baseUrl}/chat/completions`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

  const baseBody = {
    model: provider.modelName,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `我的感受：${feeling}\n希望风格：${toneNames[tone]}` },
    ],
  };
  const formats: Array<Record<string, unknown> | null> = [
    { type: "json_schema", json_schema: { name: "meme_ideas", strict: true, schema: MEME_SCHEMA } },
    { type: "json_object" },
    null,
  ];

  let lastError = "接口没有返回有效结果";
  for (const format of formats) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        redirect: "error",
        signal: controller.signal,
        body: JSON.stringify({ ...baseBody, ...(format ? { response_format: format } : {}) }),
      });
      if (!response.ok) {
        const details = await readProviderError(response, provider.apiKey);
        lastError = `接口返回 ${response.status}${details ? `：${details}` : ""}`;
        if (![400, 415, 422].includes(response.status)) break;
        continue;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = readChatContent(payload.choices?.[0]?.message?.content);
      if (!content) {
        lastError = "接口响应中没有 choices[0].message.content";
        continue;
      }
      return parseMemeResult(content);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("自定义 AI 接口响应超时，请检查 Base URL 或稍后重试");
      }
      throw new Error(error instanceof Error ? `自定义 AI 接口连接失败：${error.message}` : "自定义 AI 接口连接失败");
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError);
}

async function readProviderError(response: Response, apiKey: string) {
  try {
    const text = (await response.text()).slice(0, 800);
    const parsed = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown };
    const message = typeof parsed.error === "string"
      ? parsed.error
      : typeof parsed.error?.message === "string"
        ? parsed.error.message
        : typeof parsed.message === "string"
          ? parsed.message
          : "";
    const safeMessage = apiKey ? message.replaceAll(apiKey, "[REDACTED]") : message;
    return safeMessage.replace(/[\r\n\t]+/g, " ").slice(0, 180);
  } catch {
    return "";
  }
}

function readChatContent(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = (part as Record<string, unknown>).text;
      return typeof value === "string" ? value : "";
    })
    .join("");
}

function parseMemeResult(raw: string): MemeAiResult {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  const json = firstBrace >= 0 && lastBrace > firstBrace
    ? withoutFence.slice(firstBrace, lastBrace + 1)
    : withoutFence;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("接口返回的内容不是有效 JSON");
  }
  if (!value || typeof value !== "object") throw new Error("接口返回的数据格式不正确");
  const object = value as Record<string, unknown>;
  if (typeof object.emotion !== "string" || !Array.isArray(object.candidates) || object.candidates.length !== 3) {
    throw new Error("接口没有按要求返回三套表情包文案");
  }

  const candidates = object.candidates.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("表情包方案格式不正确");
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.label !== "string" ||
      typeof item.top !== "string" ||
      typeof item.bottom !== "string" ||
      typeof item.emoji !== "string" ||
      typeof item.palette !== "string" ||
      typeof item.fontId !== "string" ||
      !palettes.has(item.palette as MemeIdea["palette"]) ||
      !fontIds.has(item.fontId as MemeIdea["fontId"])
    ) throw new Error("表情包方案缺少必需字段");
    return {
      label: item.label.trim().slice(0, 10),
      top: item.top.trim().slice(0, 40),
      bottom: item.bottom.trim().slice(0, 40),
      emoji: Array.from(item.emoji.trim() || "😶").slice(0, 3).join(""),
      palette: item.palette as MemeIdea["palette"],
      fontId: item.fontId as MemeIdea["fontId"],
    };
  });

  if (candidates.some((item) => !item.label || !item.top || !item.bottom)) {
    throw new Error("表情包文案不能为空");
  }
  return { emotion: object.emotion.trim().slice(0, 16), candidates };
}

function createLocalIdeas(feeling: string, tone: string): MemeAiResult {
  const compactFeeling = feeling.replace(/[。！!？?，,~～.]{2,}/g, "…").slice(0, 18);
  const contains = (words: string[]) => words.some((word) => feeling.includes(word));

  if (contains(["服", "无语", "离谱", "麻了", "算了", "绝了"])) {
    return {
      emotion: "无语凝噎",
      candidates: [
        { label: "淡淡发疯", top: compactFeeling, bottom: "行，世界有自己的想法", emoji: "🙄", palette: "mint", fontId: "fun" },
        { label: "忍无可忍", top: "我努力理解了一下", bottom: "理解失败，告辞", emoji: "😮‍💨", palette: "sunset", fontId: "bold" },
        { label: "意外释然", top: "事情到了这个地步", bottom: "突然就不关我事了", emoji: "🫠", palette: "violet", fontId: "round" },
      ],
    };
  }

  if (contains(["累", "困", "不想动", "加班", "没电", "疲惫"])) {
    return {
      emotion: "电量告急",
      candidates: [
        { label: "低电量", top: compactFeeling, bottom: "本人正在退出群聊", emoji: "🥱", palette: "ice", fontId: "round" },
        { label: "打工魂", top: "身体已经下班", bottom: "工位还扣着我的魂", emoji: "😵‍💫", palette: "sunset", fontId: "bold" },
        { label: "省电模式", top: "不是不想努力", bottom: "是电量只剩 1%", emoji: "🪫", palette: "mint", fontId: "mono" },
      ],
    };
  }

  if (contains(["开心", "爽", "赢", "下班", "放假", "发财", "哈哈"])) {
    return {
      emotion: "快乐超标",
      candidates: [
        { label: "稳稳拿下", top: compactFeeling, bottom: "今天轮到我得意了", emoji: "😎", palette: "lime", fontId: "fun" },
        { label: "快乐起飞", top: "本来只想开心一下", bottom: "没想到直接起飞", emoji: "🥳", palette: "pink", fontId: "bold" },
        { label: "装作冷静", top: "表面：也就那样", bottom: "内心：再夸我两句", emoji: "🤭", palette: "violet", fontId: "kai" },
      ],
    };
  }

  if (contains(["气", "烦", "火大", "生气", "崩溃", "受不了"])) {
    return {
      emotion: "气到升温",
      candidates: [
        { label: "礼貌生气", top: compactFeeling, bottom: "好的，我先深呼吸", emoji: "😤", palette: "sunset", fontId: "bold" },
        { label: "当场炸毛", top: "我的情绪很稳定", bottom: "稳定地处于爆炸边缘", emoji: "🤬", palette: "pink", fontId: "impact" },
        { label: "冷静反转", top: "气了三分钟以后", bottom: "算了，吃饭比较重要", emoji: "🍜", palette: "mint", fontId: "fun" },
      ],
    };
  }

  if (contains(["尴尬", "社死", "丢人", "想钻", "脚趾"])) {
    return {
      emotion: "原地社死",
      candidates: [
        { label: "假装无事", top: compactFeeling, bottom: "只要我不看就没发生", emoji: "🫣", palette: "ice", fontId: "round" },
        { label: "大型社死", top: "脚趾已经开始施工", bottom: "三室一厅马上完工", emoji: "😳", palette: "violet", fontId: "bold" },
        { label: "体面离场", top: "这个地球先给你们", bottom: "我换个星球生活", emoji: "🚀", palette: "pink", fontId: "fun" },
      ],
    };
  }

  const toneEnding = tone === "work" ? "打工人先记在小本本上" : tone === "cute" ? "那就可爱地消化一下" : tone === "savage" ? "谢谢，已经记仇了" : tone === "absurd" ? "很好，世界终于疯成我喜欢的样子" : "先让这个情绪飞一会儿";
  return {
    emotion: "心情复杂",
    candidates: [
      { label: "原味心声", top: compactFeeling, bottom: toneEnding, emoji: "😶", palette: "mint", fontId: "fun" },
      { label: "放大一点", top: "此刻的我看似平静", bottom: "其实内心已经开会了", emoji: "😵‍💫", palette: "sunset", fontId: "bold" },
      { label: "拐个弯", top: "想了半天怎么面对", bottom: "决定先奖励自己一顿", emoji: "😌", palette: "pink", fontId: "kai" },
    ],
  };
}
