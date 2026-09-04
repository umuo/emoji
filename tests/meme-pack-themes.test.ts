import assert from "node:assert/strict";
import test from "node:test";
import {
  createDuoInteractionPlan,
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

test("builds varied two-way interaction cues for a duo sheet", () => {
  const interactions = createDuoInteractionPlan(12);
  assert.equal(interactions.length, 12);
  assert.equal(new Set(interactions).size, 12);
  assert.match(interactions[0], /拉住另一人的手/);
  assert.match(interactions[1], /另一人.*反应/);
  assert.match(interactions[8], /两人面对面击掌/);
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
