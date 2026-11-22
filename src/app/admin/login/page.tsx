import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { hasAdmin } from "@/lib/db";
import { getAdminSession } from "@/lib/auth";

export default async function LoginPage() {
  // 未初始化时先完成设置，已登录的管理员则直接进入后台。
  if (!hasAdmin()) redirect("/admin/setup");
  if (await getAdminSession()) redirect("/admin");
  return <AuthForm mode="login" />;
}
