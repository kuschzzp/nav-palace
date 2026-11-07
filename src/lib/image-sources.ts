import assetManifest from "./generated/image-assets.json";

type Variant = { width: number; src: string };
type Asset = { src: string; width: number; height: number; variants: Variant[]; avifVariants?: Variant[] };
const assets: Record<string, Asset> = assetManifest;

function srcSet(variants: Variant[]) {
  return variants.map((item) => `${item.src} ${item.width}w`).join(", ") || undefined;
}

/** 只改浏览器实际下载地址；数据库及素材选择值仍使用原始地址。 */
export function getImageSources(original: string, maximumWidth = 800) {
  const asset = assets[original];
  if (asset) {
    const candidates = asset.variants.filter((item) => item.width <= maximumWidth);
    const variants = candidates.length ? candidates : asset.variants.slice(0, 1);
    const widths = new Set(variants.map((item) => item.width));
    const avif = (asset.avifVariants || []).filter((item) => widths.has(item.width));
    return {
      src: variants.at(-1)?.src || asset.src,
      srcSet: srcSet(variants),
      // AVIF 必须覆盖同一组选图尺寸，避免缺少缩略档时反而下载最大图。
      avifSrcSet: avif.length === variants.length ? srcSet(avif) : undefined,
    };
  }
  // 上传原图始终可用；旧上传的派生图在首次请求时生成并持久化缓存。
  if (/^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/.test(original)) {
    const widths = [240, 480, 800].filter((width) => width <= maximumWidth);
    if (!widths.length) widths.push(240);
    return { src: `${original}?w=${widths.at(-1)}`, srcSet: srcSet(widths.map((width) => ({ width, src: `${original}?w=${width}` }))), avifSrcSet: undefined };
  }
  // 自定义外部图片直接由浏览器加载，避免将服务器变成任意远程图片代理。
  return { src: original, srcSet: undefined, avifSrcSet: undefined };
}
