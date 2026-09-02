import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the meme creator", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>梗一下｜AI 表情包生成器与 GIF 制作器<\/title>/);
  assert.match(html, /AI 心情出图/);
  assert.match(html, /AI 生图/);
  assert.match(html, /图片表情包/);
  assert.match(html, /图片 \/ 视频转 GIF/);
  assert.match(html, /素材流向说清楚/);
  assert.doesNotMatch(html, /Your site is taking shape|Starter Project/);
});

test("keeps the image-generation model and privacy disclosure in the product UI", async () => {
  const [page, imageHandler, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/meme-image-ai.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /gpt-image-2/);
  assert.match(page, /Image Model Name/);
  assert.match(page, /参考图只会在你点击生成时/);
  assert.match(page, /支持上传、粘贴剪贴板图片或图片直链/);
  assert.match(page, /直链素材禁止跨域读取（CORS）/);
  assert.match(imageHandler, /只创作社交表情包/);
  assert.match(imageHandler, /images\/\$\{action\}/);
  assert.match(worker, /\/api\/generate-image/);
});
