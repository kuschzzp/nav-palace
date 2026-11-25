import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 仅离线生成；保留原图和已保存的地址，由清单映射到带哈希的静态资源。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (name) => path.join(root, name);
const manifestPath = "src/lib/generated/image-assets.json";
const outputDirectory = "public/images/optimized";
const qaPath = "docs/qa/image-optimization-2026-11-07.json";
const digest = (data) => createHash("sha256").update(data).digest("hex");
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const presets = await readFile(at("src/lib/media-presets.ts"), "utf8");
const urls = [...new Set(presets.match(/\/images\/(?:ink|logos)\/[\w-]+\.webp/g))];
const reliefWidths = { "relief-sun": [384, 768, 1152], "relief-pine": [320, 640, 960], "relief-plum": [240, 480] };
for (const name of ["paper", "sun-pine", "plum-stone", "avatar", "petal", ...Object.keys(reliefWidths)]) urls.push(`/images/ink/${name}.webp`);
const oldManifest = await readFile(at(manifestPath), "utf8").then(JSON.parse).catch((error) => {
  if (error.code === "ENOENT") return {};
  throw error;
});
const oldMetrics = await readFile(at(qaPath), "utf8").then(JSON.parse).catch((error) => {
  if (error.code === "ENOENT") return { assets: [] };
  throw error;
});
for (const directory of [outputDirectory, "src/lib/generated", "docs/qa"]) await mkdir(at(directory), { recursive: true });
const manifest = {};
const measurements = [];
const owned = new Set();
const paddedScales = { writing: 0.88, tools: 0.87, landscape: 0.86, camera: 0.8, crane: 0.8, go: 0.8, guqin: 0.8, koi: 0.8, lotus: 0.8, pavilion: 0.8, rain: 0.85, sailing: 0.88 };

function alphaStats(data, channels) {
  if (channels !== 4) return null;
  let min = 255, max = 0, transparentPixels = 0, partialPixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index];
    min = Math.min(min, alpha); max = Math.max(max, alpha);
    if (alpha === 0) transparentPixels++;
    else if (alpha < 255) partialPixels++;
  }
  return { min, max, transparentPixels, partialPixels };
}

async function originalComposition(source, name, logo, width, height) {
  if (logo) {
    // 复现现有 Logo 构图：裁去 alpha 不超过 10 的边缘，等比缩入 216px，再补 20px 安全留白。
    const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, right = 0, top = info.height, bottom = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] <= 10) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    return sharp(source).extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
      .resize(216, 216, { fit: "contain", background: transparent })
      .extend({ left: 20, right: 20, top: 20, bottom: 20, background: transparent }).png().toBuffer();
  }
  if (name === "sun-pine") return sharp(source).resize(1440, 520, { fit: "fill" })
    .extend({ bottom: 80, background: transparent }).png().toBuffer();
  const scale = paddedScales[name] ?? 1;
  const innerWidth = Math.round(width * scale), innerHeight = Math.round(height * scale);
  const left = Math.floor((width - innerWidth) / 2), top = Math.floor((height - innerHeight) / 2);
  return sharp(source).resize(innerWidth, innerHeight, { fit: "contain", background: transparent })
    .extend({ left, right: width - innerWidth - left, top, bottom: height - innerHeight - top, background: transparent })
    .png().toBuffer();
}

