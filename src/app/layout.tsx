import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { getSettings } from "@/lib/db";
import { getImageSources } from "@/lib/image-sources";
// 字体随应用分发，构建和访问页面时都无需连接外部字体服务。
import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/noto-serif-sc";
import "./calligraphy.css";
import "./globals.css";
import "./optimized-backgrounds.css";

// Logo 来自 SQLite，每次请求读取当前配置，避免标签页图标在构建时被固定。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateMetadata(): Metadata {
  const { logoUrl } = getSettings();
  return {
    title: { default: "NAV PALACE · 让热爱，有处可达", template: "%s · NAV PALACE" },
    description: "一个收藏作品、记录热爱的小小入口。",
    icons: { icon: logoUrl ? getImageSources(logoUrl, 96).src : "/favicon.ico" },
  };
}

export const viewport: Viewport = { themeColor: "#f5f0e5" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body style={{ "--font-display": '"Noto Serif SC Variable", "Songti SC", serif', "--font-body": '"Noto Sans SC Variable", system-ui, sans-serif' } as CSSProperties}>
        {children}
      </body>
    </html>
  );
}
