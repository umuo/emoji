export type MemePackEffect = "still" | "shake" | "bounce" | "zoom" | "flash";

export const MEME_PACK_THEMES = [
  { id: "daily", label: "日常万能", description: "聊天常用" },
  { id: "work", label: "打工人", description: "上班发疯" },
  { id: "couple", label: "情侣互动", description: "甜蜜斗嘴" },
  { id: "friends", label: "朋友斗图", description: "损友专用" },
  { id: "gaming", label: "游戏开黑", description: "上号开团" },
  { id: "scenario", label: "场景对话", description: "一句话定制" },
] as const;

export type MemePackThemeId = (typeof MEME_PACK_THEMES)[number]["id"];
export type MemePackTheme = (typeof MEME_PACK_THEMES)[number];

const themeIntents: Record<MemePackThemeId, string[]> = {
  daily: [
    "收到", "大笑", "无语", "感谢", "赞同", "生气", "拒绝", "鼓励",
    "询问", "晚安", "马上到", "告别", "震惊", "委屈", "得意", "求求了",
  ],
  work: [
    "收到任务", "马上修改", "正在开会", "想要下班", "加班崩溃", "假装忙碌", "礼貌拒绝", "催进度",
    "需求震惊", "摸鱼开心", "感谢同事", "老板来了", "马上到公司", "申请请假", "彻底躺平", "下班告别",
  ],
  couple: [
    "想你", "抱抱", "亲亲", "晚安", "吃醋", "生气了", "委屈", "求哄",
    "好喜欢", "不同意", "等你回复", "马上见面", "感谢陪伴", "得意撒娇", "震惊反应", "甜蜜告别",
  ],
  friends: [
    "笑死", "就这", "离谱", "你继续", "无语凝噎", "互相嫌弃", "表示佩服", "拒绝背锅",
    "马上到", "请求支援", "谢谢老板", "震惊吃瓜", "得意炫耀", "装死逃避", "鼓励朋友", "下次再约",
  ],
  gaming: [
    "立即上号", "请求救援", "准备开团", "稳住别慌", "操作震惊", "胜利庆祝", "队友无语", "拒绝投降",
    "马上复活", "请求带飞", "感谢配合", "失误道歉", "得意展示", "生气破防", "继续下一把", "下线告别",
  ],
  scenario: [
    "直接回应场景", "震惊反应", "开心接受", "无语吐槽", "礼貌拒绝", "马上行动", "表示同意", "追问细节",
    "安慰鼓励", "生气抗议", "装死逃避", "感谢回应", "得意回应", "委屈反应", "请求对方", "告别收尾",
  ],
};

export function getMemePackTheme(value: string | null | undefined): MemePackTheme {
  return MEME_PACK_THEMES.find((theme) => theme.id === value) ?? MEME_PACK_THEMES[0];
}

export function matchMemePackEffect(intent: string): MemePackEffect {
  if (/生气|崩溃|破防|抗议|嫌弃|拒绝背锅/.test(intent)) return "shake";
  if (/开心|大笑|笑死|喜欢|抱抱|亲亲|鼓励|感谢|庆祝|胜利/.test(intent)) return "bounce";
  if (/震惊|询问|追问|马上|立即|开团|老板来了|吃瓜/.test(intent)) return "zoom";
  if (/得意|佩服|炫耀|带飞|好喜欢/.test(intent)) return "flash";
  return "still";
}

export function createMemePackIntentPlan(
  themeId: string | null | undefined,
  count: number,
) {
  const theme = getMemePackTheme(themeId);
  const source = themeIntents[theme.id];
  const intents = Array.from({ length: count }, (_, index) => source[index % source.length]);
  return {
    theme,
    intents,
    effects: intents.map(matchMemePackEffect),
  };
}
