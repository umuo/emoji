import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource/zcool-kuaile/chinese-simplified.css";
import "./globals.css";

const title = "梗一下｜AI 表情包生成器与 GIF 制作器";
const description = "上传人物照片，用 AI 一次生成 12 张带自适应配字的表情套装并下载 PNG/GIF 压缩包；还支持提示词生图、图片编辑与图片/视频转 GIF。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "梗一下",
      locale: "zh_CN",
      type: "website",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "梗一下 AI 表情包生成器与 GIF 制作器" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