for (const url of urls) {
  const name = path.basename(url, ".webp");
  const logo = url.includes("/logos/");
  const original = await readFile(at(`public${url}`));
  const originalMetadata = await sharp(original).metadata();
  const sourcePath = `docs/design/${logo ? "logo" : "ink"}-assets/${name}-source.png`;
  const source = await readFile(at(sourcePath));
  const sourceSha256 = digest(source);
  const composition = await originalComposition(source, name, logo, originalMetadata.width, originalMetadata.height);
  const widths = reliefWidths[name] ?? (logo ? [96, 256] : name === "sun-pine" ? [480, 960, 1440] : name === "plum-stone" ? [240, 500]
    : name === "paper" ? [384, 768] : name === "avatar" ? [64, 128, 256] : name === "petal" ? [32, 64] : [240, 480, 800]);
  const fingerprint = digest(Buffer.concat([composition, original, Buffer.from(JSON.stringify({ sourceSha256, widths, webp: 80, alpha: 100, avif: 58, effort: 5, versions: sharp.versions }))]));
  const cached = oldMetrics.assets.find((asset) => asset.url === url && asset.fingerprint === fingerprint);
  if (cached && oldManifest[url]) {
    const files = [...oldManifest[url].variants, ...(oldManifest[url].avifVariants ?? [])];
    const intact = await Promise.all(files.map(async ({ src }) => {
      const bytes = await readFile(at(`public${src}`)).catch(() => null);
      return bytes && path.basename(src).includes(`-${digest(bytes).slice(0, 12)}.`);
    }));
    if (intact.every(Boolean)) {
      manifest[url] = oldManifest[url];
      measurements.push(cached);
      files.forEach(({ src }) => owned.add(src));
      continue;
    }
  }
  const variants = [], avifVariants = [], metrics = [];
  for (const width of widths) {
    const height = Math.round(width * originalMetadata.height / originalMetadata.width);
    const prepared = await sharp(composition).resize(width, height, { fit: "fill" }).png().toBuffer();
    const preparedReference = await sharp(prepared).raw().toBuffer({ resolveWithObject: true });
    let webp = await sharp(prepared).webp({ quality: 80, alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer();
    const encodedFromPngBytes = webp.length;
    const reusedOriginalWebp = width === originalMetadata.width && webp.length > original.length;
    if (reusedOriginalWebp) {
      webp = original;
    }
    const avif = await sharp(prepared).avif({ quality: 58, effort: 5, chromaSubsampling: "4:4:4" }).toBuffer();
    const row = { width, height, webpBytes: webp.length, encodedFromPngBytes, reusedOriginalWebp, avifBytes: avif.length, avifSelected: avif.length < webp.length * 0.9, formats: {} };
    for (const [format, encoded] of [["webp", webp], ["avif", avif]]) {
      const reference = format === "webp" && reusedOriginalWebp ? await sharp(original).raw().toBuffer({ resolveWithObject: true }) : preparedReference;
      const decoded = await sharp(encoded).raw().toBuffer({ resolveWithObject: true });
      const alpha = alphaStats(decoded.data, decoded.info.channels);
      if (originalMetadata.hasAlpha && (!alpha || alpha.transparentPixels === 0 || alpha.partialPixels === 0)) throw new Error(`Lost transparency: ${url} ${width} ${format}`);
      let alphaMeanAbsoluteError = null;
      if (alpha && reference.info.channels === 4) {
        let sum = 0;
        for (let index = 3; index < decoded.data.length; index += 4) sum += Math.abs(decoded.data[index] - reference.data[index]);
        alphaMeanAbsoluteError = Number((sum / (width * height)).toFixed(5));
      }
      row.formats[format] = { alpha, alphaMeanAbsoluteError };
      if (format === "avif" && !row.avifSelected) continue;
      // 文件名同时包含原图 SHA 与编码内容哈希，原图修改后即使缩放结果近似也会更新地址。
      const filename = `${logo ? "logo" : "ink"}-${name}-${width}-${sourceSha256.slice(0, 10)}-${digest(encoded).slice(0, 12)}.${format}`;
      const src = `/images/optimized/${filename}`;
      await writeFile(at(`public${src}`), encoded);
      owned.add(src);
      (format === "webp" ? variants : avifVariants).push({ width, src });
    }
    metrics.push(row);
  }
  manifest[url] = { src: variants.at(-1).src, width: widths.at(-1), height: Math.round(widths.at(-1) * originalMetadata.height / originalMetadata.width), variants,
    ...(avifVariants.length ? { avifVariants } : {}) };
  measurements.push({ url, sourcePath, sourceSha256, fingerprint, originalBytes: original.length, originalWidth: originalMetadata.width,
    originalHeight: originalMetadata.height, hasAlpha: originalMetadata.hasAlpha, variants: metrics });
}

// 仅清理上一版清单明确引用的过期文件，避免误删同目录的其他资源。
for (const asset of Object.values(oldManifest)) for (const variant of [...(asset.variants ?? []), ...(asset.avifVariants ?? [])]) {
  if (owned.has(variant.src) || !/^\/images\/optimized\/(ink|logo)-[a-z-]+-\d+-[a-f0-9]{10}-[a-f0-9]{12}\.(webp|avif)$/.test(variant.src)) continue;
  await unlink(at(`public${variant.src}`)).catch((error) => { if (error.code !== "ENOENT") throw error; });
}
await writeFile(at(manifestPath), JSON.stringify(manifest, null, 2) + "\n");
// 使用自定义属性避免组件样式加载顺序影响，不改变原有布局、尺寸和透明度。
function cssImage(url, width, avif = false) {
  const asset = manifest[url];
  const webp = asset.variants.find((variant) => variant.width === width).src;
  const alternative = asset.avifVariants?.find((variant) => variant.width === width)?.src;
  return avif && alternative ? `image-set(url("${alternative}") type("image/avif"), url("${webp}") type("image/webp"))` : `url("${webp}")`;
}
function cssVariables(sunWidth, plumWidth, avif = false) {
  return `:root {\n  --paper-image: ${cssImage("/images/ink/paper.webp", 768, avif)};\n  --sun-pine-image: ${cssImage("/images/ink/sun-pine.webp", sunWidth, avif)};\n  --plum-stone-image: ${cssImage("/images/ink/plum-stone.webp", plumWidth, avif)};\n  --writing-image: ${cssImage("/images/ink/writing.webp", 480, avif)};\n}\n`;
}
await writeFile(at("src/app/optimized-backgrounds.css"), `/* 由 scripts/optimize-images.mjs 自动生成；仅替换图片来源，布局沿用现有样式。 */\n${cssVariables(1440, 500)}@media (min-width: 701px) and (max-width: 1100px) {\n${cssVariables(960, 500)}}\n@media (max-width: 700px) {\n${cssVariables(480, 240)}}\n@supports (background-image: image-set(url("x.avif") type("image/avif"))) {\n${cssVariables(1440, 500, true)}@media (min-width: 701px) and (max-width: 1100px) {\n${cssVariables(960, 500, true)}}\n@media (max-width: 700px) {\n${cssVariables(480, 240, true)}}\n}\n`);
await writeFile(at(qaPath), JSON.stringify({ settings: { webpQuality: 80, webpAlphaQuality: 100, avifQuality: 58, avifMinimumSaving: 0.1,
  composition: "Rebuilt from archived PNGs with existing padding and background framing", sourceVersion: "SHA-256", sharpVersion: sharp.versions.sharp },
  assets: measurements }, null, 2) + "\n");

// 持久化质检对照图：原图 / 最大 WebP / 最小 WebP / 优先使用的最大 AVIF。
const examples = ["/images/ink/writing.webp", "/images/ink/rain.webp", "/images/ink/koi.webp", "/images/ink/maple.webp", "/images/ink/sun-pine.webp", "/images/ink/plum-stone.webp", "/images/logos/pine.webp", "/images/ink/paper.webp"];
const tiles = [];
for (let row = 0; row < examples.length; row++) {
  const url = examples[row], asset = manifest[url];
  const preferred = asset.avifVariants?.find((variant) => variant.width === asset.width)?.src ?? asset.src;
  const files = [`public${url}`, `public${asset.src}`, `public${asset.variants[0].src}`, `public${preferred}`];
  for (let column = 0; column < files.length; column++) {
    const image = await sharp(at(files[column])).resize(320, 210, { fit: "contain", background: "#f5f0e5" }).flatten({ background: "#f5f0e5" }).png().toBuffer();
    tiles.push({ input: image, left: column * 320, top: row * 240 + 30 });
    const text = `${path.basename(url)} | ${["original", "webp max", "webp smallest", preferred.endsWith("avif") ? "avif max" : "webp fallback"][column]}`;
    tiles.push({ input: Buffer.from(`<svg width="320" height="30"><text x="8" y="20" font-size="15" fill="#211f1a">${text}</text></svg>`), left: column * 320, top: row * 240 });
  }
}
await sharp({ create: { width: 1280, height: examples.length * 240, channels: 3, background: "#f5f0e5" } }).composite(tiles)
  .jpeg({ quality: 90 }).toFile(at("docs/qa/image-optimization-contact-sheet-2026-11-07.jpg"));
console.log(`Generated ${Object.keys(manifest).length} image entries and ${owned.size} optimized files.`);
