import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Mountains } from "@phosphor-icons/react/dist/ssr";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

// 使用与页面相同的山形图标，生成包含 PNG 图像的标准 ICO 文件。
const mark = renderToStaticMarkup(createElement(Mountains, { size: 64, weight: "light", color: "#b83224" }));
const pngs = await Promise.all([16, 32].map((size) => sharp(Buffer.from(mark)).resize(size, size).flatten({ background: "#f5f0e5" }).ensureAlpha().png().toBuffer()));
// ICO 头部记录图像数量，每个目录项分别记录尺寸、字节长度和数据偏移。
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((png, index) => {
  const entry = 6 + index * 16;
  const size = index === 0 ? 16 : 32;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
// 默认图标放在 public，避免 App Router 文件元数据覆盖后台配置的 Logo。
await writeFile("public/favicon.ico", Buffer.concat([header, ...pngs]));

// 主题原图与提示词归档在 docs/design/ink-assets；运行时仅携带优化后的水墨 WebP。
const names = ["paper", "sun-pine", "plum-stone", "writing", "choice", "mail", "knowledge", "tools", "landscape", "tea", "sailing", "astronomy", "rain", "guqin", "go", "koi", "crane", "lotus", "incense", "lantern", "camera", "maple", "pavilion", "avatar", "petal"];
for (const name of names) {
  const metadata = await sharp(`public/images/ink/${name}.webp`).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`主题素材无效：${name}`);
}
// Logo 单独检查尺寸与透明通道，确保小尺寸标志不携带不透明背景。
const logoNames = ["mountain-moon", "pine", "bamboo", "crane", "lotus", "koi", "sail", "fan", "tea", "cloud"];
for (const name of logoNames) {
  const metadata = await sharp(`public/images/logos/${name}.webp`).metadata();
  if (metadata.width !== 256 || metadata.height !== 256 || !metadata.hasAlpha) throw new Error(`Logo 素材无效：${name}`);
}
console.log("朱砂主题图标、水墨素材及 10 款 Logo 检查完成。");
