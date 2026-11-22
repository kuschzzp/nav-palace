import { NextResponse } from "next/server";
import { enforcePersistentRateLimit } from "@/lib/auth";
import { ACCESS_COOKIE, accessCookieOptions, accessPasswordInputSchema, authenticateAccessPassword, getRequestPrivateAccess, isAccessConfigured } from "@/lib/private-access";
import { ApiError, apiErrorResponse, assertSameOrigin, readJson } from "@/lib/validation";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  return NextResponse.json({ unlocked: getRequestPrivateAccess(request), configured: isAccessConfigured() }, { headers });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    // 小型私人导航使用持久的全站窗口，不能通过伪造代理 IP 头绕过尝试次数。
    enforcePersistentRateLimit("nav-palace:private-access", 12, "尝试过于频繁，请一分钟后再试");
    const { password } = accessPasswordInputSchema.parse(await readJson(request));
    if (!isAccessConfigured()) throw new ApiError(503, "暂未配置私密访问密码，请联系站长");
    const token = await authenticateAccessPassword(password);
    if (!token) throw new ApiError(403, "访问密码不正确");
    const response = NextResponse.json({ ok: true }, { headers });
    response.cookies.set(ACCESS_COOKIE, token, accessCookieOptions());
    return response;
  } catch (error) {
    const response = apiErrorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const response = NextResponse.json({ ok: true }, { headers });
    response.cookies.set(ACCESS_COOKIE, "", { ...accessCookieOptions(), maxAge: 0, expires: new Date(0) });
    return response;
  } catch (error) {
    const response = apiErrorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
