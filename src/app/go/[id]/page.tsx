import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Departure } from "@/components/departure";
import { getPublicSite, getSettings } from "@/lib/db";
import { webUrlSchema } from "@/lib/validation";
import { getPrivateAccess } from "@/lib/private-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "即将抵达", robots: { index: false, follow: false } };

export default async function DeparturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 只按数据库中的公开站点 ID 解析目标，不接受查询参数指定任意跳转地址。
  const site = await getPublicSite(id, await getPrivateAccess());
  if (!site || !webUrlSchema.safeParse(site.url).success) notFound();
  return <Departure site={site} settings={await getSettings()} />;
}
