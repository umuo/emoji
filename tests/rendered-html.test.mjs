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
  assert.doesNotMatch(html, /AI 心情出图/);
  assert.match(html, /AI 生图/);
  assert.match(html, /人物表情套装/);
  assert.match(html, /图片表情包/);
  assert.match(html, /图片 \/ 视频转 GIF/);
  assert.match(html, /素材流向说清楚/);
  assert.doesNotMatch(html, /Your site is taking shape|Starter Project/);
});

test("keeps the image-generation model and privacy disclosure in the product UI", async () => {
  const [page, imageHandler, packConfig, themeConfig, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/meme-image-ai.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/meme-pack-layouts.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/meme-pack-themes.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /gpt-image-2/);
  assert.match(page, /Image Model Name/);
  assert.match(page, /参考图只会在你点击生成时/);
  assert.match(page, /支持上传、粘贴剪贴板图片或图片直链/);
  assert.match(page, /直链素材禁止跨域读取（CORS）/);
  assert.match(page, /复制 GIF/);
  assert.match(page, /downloadGeneratedImageGif/);
  assert.match(page, /下载高清图/);
  assert.match(page, /继续编辑/);
  assert.match(page, /制作动态 GIF/);
  assert.match(page, /下载 PNG 压缩包/);
  assert.match(page, /下载动态 GIF 压缩包/);
  assert.match(page, /下载静态 GIF 压缩包（无动画）/);
  assert.match(page, /encodePackSliceStaticGif/);
  assert.match(page, /format === "gif-static"/);
  assert.match(packConfig, /2×2/);
  assert.match(packConfig, /3×3/);
  assert.match(packConfig, /3×4/);
  assert.match(packConfig, /4×4/);
  assert.match(page, /selectedPackLayout\.count/);
  assert.match(page, /每格文字由 gpt-image-2 随表情创作/);
  assert.match(page, /添加搭档（双人互动）/);
  assert.match(page, /套装主题/);
  assert.match(page, /输入一句对话或场景/);
  assert.match(page, /AI 已智能匹配，可单独调整/);
  assert.match(page, /updatePackEffect/);
  assert.match(page, /form\.append\("image2"/);
  assert.match(themeConfig, /日常万能/);
  assert.match(themeConfig, /打工人/);
  assert.match(themeConfig, /情侣互动/);
  assert.match(themeConfig, /朋友斗图/);
  assert.match(themeConfig, /游戏开黑/);
  assert.match(themeConfig, /场景对话/);
  assert.match(page, /fetch\("\/api\/generate-pack"/);
  assert.match(page, /发疯抖动/);
  assert.match(page, /高清 GIF/);
  assert.match(page, /copyGeneratedImage/);
  assert.match(page, /hidden=\{Boolean\(gifUrl\)\}/);
  assert.match(page, /clearGifResult\(\);\s*setStillGifEffect/);
  assert.match(page, /ClipboardItem\.supports\("image\/gif"\)/);
  assert.match(imageHandler, /只创作社交表情包/);
  assert.match(imageHandler, /images\/\$\{action\}/);
  assert.match(worker, /\/api\/generate-image/);
  assert.match(worker, /\/api\/generate-pack/);
});
