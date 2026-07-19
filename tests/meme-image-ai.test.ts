import assert from "node:assert/strict";
import test from "node:test";
import { handleGenerateMemeImage } from "../lib/meme-image-ai";

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
