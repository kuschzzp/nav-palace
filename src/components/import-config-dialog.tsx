"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { FileArrowUp, FileText, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ImportSummary } from "@/lib/config-transfer";
import "./import-config-dialog.css";

export function ImportConfigDialog({ open, onOpenChange, onImported, notify }: { open: boolean; onOpenChange: (open: boolean) => void; onImported: () => Promise<void>; notify: (message: string, error?: boolean) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<{ name: string; config: unknown; summary: ImportSummary } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function changeOpen(next: boolean) {
    if (busy) return;
    onOpenChange(next);
    if (!next) { setCandidate(null); setError(""); }
  }
  async function send(config: unknown, preview: boolean): Promise<ImportSummary> {
    const response = await fetch("/api/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config, preview }) });
    const result = await response.json();
    if (response.status === 401) { window.location.reload(); throw new Error("登录已过期，请重新登录。"); }
    if (!response.ok) throw new Error(result.error || "导入失败，请检查配置文件。");
    return result;
  }
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError(""); setCandidate(null); setBusy(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("配置文件不能超过 2 MiB。");
      let config: unknown;
      try { config = JSON.parse(await file.text()); } catch { throw new Error("文件不是有效的 JSON 配置。"); }
      const summary = await send(config, true);
      setCandidate({ name: file.name, config, summary });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "读取配置失败。"); }
    finally { setBusy(false); }
  }
  async function confirmImport() {
    if (!candidate || busy) return;
    setBusy(true); setError("");
    try {
      // 只在用户看过摘要并确认后写入；服务器会再次校验并以事务整体替换。
      await send(candidate.config, false);
      await onImported();
      setCandidate(null); onOpenChange(false);
      notify("配置已导入，封面与背景已恢复为内置图片。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导入失败。"); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={changeOpen}><DialogContent
    className="ui-dialog-content import-dialog"
    onCloseAutoFocus={(event) => { event.preventDefault(); document.getElementById("import-config-trigger")?.focus(); }}
    onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
    onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
  >
    <DialogTitle className="dialog-title">导入网站配置</DialogTitle>
    <DialogDescription className="dialog-description">选择由 Nav Palace 导出的 JSON 文件，先检查内容，再确认导入。</DialogDescription>
    <input ref={fileInput} className="sr-only import-file-input" type="file" accept=".json,application/json" aria-label="选择配置文件" onChange={chooseFile} disabled={busy} />
    <div className="import-file-card"><FileText size={26} weight="light" aria-hidden="true" /><div><strong>{candidate ? candidate.name : "选择 JSON 配置文件"}</strong><span>支持新旧版导出 · 最多 1000 个网站 · 2 MiB</span></div><Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()} disabled={busy}><FileArrowUp size={17} />{candidate ? "重新选择" : "选择文件"}</Button></div>
    {candidate && <div className="import-preview"><h2>即将导入</h2><dl><div><dt>网站总数</dt><dd>{candidate.summary.siteCount}</dd></div><div><dt>公开入口</dt><dd>{candidate.summary.publicCount}</dd></div><div><dt>私密入口</dt><dd>{candidate.summary.privateCount}</dd></div></dl>{candidate.summary.categories.length > 0 && <p className="import-categories">分类：{candidate.summary.categories.join("、")}</p>}<ul>{candidate.summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => changeOpen(false)}>取消</Button><Button type="button" onClick={confirmImport} disabled={busy || !candidate}>{busy && <SpinnerGap className="spin" size={17} />}{busy ? "处理中…" : "确认替换并导入"}</Button></div>
  </DialogContent></Dialog>;
}
