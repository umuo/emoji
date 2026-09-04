import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemePackIntentPlan,
  getMemePackTheme,
  matchMemePackEffect,
  MEME_PACK_THEMES,
} from "../lib/meme-pack-themes";

test("every theme can fill every supported pack size", () => {
  for (const theme of MEME_PACK_THEMES) {
    for (const count of [4, 9, 12, 16]) {
      const plan = createMemePackIntentPlan(theme.id, count);
      assert.equal(plan.theme.id, theme.id);
      assert.equal(plan.intents.length, count);
      assert.equal(plan.effects.length, count);
    }
  }
});

test("matches expression semantics to lightweight GIF effects", () => {
  assert.equal(matchMemePackEffect("生气抗议"), "shake");
  assert.equal(matchMemePackEffect("大笑庆祝"), "bounce");
  assert.equal(matchMemePackEffect("震惊反应"), "zoom");
  assert.equal(matchMemePackEffect("得意炫耀"), "flash");
  assert.equal(matchMemePackEffect("晚安"), "still");
});

test("falls back safely and keeps the scenario theme available", () => {
  assert.equal(getMemePackTheme("unknown").id, "daily");
  const plan = createMemePackIntentPlan("scenario", 16);
  assert.equal(plan.theme.label, "场景对话");
  assert.equal(plan.intents[0], "直接回应场景");
  assert.equal(plan.intents[15], "告别收尾");
});
