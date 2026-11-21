import type { Metadata } from "next";
import { Portal } from "@/components/portal";
import { getPortalData, getSettings } from "@/lib/db";
import { getPrivateAccess, isAccessConfigured } from "@/lib/private-access";

// 每次请求读取当前 SQLite 配置，后台保存后无需重新构建首页。
// better-sqlite3 依赖 Node.js 原生模块，不能使用 Edge 运行时。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return { title: `${settings.name} · ${settings.headline}`, description: settings.subtitle };
}

export default async function HomePage() {
  const accessUnlocked = await getPrivateAccess();
  const data = await getPortalData(accessUnlocked);
  return <Portal {...data} accessUnlocked={accessUnlocked} accessConfigured={await isAccessConfigured()} />;
}
