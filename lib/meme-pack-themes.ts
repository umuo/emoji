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

const duoInteractionCues = [
  "一人兴奋拉住另一人的手，另一人身体前倾回应，双方看向彼此",
  "一人凑近说悄悄话，另一人捂嘴笑或惊讶，形成明确反应",
  "一人把手机或小道具递给另一人，另一人双手接住并回应",
  "一人张开双臂发起拥抱，另一人靠近回抱",
  "一人指向对方吐槽，另一人叉腰回瞪，形成来回互怼",
  "两人背靠背生闷气，同时回头偷看对方",
  "一人握住另一人的手臂求助，另一人拍肩或牵手回应",
  "一人伸手挽留准备离开的对方，对方停步回头",
  "两人面对面击掌或碰拳，动作在两人之间完成",
  "一人故意搞怪逗人，另一人抬手制止但忍不住回应",
  "一人递出礼物、零食或饮料，另一人伸手接住",
  "一人拉着另一人一起往前跑，后者明确跟上",
  "两人争抢同一个小道具，形成清楚的推拉关系",
  "一人搂住另一人的肩膀，另一人自然靠近并回应",
  "一人拿扩音器或话筒发起表达，另一人捂耳或接话",
  "两人朝不同方向挥手告别，同时回头看向对方",
] as const;

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

export function createDuoInteractionPlan(count: number) {
  return Array.from(
    { length: count },
    (_, index) => duoInteractionCues[index % duoInteractionCues.length],
  );
}
