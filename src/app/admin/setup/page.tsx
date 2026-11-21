import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { hasAdmin } from "@/lib/db";

export default async function SetupPage() {
  // 初始化入口只在尚无管理员时显示；创建接口还会独立校验初始化密钥与单例约束。
  if (await hasAdmin()) redirect("/admin/login");
  return <AuthForm mode="setup" />;
}
