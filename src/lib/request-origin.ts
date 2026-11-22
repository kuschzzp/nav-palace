// 访问地址只来自部署配置，不根据客户端可伪造的代理头自动增加可信来源。
function parseOrigin(value: string) {
  if (!/^https?:\/\/[^/]+\/?$/i.test(value) || /[\u0000-\u0020\u007f\\*?#]/.test(value)) return undefined;
  const url = URL.parse(value);
  if (!url || !url.hostname || url.username || url.password) return undefined;
  return url.origin;
}

export function getAllowedOrigins(): string[] {
  const values = [process.env.BETTER_AUTH_URL ?? "", ...(process.env.ALLOWED_ORIGINS ?? "").split(",")];
  const origins = new Set<string>();
  const hosts = new Map<string, string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const origin = parseOrigin(trimmed);
    if (!origin) throw new Error("访问地址配置无效，请使用不含路径、凭据或通配符的完整 HTTP/HTTPS 地址");
    const host = new URL(origin).host;
    // 每个主机及端口只有一种接入协议，避免依据不可信的转发头降低 Cookie 安全性。
    if (hosts.has(host) && hosts.get(host) !== origin) {
      throw new Error("同一主机和端口不能同时配置 HTTP 与 HTTPS，请使用不同的主机或端口");
    }
    hosts.set(host, origin);
    origins.add(origin);
  }
  return [...origins];
}

export function getRequestOrigin(source: Request | Headers): string | undefined {
  const request = source instanceof Headers ? undefined : source;
  const headers = request ? request.headers : source as Headers;
  const host = headers.get("host") ?? (request ? URL.parse(request.url)?.host : undefined);
  if (!host || !/^[a-zA-Z0-9.\-:[\]]+$/.test(host)) return undefined;
  for (const origin of getAllowedOrigins()) {
    const allowed = new URL(origin);
    // 使用允许地址的协议规范化默认端口，保留 IP 自定义端口和 IPv6 方括号。
    if (URL.parse(`${allowed.protocol}//${host}`)?.host === allowed.host) return origin;
  }
  return undefined;
}
