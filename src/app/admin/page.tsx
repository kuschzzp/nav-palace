import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getAdminData, hasAdmin } from "@/lib/db";
import { AdminDashboard } from "@/components/admin-dashboard";

export default async function AdminPage() {
  // 先检查初始化状态，再验证管理员会话，确保后台数据只交给合法管理员。
  if (!await hasAdmin()) redirect("/admin/setup");
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return <AdminDashboard initialData={await getAdminData()} user={{ name: session.user.name, email: session.user.email }} />;
}
