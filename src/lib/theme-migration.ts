// 只迁移已停用的内置素材，绝不改写上传图片或第三方同名图片。
const legacyNames: Record<string, string> = {
  "site-journal": "writing", "site-blog": "writing", "site-studio": "tools",
  "site-gallery": "landscape", "site-lottery": "choice", "site-mail": "mail",
  "site-notes": "knowledge", "site-relay": "tools", "site-monitor": "tools",
  "site-mcp": "tools", "site-ms365": "knowledge",
};

export function migrateLegacyCover(image: string, trustedOrigin?: string): string {
  let pathname = image;
  if (/^https?:\/\//i.test(image)) {
    try {
      const url = new URL(image);
      const configured = trustedOrigin ? new URL(trustedOrigin).origin : undefined;
      // localhost 是项目明确支持的独立预览来源，旧预览端口变化不应留下失效内置图。
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.username || url.password || (url.origin !== configured && !loopback)) return image;
      pathname = url.pathname;
    } catch { return image; }
  }
  const match = /^\/images\/(site-[a-z0-9-]+)\.(?:webp|png)$/.exec(pathname);
  const name = match && legacyNames[match[1]];
  return name ? `/images/ink/${name}.webp` : image;
}
