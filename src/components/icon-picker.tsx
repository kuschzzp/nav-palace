"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowsClockwise, Check, MagnifyingGlass } from "@phosphor-icons/react";
import { siteIconCatalog } from "@/lib/site-icons";
import { MediaPickerDialog } from "@/components/media-picker-dialog";
import { SiteIcon } from "@/components/site-icon";
import "./icon-picker.css";

export function IconPicker({ value, onChange, disabled = false }: { value: string; onChange: (name: string) => void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const search = query.trim().toLowerCase();
  // 选择框使用独立草稿，点击图标不会提前改动网站表单。
  const matches = siteIconCatalog.filter((icon) => `${icon.value} ${icon.label} ${icon.keywords}`.toLowerCase().includes(search));
  const selected = siteIconCatalog.find((icon) => icon.value === value);
  const pending = siteIconCatalog.find((icon) => icon.value === draft);

  function startSelection() {
    if (disabled) return;
    setDraft(value);
    setQuery("");
    setOpen(true);
  }

  function confirmSelection() {
    if (disabled || !pending) return;
    onChange(draft);
    setOpen(false);
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const grid = event.currentTarget;
    const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>("button"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const moves: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, ArrowUp: index - columns, ArrowDown: index + columns, Home: 0, End: buttons.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    buttons[Math.min(buttons.length - 1, Math.max(0, moves[event.key]))]?.focus();
  }

  return <>
    <fieldset className="field icon-picker-field" disabled={disabled}>
      <legend>网站图标</legend>
      <button ref={trigger} className="icon-selection-trigger" type="button" aria-label={`更换网站图标，当前：${selected?.label || "网站"}`} aria-haspopup="dialog" aria-expanded={open} onClick={startSelection}>
        <span className="icon-selection-preview"><SiteIcon name={value} size={25} aria-hidden="true" /></span>
        <span className="icon-selection-copy"><strong>{selected?.label || "网站"}</strong><small>当前图标</small></span>
        <span className="icon-selection-action">更换图标<ArrowsClockwise size={15} aria-hidden="true" /></span>
      </button>
    </fieldset>
    <MediaPickerDialog open={open} onOpenChange={setOpen} title="选择网站图标" description="选中喜欢的图标，再点击「确认选择」。取消不会改变原来的图标。" onConfirm={confirmSelection} confirmDisabled={disabled || !pending} busy={disabled} initialFocusRef={searchInput} returnFocusRef={trigger}>
      <div className="icon-picker-dialog-body field">
        <div className="icon-draft-preview">
          <span className="icon-draft-symbol"><SiteIcon name={draft} size={32} aria-hidden="true" /></span>
          <div><small>待确认图标</small><strong>{pending?.label || "网站"}</strong></div>
          <Check size={18} aria-hidden="true" />
        </div>
        <div className="icon-picker-search">
          <label className="sr-only" htmlFor={searchId}>搜索图标</label>
          <MagnifyingGlass size={17} aria-hidden="true" />
          <input ref={searchInput} id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索图标，例如：动漫、开发、咖啡…" autoComplete="off" aria-describedby={`${searchId}-status`} disabled={disabled} />
        </div>
        <div className="icon-picker-options" role="group" aria-label="选择网站图标" onKeyDown={moveFocus}>
          {matches.map((icon) => <button key={icon.value} type="button" title={icon.label} aria-label={icon.label} aria-pressed={draft === icon.value} disabled={disabled} onClick={() => setDraft(icon.value)}><SiteIcon name={icon.value} size={23} aria-hidden="true" />{draft === icon.value && <Check className="icon-selection-check" size={10} weight="bold" aria-hidden="true" />}</button>)}
        </div>
        <small id={`${searchId}-status`} role="status">{matches.length ? `待确认：${pending?.label || "网站"} · ${matches.length} 个可选图标` : "没有找到匹配的图标，换个关键词试试。"}</small>
      </div>
    </MediaPickerDialog>
  </>;
}
