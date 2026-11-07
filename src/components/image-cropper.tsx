"use client";

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowCounterClockwise, Crop, SpinnerGap, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { getCropGeometry, getCropOutputSize, type CropOffset, type CropSize } from "@/lib/image-crop";
import "./image-cropper.css";

type ImageCropperProps = {
  source: string;
  label: string;
  aspect: number;
  onCancel: () => void;
  onRestoreFocus: () => void;
  onConfirm: (image: Blob) => Promise<boolean>;
};

export function ImageCropper({ source, label, aspect, onCancel, onRestoreFocus, onConfirm }: ImageCropperProps) {
  const zoomId = useId();
  const image = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const stageRef = useCallback((element: HTMLDivElement | null) => { stage.current = element; setStageElement(element); }, []);
  const drag = useRef<{ pointerId: number; x: number; y: number; offset: CropOffset } | null>(null);
  const mounted = useRef(true);
  const processing = useRef(false);
  const [natural, setNatural] = useState<CropSize | null>(null);
  const [viewport, setViewport] = useState<CropSize>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const output = getCropOutputSize(aspect);
  const geometry = natural && viewport.width > 0 && viewport.height > 0 ? getCropGeometry(natural, viewport, zoom, offset) : null;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    // Radix Portal 在挂载后才创建取景框，依赖实际 DOM 节点后再开始观测尺寸。
    const element = stageElement;
    if (!element) return;
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [stageElement]);

  function pan(next: CropOffset) {
    if (natural && viewport.width > 0 && viewport.height > 0) setOffset(getCropGeometry(natural, viewport, zoom, next).offset);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!geometry || exporting || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset: geometry.offset };
  }

  async function confirmCrop() {
    if (!geometry || !image.current || processing.current) return;
    processing.current = true;
    setExporting(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = output.width;
      canvas.height = output.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前浏览器无法裁剪图片，请更换浏览器后重试。");
      const crop = geometry.source;
      context.drawImage(image.current, crop.x, crop.y, crop.width, crop.height, 0, 0, output.width, output.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("图片处理失败，请重新选择图片。")), "image/webp", 0.9));
      // 释放导出画布的像素缓存；原文件的对象 URL 由选择器统一回收。
      canvas.width = 0;
      canvas.height = 0;
      if (mounted.current) await onConfirm(blob);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "裁剪失败，请重试。");
    } finally {
      processing.current = false;
      if (mounted.current) setExporting(false);
    }
  }

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="image-crop-overlay" />
      <Dialog.Content className="image-crop-dialog" onOpenAutoFocus={(event) => { event.preventDefault(); stage.current?.focus(); }} onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus(); }} onPointerDownOutside={(event) => event.preventDefault()}>
        <div className="image-crop-heading">
          <div><Dialog.Title className="image-crop-title"><Crop size={22} />裁剪{label}</Dialog.Title><Dialog.Description className="image-crop-description">拖动图片调整取景，使用滑块放大。确认后上传 {output.width} × {output.height} 像素图片。</Dialog.Description></div>
          <Button className="image-crop-close" variant="ghost" size="icon" aria-label="取消裁剪" onClick={onCancel}><X size={20} /></Button>
        </div>
        <div ref={stageRef} className="image-crop-stage" style={{ aspectRatio: aspect, maxWidth: `${52 * aspect}svh` }} tabIndex={0} role="group" aria-label="裁剪取景框，可拖动图片或使用方向键调整" aria-busy={!natural && !error}
          onPointerDown={startDrag}
          onPointerMove={(event) => { const active = drag.current; if (active && active.pointerId === event.pointerId) pan({ x: active.offset.x + event.clientX - active.x, y: active.offset.y + event.clientY - active.y }); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={(event) => { if (!geometry || exporting) return; const steps: Record<string, CropOffset> = { ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 } }; const step = steps[event.key]; if (step) { event.preventDefault(); pan({ x: geometry.offset.x + step.x, y: geometry.offset.y + step.y }); } }}>
          {/* 本地对象 URL 仅用于 Canvas 取景，避免 Next 图片优化器介入临时文件。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={image} src={source} alt="待裁剪图片" draggable={false} onLoad={(event) => { const { naturalWidth: width, naturalHeight: height } = event.currentTarget; if (!width || !height || width * height > 40_000_000 || Math.max(width, height) > 16384) { setError("图片分辨率过大或无效，请将图片缩小至 4000 万像素以内后重试。"); return; } setNatural({ width, height }); }} onError={() => setError("无法读取这张图片，请换一张 JPG、PNG、WebP 或 AVIF 图片。")} style={geometry ? { width: geometry.width, height: geometry.height, transform: `translate(-50%, -50%) translate(${geometry.offset.x}px, ${geometry.offset.y}px)` } : { visibility: "hidden" }} />
          {geometry && <span className="image-crop-guides" aria-hidden="true" />}
          {!natural && !error && <span className="image-crop-loading" role="status"><SpinnerGap size={22} className="spin" />正在读取图片…</span>}
        </div>
        <div className="image-crop-tools">
          <label htmlFor={zoomId}>缩放 <output>{Math.round(zoom * 100)}%</output></label>
          <input id={zoomId} type="range" min="1" max="3" step="0.01" value={zoom} disabled={!natural || exporting} onChange={(event) => { const nextZoom = Number(event.target.value); setZoom(nextZoom); if (natural && viewport.width > 0 && viewport.height > 0) setOffset(getCropGeometry(natural, viewport, nextZoom, offset).offset); }} />
          <Button variant="ghost" size="sm" disabled={!natural || exporting} onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><ArrowCounterClockwise size={16} />重置</Button>
        </div>
        {error && <p className="image-crop-error" role="alert">{error}</p>}
        <div className="image-crop-actions"><Button variant="secondary" onClick={onCancel}>取消</Button><Button disabled={!geometry || exporting} onClick={() => void confirmCrop()}>{exporting && <SpinnerGap size={17} className="spin" />}{exporting ? "正在处理并上传…" : "确认裁剪并上传"}</Button></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
