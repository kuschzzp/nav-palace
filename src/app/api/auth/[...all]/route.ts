import { toNextJsHandler } from "better-auth/next-js";
import { enforcePersistentRateLimit, getAuth } from "@/lib/auth";
import { apiErrorResponse, assertSameOrigin, readJson } from "@/lib/validation";

export const runtime = "nodejs";

// 只开放后台实际使用的认证能力，避免通过通配路由暴露注册等额外接口。
const allowedGetPaths = new Set(["/get-session", "/ok"]);
const allowedPostPaths = new Set([
  "/sign-in/email", "/sign-out", "/change-password", "/update-user",
  "/revoke-session", "/revoke-other-sessions", "/revoke-sessions",
]);

function authPath(request: Request) {
  return new URL(request.url).pathname.replace(/^\/api\/auth/, "");
}

export async function GET(request: Request) {
  try {
    if (!allowedGetPaths.has(authPath(request))) {
      return Response.json({ error: "该认证接口未开放" }, { status: 404 });
    }
    const response = await toNextJsHandler(getAuth()).GET(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!allowedPostPaths.has(authPath(request))) {
      return Response.json({ error: "该认证接口未开放" }, { status: 404 });
    }
    // 单管理员站点额外设置共享的数据库限流；保留认证库按 IP 限流，但不将其作为唯一防线，
    // 避免未配置可信反向代理时因来源 IP 判断不可靠而失去保护。
    if (authPath(request) === "/sign-in/email") {
      await enforcePersistentRateLimit("nav-palace:sign-in", 12, "登录尝试过于频繁，请一分钟后重试");
    }
    if (authPath(request) === "/change-password") {
      await enforcePersistentRateLimit("nav-palace:change-password", 5, "修改密码过于频繁，请一分钟后重试");
    }
    // 先限制并解析请求体，再交给认证库；重新序列化后不能沿用原来的 Content-Length。
    const input = request.body ? await readJson(request) : {};
    const headers = new Headers(request.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json");
    const boundedRequest = new Request(request.url, { method: "POST", headers, body: JSON.stringify(input) });
    return await toNextJsHandler(getAuth()).POST(boundedRequest);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
