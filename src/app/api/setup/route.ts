import { enforceSetupRateLimit, getAuth, verifySetupToken } from "@/lib/auth";
import { createAdministrator, hasAdmin } from "@/lib/db";
import { ApiError, apiErrorResponse, assertSameOrigin, readJson, setupSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (hasAdmin()) throw new ApiError(409, "管理员已创建，请直接登录");
    enforceSetupRateLimit();
    const input = setupSchema.parse(await readJson(request));
    verifySetupToken(input.token);
    // 保持公开注册关闭；复用 Better Auth 的密码哈希，再由事务原子创建唯一管理员和登录账号。
    const context = await getAuth().$context;
    const passwordHash = await context.password.hash(input.password);
    createAdministrator({ name: input.name, email: input.email, passwordHash });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
