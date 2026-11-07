"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { getImageSources } from "@/lib/image-sources";

type AssetImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  src: string;
  fallbackSrc?: string;
  maximumWidth?: number;
};

/** 使用离线缩略图与浏览器选图能力，不触发运行时 Next 图片转码。 */
export function AssetImage({ src, fallbackSrc, maximumWidth = 800, sizes, alt = "", loading = "lazy", decoding = "async", onError, ...props }: AssetImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const current = failedSource === src && fallbackSrc ? fallbackSrc : src;
  const image = getImageSources(current, maximumWidth);
  const imageSizes = sizes || `${props.width || maximumWidth}px`;
  return <picture className="asset-picture">
    {image.avifSrcSet && <source type="image/avif" srcSet={image.avifSrcSet} sizes={imageSizes} />}
    {/* 已知本地素材由离线清单生成 srcSet；外部地址保持原有浏览器加载方式。 */}
    <img {...props} alt={alt} src={image.src} srcSet={image.srcSet} sizes={image.srcSet ? imageSizes : undefined} loading={loading} decoding={decoding} onError={(event) => {
      if (fallbackSrc && current !== fallbackSrc) setFailedSource(src);
      else onError?.(event);
    }} />
  </picture>;
}
