"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AssetImage } from "@/components/asset-image";
import { Check, Copy, ImageSquare, Mountains, SpinnerGap, UploadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ImageCropper } from "@/components/image-cropper";
import { MediaPickerDialog } from "@/components/media-picker-dialog";
import type { ImagePreset } from "@/lib/media-presets";
import "./image-picker.css";

type ImagePickerProps = {
  label: string;
  value: string;
  presets: ImagePreset[];
  onChange: (url: string) => void;
  onFeedback: (message: string, error?: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  contain?: boolean;
};

// 前端检查用于即时反馈；真实文件类型、解码结果和大小仍由服务端验证。
const maximumFileSize = 8 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export function ImagePicker({ label, value, presets, onChange, onFeedback, onBusyChange, disabled = false, contain = false }: ImagePickerProps) {
  const id = useId();
  const selectionButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const focusFrame = useRef<number | null>(null);
  const mounted = useRef(true);
  const address = useRef<HTMLSpanElement>(null);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const busyCallback = useRef(onBusyChange);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [uploading, setUploading] = useState(false);
  const [cropSource, setCropSource] = useState<{ file: File; url: string } | null>(null);
  const [failedPreview, setFailedPreview] = useState<string | null>(null);

  const selectedPreset = presets.find((preset) => preset.image === value);
  const displayedValue = contain ? value : draft;
  const draftPreset = presets.find((preset) => preset.image === displayedValue);

  function openPicker() {
    setDraft(value);
    setFailedPreview(null);
    setOpen(true);
  }

  function confirmSelection() {
    if (disabled || busy.current || !draft) return;
    onChange(draft);
    setOpen(false);
  }

  // 关闭编辑器或切换页面时取消请求，不再回写已卸载表单的状态。
  useEffect(() => { busyCallback.current = onBusyChange; }, [onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      if (busy.current) busyCallback.current?.(false);
    };
  }, []);
  useEffect(() => () => { if (cropSource) URL.revokeObjectURL(cropSource.url); }, [cropSource]);

  function setBusy(next: boolean) {
    busy.current = next;
    busyCallback.current?.(next);
  }

  function selectFile(file: File) {
    if (disabled || busy.current) return;
    if (file.size > maximumFileSize) { onFeedback("图片不能超过 8 MB，请压缩后再上传。", true); return; }
    if (!allowedTypes.has(file.type)) { onFeedback("请选择 JPG、PNG、WebP 或 AVIF 图片。", true); return; }
    setBusy(true);
    // Logo 保留原始透明区域与比例，封面在上传前固定按 8:5 比例裁剪。
    if (contain) void upload(file);
    else {
      try { setCropSource({ file, url: URL.createObjectURL(file) }); }
      catch { setBusy(false); onFeedback("无法读取本地图片，请重新选择。", true); }
    }
  }

  async function upload(file: File): Promise<boolean> {
    if (request.current) return false;
    const controller = new AbortController();
    request.current = controller;
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch("/api/admin/uploads", { method: "POST", body, signal: controller.signal });
      // 反向代理的错误页可能不是 JSON，解析失败时仍展示可读的上传错误。
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : response.status === 413 ? "图片超过服务器上传限制，请尝试更小的图片。" : "上传失败，请稍后重试。");
      if (typeof result.url !== "string" || !result.url.startsWith("/uploads/")) throw new Error("上传结果无效，请重试。");
      if (!controller.signal.aborted) {
        setFailedPreview(null);
        // 上传只保存图片文件，关联到网站或站点设置仍需用户点击保存。
        if (contain) onChange(result.url);
        else setDraft(result.url);
        onFeedback(contain ? "图片已上传，保存后生效。" : "图片已上传，请确认选择后再保存网站。");
        return true;
      }
    } catch (cause) {
      if (!controller.signal.aborted) onFeedback(cause instanceof Error ? cause.message : "上传失败，请检查网络后重试。", true);
    } finally {
      if (!controller.signal.aborted) {
        setUploading(false);
        // 裁剪上传失败时保留取景，允许重试；关闭裁剪框后才解除表单忙碌状态。
        if (contain) setBusy(false);
      }
      if (request.current === controller) request.current = null;
    }
    return false;
  }

  async function copyAddress() {
    if (!displayedValue) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(displayedValue);
      else {
        // HTTP 预览站点可能没有 Clipboard API；使用已展示文字作为复制源。
        const selection = window.getSelection();
        if (!selection || !address.current) throw new Error("无法复制");
        const range = document.createRange();
        range.selectNodeContents(address.current);
        selection.removeAllRanges();
        selection.addRange(range);
        const copied = document.execCommand("copy");
        selection.removeAllRanges();
        if (!copied) throw new Error("无法复制");
      }
      onFeedback("图片地址已复制。");
    } catch { onFeedback("复制失败，请选中下方图片地址手动复制。", true); }
  }

  function closeCrop() {
    // 取消裁剪也可中止正在发送的上传，避免网络异常时一直锁住编辑表单。
    request.current?.abort();
    setUploading(false);
    setCropSource(null);
    setBusy(false);
  }

  function restoreUploadFocus() {
    if (!mounted.current) return;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    // 等待关闭状态提交、fieldset 解除禁用后，再把键盘焦点还给上传入口。
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      // 裁剪只更新选择框草稿，成功与取消均回到仍然打开的素材选择框。
      const upload = uploadButton.current;
      const button = upload?.getClientRects().length ? upload : selectionButton.current;
      if (mounted.current && button?.isConnected && !button.matches(":disabled")) button.focus({ preventScroll: true });
    });
  }

  function preview(imageUrl: string) {
    return <div className="image-current-preview">
      {imageUrl && failedPreview !== imageUrl ? <AssetImage maximumWidth={contain ? 480 : 240} sizes={contain ? "200px" : "128px"} src={imageUrl} alt={`${label}预览`} width={800} height={500} onError={() => setFailedPreview(imageUrl)} /> : <div className="image-preview-placeholder">{!imageUrl && contain ? <Mountains size={44} weight="light" /> : <span>{imageUrl ? "图片暂时无法预览" : "尚未选择图片"}</span>}{imageUrl && <Button variant="ghost" size="sm" onClick={() => setFailedPreview(null)}>重新加载</Button>}</div>}
      {uploading && <span className="image-upload-status" role="status"><SpinnerGap size={18} className="spin" />正在上传…</span>}
    </div>;
  }

  function options() {
    return <fieldset className={`field image-picker ${contain ? "image-picker-logo" : "media-cover-options"}`} disabled={disabled || uploading || Boolean(cropSource)}>
      <legend className="sr-only">{label}素材</legend>
      <div className="image-selection-options">
        <div className="cover-picker" role="group" aria-label={`${label}默认素材`}>
          {presets.map((preset) => <button type="button" key={preset.image || "default"} aria-label={preset.label} title={preset.label} aria-pressed={displayedValue === preset.image} onClick={() => {
            setFailedPreview(null);
            if (contain) onChange(preset.image);
            else setDraft(preset.image);
          }}>
            {preset.image ? <AssetImage maximumWidth={480} sizes={contain ? "96px" : "180px"} src={preset.image} alt={preset.label} width={200} height={125} /> : <span className="default-logo-option"><Mountains size={28} weight="light" />默认标志</span>}
            {displayedValue === preset.image && <span className="image-preset-check"><Check size={15} /></span>}
          </button>)}
        </div>
        <div className="image-upload-controls">
          {/* 清空输入，允许失败后重新选择同一个文件。上传只更新待确认草稿。 */}
          <input ref={input} id={`${id}-file`} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" tabIndex={-1} aria-label={`上传${label}`} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) selectFile(file); }} />
          <Button ref={uploadButton} variant="secondary" size="sm" onClick={() => input.current?.click()}>{uploading ? <SpinnerGap size={17} className="spin" /> : <UploadSimple size={17} />}{uploading ? "正在上传…" : "上传图片"}</Button>
          <small>JPG / PNG / WebP / AVIF，最大 8 MB</small>
        </div>
        <div className="image-address" role="group" aria-label={`${label}地址，只读`}>
          <div><span className="image-address-label">图片地址 · 只读</span><span ref={address} className="image-address-value">{displayedValue || "使用默认标志，无图片地址"}</span></div>
          {displayedValue && <Button variant="ghost" size="sm" aria-label={`复制${label}地址`} onClick={() => void copyAddress()}><Copy size={16} />复制</Button>}
        </div>
      </div>
    </fieldset>;
  }

  return <>
    <fieldset className={`field image-picker ${contain ? "image-picker-logo" : "image-picker-cover"}`} disabled={disabled || uploading || Boolean(cropSource)}>
      <legend>{label}</legend>
      <div className="image-picker-content">
        <div className={contain ? "image-logo-summary" : "image-selection-summary"}>
          {preview(value)}
          {!contain && <><div className="image-selection-copy"><strong>{selectedPreset?.label || (value ? "自定义封面" : "尚未选择封面")}</strong><small>{selectedPreset ? "当前封面 · 水墨插画" : "当前封面 · 8:5 裁剪"}</small></div><Button ref={selectionButton} className="image-selection-toggle" variant="secondary" size="sm" aria-haspopup="dialog" onClick={openPicker}><ImageSquare size={15} aria-hidden="true" />更换封面</Button></>}
        </div>
        {contain && options()}
      </div>
    </fieldset>
    {!contain && <MediaPickerDialog open={open} onOpenChange={setOpen} title="选择封面图片" description="先选择或上传封面，确认后才会更新网站表单中的预览。" onConfirm={confirmSelection} confirmDisabled={!draft || disabled} busy={uploading || Boolean(cropSource)} returnFocusRef={selectionButton}>
      <div className="media-cover-current">{preview(draft)}<div><strong>{draftPreset?.label || "自定义封面"}</strong><small>{draftPreset ? "待确认的封面 · 水墨插画" : "待确认的封面 · 8:5 裁剪"}</small></div></div>
      {options()}
      {cropSource && <ImageCropper key={cropSource.url} source={cropSource.url} label={label} aspect={8 / 5} onCancel={closeCrop} onRestoreFocus={restoreUploadFocus} onConfirm={async (blob) => {
        const extension = blob.type === "image/png" ? "png" : "webp";
        const file = new File([blob], `${cropSource.file.name.replace(/\.[^.]+$/, "")}-cropped.${extension}`, { type: blob.type });
        if (file.size > maximumFileSize) { onFeedback("裁剪后的图片仍超过 8 MB，请更换较小图片。", true); return false; }
        const uploaded = await upload(file);
        if (uploaded) closeCrop();
        return uploaded;
      }} />}
    </MediaPickerDialog>}
  </>;
}
