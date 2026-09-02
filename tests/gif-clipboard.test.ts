import assert from "node:assert/strict";
import test from "node:test";
import { copyGifBlob, type ClipboardRepresentations } from "../lib/gif-clipboard";

type FakeItem = { representations: ClipboardRepresentations };

function fakeItem(representations: ClipboardRepresentations): FakeItem {
  return { representations };
}

test("copies the original GIF when the browser supports its MIME type", async () => {
  const gifBlob = new Blob(["gif-data"], { type: "image/gif" });
  const writes: FakeItem[][] = [];
  let fallbackCreated = false;

  const mode = await copyGifBlob({
    gifBlob,
    canWriteGif: true,
    createItem: fakeItem,
    write: async (items) => { writes.push(items); },
    createPngFallback: async () => {
      fallbackCreated = true;
      return new Blob([], { type: "image/png" });
    },
  });

  assert.equal(mode, "gif");
  assert.equal(fallbackCreated, false);
  assert.equal(writes[0][0].representations["image/gif"], gifBlob);
});

test("uses HTML GIF and PNG representations when direct GIF copy is unavailable", async () => {
  const writes: FakeItem[][] = [];
  const pngBlob = new Blob(["png-data"], { type: "image/png" });

  const mode = await copyGifBlob({
    gifBlob: new Blob(["gif-data"], { type: "image/gif" }),
    canWriteGif: false,
    createItem: fakeItem,
    write: async (items) => { writes.push(items); },
    createPngFallback: async () => pngBlob,
    readGifAsDataUrl: async () => "data:image/gif;base64,R0lG",
  });

  const representations = writes[0][0].representations;
  assert.equal(mode, "compatible");
  assert.equal(representations["image/png"], pngBlob);
  assert.match(await representations["text/html"].text(), /data:image\/gif;base64,R0lG/);
});

test("falls back when a browser claims GIF support but rejects the direct write", async () => {
  let attempts = 0;
  const mode = await copyGifBlob({
    gifBlob: new Blob(["gif-data"], { type: "image/gif" }),
    canWriteGif: true,
    createItem: fakeItem,
    write: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("unsupported format");
    },
    createPngFallback: async () => new Blob([], { type: "image/png" }),
    readGifAsDataUrl: async () => "data:image/gif;base64,R0lG",
  });

  assert.equal(mode, "compatible");
  assert.equal(attempts, 2);
});
