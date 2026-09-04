import assert from "node:assert/strict";
import test from "node:test";
import { handleGenerateMemeImage, handleGenerateMemePack } from "../lib/meme-image-ai";

const provider = {
  baseUrl: "https://images.example.com/v1",
  apiKey: "test-secret",
  modelName: "text-model",
  imageModelName: "image-model",
};

test("uses the image generations endpoint and returns base64 output", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl = "";
  let upstreamBody = "";
  globalThis.fetch = async (input, init) => {
    upstreamUrl = String(input);
    upstreamBody = String(init?.body);
    assert.equal(init?.redirect, "manual");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-secret");
    return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), {
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const form = new FormData();
    form.append("prompt", "一只对周一翻白眼的猫");
    form.append("style", "internet");
    form.append("provider", JSON.stringify(provider));
    const response = await handleGenerateMemeImage(new Request("https://site.example/api/generate-image", {
      method: "POST",
      body: form,
    }), {});
    const payload = await response.json() as { imageUrl: string; model: string; referenceUsed: boolean };

    assert.equal(response.status, 200);
    assert.equal(upstreamUrl, "https://images.example.com/v1/images/generations");
    assert.match(upstreamBody, /只创作社交表情包/);
    assert.match(upstreamBody, /一只对周一翻白眼的猫/);
    assert.equal(payload.imageUrl, "data:image/png;base64,AAAA");
    assert.equal(payload.model, "image-model");
    assert.equal(payload.referenceUsed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses multipart image edits when a reference image is supplied", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl = "";
  globalThis.fetch = async (input, init) => {
    upstreamUrl = String(input);
    assert.ok(init?.body instanceof FormData);
    const upstream = init.body as FormData;
    assert.equal(upstream.get("model"), "image-model");
    assert.ok(upstream.get("image") instanceof File);
    assert.match(String(upstream.get("prompt")), /保留可识别特征/);
    return new Response(JSON.stringify({ data: [{ url: "https://cdn.example.com/meme.png" }] }), {
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const form = new FormData();
    form.append("prompt", "把这只猫画成震惊表情包");
    form.append("provider", JSON.stringify(provider));
    form.append("image", new File(["fake-png"], "cat.png", { type: "image/png" }));
    const response = await handleGenerateMemeImage(new Request("https://site.example/api/generate-image", {
      method: "POST",
      body: form,
    }), {});
    const payload = await response.json() as { imageUrl: string; referenceUsed: boolean };

    assert.equal(response.status, 200);
    assert.equal(upstreamUrl, "https://images.example.com/v1/images/edits");
    assert.equal(payload.imageUrl, "https://cdn.example.com/meme.png");
    assert.equal(payload.referenceUsed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects oversized or unsupported reference images before calling the provider", async () => {
  const form = new FormData();
  form.append("prompt", "做成无语表情包");
  form.append("provider", JSON.stringify(provider));
  form.append("image", new File(["not-an-image"], "notes.txt", { type: "text/plain" }));

  const response = await handleGenerateMemeImage(new Request("https://site.example/api/generate-image", {
    method: "POST",
    body: form,
  }), {});
  const payload = await response.json() as { error: string };

  assert.equal(response.status, 400);
  assert.match(payload.error, /仅支持 PNG、JPG 或 WEBP/);
});

test("generates a 3 by 4 person expression sheet with model-authored captions", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl = "";
  let upstreamCalls = 0;
  globalThis.fetch = async (input, init) => {
    upstreamCalls += 1;
    upstreamUrl = String(input);
    assert.ok(init?.body instanceof FormData);
    const upstream = init.body as FormData;
    assert.equal(upstream.get("size"), "1024x1536");
    assert.equal(upstream.get("quality"), "low");
    assert.equal(upstream.get("n"), null);
    assert.match(String(upstream.get("prompt")), /3 列 × 4 行/);
    assert.match(String(upstream.get("prompt")), /竖向切割边界必须位于画布宽度的 33\.33%、66\.67%/);
    assert.match(String(upstream.get("prompt")), /横向切割边界必须位于画布高度的 25\.00%、50\.00%、75\.00%/);
    assert.match(String(upstream.get("prompt")), /边界是隐形坐标，不要画出线条/);
    assert.match(String(upstream.get("prompt")), /禁止圆角卡片/);
    assert.match(String(upstream.get("prompt")), /禁止.*格子间留缝/);
    assert.match(String(upstream.get("prompt")), /自行创作一句 2–6 个汉字/);
    assert.doesNotMatch(String(upstream.get("prompt")), /浏览器.*配字/);
    return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), {
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const form = new FormData();
    form.append("image", new File(["person"], "person.png", { type: "image/png" }));
    form.append("style", "sticker");
    form.append("layout", "3x4");
    form.append("prompt", "整体可爱一点");
    form.append("provider", JSON.stringify(provider));
    const response = await handleGenerateMemePack(new Request("https://site.example/api/generate-pack", {
      method: "POST",
      body: form,
    }), {});
    const payload = await response.json() as {
      imageUrl: string;
      referenceUsed: boolean;
      effectPlan: string[];
      reactionPlan: string[];
      subjectMode: string;
    };

    assert.equal(response.status, 200);
    assert.equal(upstreamUrl, "https://images.example.com/v1/images/edits");
    assert.equal(upstreamCalls, 1);
    assert.equal(payload.imageUrl, "data:image/png;base64,AAAA");
    assert.equal(payload.referenceUsed, true);
    assert.equal(payload.subjectMode, "single");
    assert.equal(payload.effectPlan.length, 12);
    assert.equal(payload.reactionPlan.length, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a useful message when the upstream image gateway times out", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("upstream timeout", { status: 524 });

  try {
    const form = new FormData();
    form.append("image", new File(["person"], "person.png", { type: "image/png" }));
    form.append("layout", "3x4");
    form.append("provider", JSON.stringify(provider));
    const response = await handleGenerateMemePack(new Request("https://site.example/api/generate-pack", {
      method: "POST",
      body: form,
    }), {});
    const payload = await response.json() as { error: string };

    assert.equal(response.status, 504);
    assert.match(payload.error, /上游生图服务/);
    assert.match(payload.error, /快速模式请求 1 张整图/);
    assert.match(payload.error, /2×2 或 3×3/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("describes a pack timeout as one sheet request followed by local slicing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const error = new Error("timed out");
    error.name = "AbortError";
    throw error;
  };

  try {
    const form = new FormData();
    form.append("image", new File(["person"], "person.png", { type: "image/png" }));
    form.append("layout", "3x4");
    form.append("provider", JSON.stringify(provider));
    const response = await handleGenerateMemePack(new Request("https://site.example/api/generate-pack", {
      method: "POST",
      body: form,
    }), {});
    const payload = await response.json() as { error: string };

    assert.equal(response.status, 504);
    assert.match(payload.error, /只生成 1 张整图/);
    assert.match(payload.error, /再切成 12 张/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends two reference images and builds a themed interaction pack", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    assert.ok(init?.body instanceof FormData);
    const upstream = init.body as FormData;
    assert.equal(upstream.get("image"), null);
    assert.equal(upstream.getAll("image[]").length, 2);
    assert.match(String(upstream.get("prompt")), /主体模式：双人互动/);
    assert.match(String(upstream.get("prompt")), /套装主题：情侣互动/);
    assert.match(String(upstream.get("prompt")), /下班后去吃火锅吗/);
    assert.match(String(upstream.get("prompt")), /不能把两张脸融合成一个人/);
    assert.match(String(upstream.get("prompt")), /一人发起动作，另一人必须/);
    assert.match(String(upstream.get("prompt")), /禁止两人只是并排面向镜头/);
    assert.match(String(upstream.get("prompt")), /双向互动动作/);
    assert.match(String(upstream.get("prompt")), /一方发起、另一方回应/);
    assert.match(String(upstream.get("prompt")), /外侧至少 8%/);
    assert.match(String(upstream.get("prompt")), /最多占格子宽度的 78%/);
    assert.match(String(upstream.get("prompt")), /每格下方 20% 必须专门留给完整配字/);
    assert.match(String(upstream.get("prompt")), /配字底部不得低于格子高度的 88%/);
    return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }));
  };

  try {
    const form = new FormData();
    form.append("image", new File(["person-one"], "one.png", { type: "image/png" }));
    form.append("image2", new File(["person-two"], "two.jpg", { type: "image/jpeg" }));
    form.append("layout", "2x2");
    form.append("theme", "couple");
    form.append("scenario", "下班后去吃火锅吗");
    form.append("provider", JSON.stringify(provider));
    const response = await handleGenerateMemePack(new Request("https://site.example/api/generate-pack", {
      method: "POST",
      body: form,
    }), {});
    const payload = await response.json() as {
      subjectMode: string;
      effectPlan: string[];
      reactionPlan: string[];
      notice: string;
    };

    assert.equal(response.status, 200);
    assert.equal(payload.subjectMode, "duo");
    assert.equal(payload.effectPlan.length, 4);
    assert.equal(payload.reactionPlan.length, 4);
    assert.match(payload.notice, /双人互动/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requires a sentence when the conversational scenario theme is selected", async () => {
  const form = new FormData();
  form.append("image", new File(["person"], "person.png", { type: "image/png" }));
  form.append("theme", "scenario");
  form.append("provider", JSON.stringify(provider));

  const response = await handleGenerateMemePack(new Request("https://site.example/api/generate-pack", {
    method: "POST",
    body: form,
  }), {});
  const payload = await response.json() as { error: string };

  assert.equal(response.status, 400);
  assert.match(payload.error, /输入一句对话或场景/);
});

test("uses a square canvas and 16 reactions for the 4x4 pack", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const upstream = init?.body as FormData;
    assert.equal(upstream.get("size"), "1024x1024");
    assert.equal(upstream.get("quality"), "low");
    assert.match(String(upstream.get("prompt")), /4 列 × 4 行，共 16 个格子/);
    assert.match(String(upstream.get("prompt")), /求求了/);
    return new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }));
  };

  try {
    const form = new FormData();
    form.append("image", new File(["person"], "person.png", { type: "image/png" }));
    form.append("layout", "4x4");
    form.append("provider", JSON.stringify(provider));
    const response = await handleGenerateMemePack(new Request("https://site.example/api/generate-pack", {
      method: "POST",
      body: form,
    }), {});
    const payload = await response.json() as { notice: string };

    assert.equal(response.status, 200);
    assert.match(payload.notice, /4×4/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
