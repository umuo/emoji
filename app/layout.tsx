import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "梗一下｜在线表情包与 GIF 制作器";
const description = "无需注册，在线制作表情包并将视频转换为 GIF。所有素材都在浏览器本地处理。";

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
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "梗一下在线表情包与 GIF 制作器" }],
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
