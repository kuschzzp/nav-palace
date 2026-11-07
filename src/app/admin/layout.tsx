import type { Metadata } from "next";
import "./admin.css";
import { SpecularButtons } from "@/components/effects/specular-buttons";
import "@/components/effects/specular-buttons.css";

// 后台不参与搜索引擎索引；访问权限仍由页面和 API 的会话校验保证。
export const metadata: Metadata = { title: "管理后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<SpecularButtons /></>;
}
