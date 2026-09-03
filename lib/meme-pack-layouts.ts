export const MEME_PACK_COLUMNS = 3;
export const MEME_PACK_ROWS = 4;
export const MEME_PACK_COUNT = MEME_PACK_COLUMNS * MEME_PACK_ROWS;

export const MEME_PACK_LAYOUTS = [
  { id: "2x2", columns: 2, rows: 2, count: 4, size: "1024x1024", label: "2×2" },
  { id: "3x3", columns: 3, rows: 3, count: 9, size: "1024x1024", label: "3×3" },
  { id: "3x4", columns: 3, rows: 4, count: 12, size: "1024x1536", label: "3×4" },
  { id: "4x4", columns: 4, rows: 4, count: 16, size: "1024x1024", label: "4×4" },
] as const;

export type MemePackLayoutId = (typeof MEME_PACK_LAYOUTS)[number]["id"];
export type MemePackLayout = (typeof MEME_PACK_LAYOUTS)[number];

export function getMemePackLayout(value: string | null | undefined): MemePackLayout {
  return MEME_PACK_LAYOUTS.find((layout) => layout.id === value) ?? MEME_PACK_LAYOUTS[2];
}
