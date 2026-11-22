import { requireAdmin, enforcePersistentRateLimit } from "@/lib/auth";
import { accessPasswordInputSchema, setAccessPassword } from "@/lib/private-access";
import { apiErrorResponse, assertSameOrigin, readJson } from "@/lib/validation";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    enforcePersistentRateLimit("nav-palace:access-password-change", 5, "修改过于频繁，请一分钟后重试");
    const { password } = accessPasswordInputSchema.parse(await readJson(request));
    await setAccessPassword(password);
    return Response.json({ configured: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
