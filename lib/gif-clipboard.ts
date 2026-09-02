export type ClipboardRepresentations = Record<string, Blob>;
export type GifCopyMode = "gif" | "compatible";

type CopyGifOptions<Item> = {
  gifBlob: Blob;
  canWriteGif: boolean;
  createItem: (representations: ClipboardRepresentations) => Item;
  write: (items: Item[]) => Promise<void>;
  createPngFallback: () => Promise<Blob>;
  readGifAsDataUrl?: (blob: Blob) => Promise<string>;
};

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取 GIF"));
    reader.readAsDataURL(blob);
  });
}

export async function copyGifBlob<Item>({
  gifBlob,
  canWriteGif,
  createItem,
  write,
  createPngFallback,
  readGifAsDataUrl = readBlobAsDataUrl,
}: CopyGifOptions<Item>): Promise<GifCopyMode> {
  if (canWriteGif) {
    try {
      await write([createItem({ "image/gif": gifBlob })]);
      return "gif";
    } catch {
      // Some browsers report GIF support but reject it at write time.
      // Continue with HTML + PNG representations for broad paste support.
    }
  }

  const [pngBlob, gifDataUrl] = await Promise.all([
    createPngFallback(),
    readGifAsDataUrl(gifBlob),
  ]);
  const htmlBlob = new Blob([
    `<img src="${gifDataUrl}" alt="GIF" />`,
  ], { type: "text/html" });

  await write([createItem({
    "text/html": htmlBlob,
    "image/png": pngBlob,
  })]);
  return "compatible";
}
