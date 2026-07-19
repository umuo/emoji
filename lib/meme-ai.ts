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

const toneNames: Record<string, string> = {
  natural: "自然吐槽",
  work: "打工人",
  cute: "可爱一点",
  savage: "嘴替模式",
  absurd: "抽象发疯",
};

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

export async function handleGenerateMeme(request: Request, env: MemeAiEnv): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "只支持 POST 请求" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  let body: { feeling?: unknown; tone?: unknown };
  try {
    body = (await request.json()) as { feeling?: unknown; tone?: unknown };
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
                text:
                  "你是很懂中文互联网语感的表情包导演。根据用户的真实感受，生成三套可以直接发到聊天里的梗图方案。上方文案负责交代场景，下方文案负责包袱或情绪落点；每段不超过18个汉字，口语自然、不要鸡汤、不要解释。三套要明显不同：一套克制、一套夸张、一套意外反转。不得输出仇恨、威胁、歧视或针对个人的恶毒攻击。emoji 只放一个表情；palette 和 fontId 必须从给定枚举中选择。",
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
            schema: {
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
                      palette: {
                        type: "string",
                        enum: ["sunset", "mint", "violet", "pink", "ice", "lime"],
                      },
                      fontId: {
                        type: "string",
                        enum: ["fun", "bold", "impact", "round", "song", "kai", "hand", "mono"],
                      },
                    },
                    required: ["label", "top", "bottom", "emoji", "palette", "fontId"],
                  },
                },
              },
              required: ["emotion", "candidates"],
            },
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

    const parsed = JSON.parse(outputText) as MemeAiResult;
    if (!Array.isArray(parsed.candidates) || parsed.candidates.length !== 3) {
      throw new Error("OpenAI response did not match the expected shape");
    }

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
