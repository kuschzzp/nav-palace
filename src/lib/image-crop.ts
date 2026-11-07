export type CropSize = { width: number; height: number };
export type CropOffset = { x: number; y: number };

// 使用同一份几何计算驱动预览和 Canvas，避免确认后的取景与画面不一致。
export function getCropGeometry(image: CropSize, viewport: CropSize, zoom: number, offset: CropOffset) {
  if (![image.width, image.height, viewport.width, viewport.height, zoom].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("裁剪尺寸无效。");
  }
  const scale = Math.max(viewport.width / image.width, viewport.height / image.height) * Math.max(1, zoom);
  const width = image.width * scale;
  const height = image.height * scale;
  const maxX = Math.max(0, (width - viewport.width) / 2);
  const maxY = Math.max(0, (height - viewport.height) / 2);
  const x = Math.min(maxX, Math.max(-maxX, offset.x));
  const y = Math.min(maxY, Math.max(-maxY, offset.y));
  return {
    scale, width, height, offset: { x, y },
    source: {
      x: Math.max(0, (image.width - viewport.width / scale) / 2 - x / scale),
      y: Math.max(0, (image.height - viewport.height / scale) / 2 - y / scale),
      width: Math.min(image.width, viewport.width / scale),
      height: Math.min(image.height, viewport.height / scale),
    },
  };
}

export function getCropOutputSize(aspect: number): CropSize {
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error("裁剪比例无效。");
  // 图片统一以轻量的 800px 宽导出，站点封面按 8:5 得到 800×500。
  const width = 800;
  return { width, height: Math.max(1, Math.round(width / aspect)) };
}
