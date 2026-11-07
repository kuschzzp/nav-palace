"use client";

import { useId } from "react";
import { Check, Cursor } from "@phosphor-icons/react";
import { CursorScatter, useCursorScatter } from "@/components/effects/cursor-scatter";
import { pointerPresets, type PointerStyle } from "@/lib/pointer-presets";
import "./pointer-picker.css";

type PointerPickerProps = {
  value: PointerStyle;
  scatterEnabled: boolean;
  onChange: (value: PointerStyle) => void;
  onScatterChange: (enabled: boolean) => void;
  disabled: boolean;
};

export function PointerPicker({ value, scatterEnabled, onChange, onScatterChange, disabled }: PointerPickerProps) {
  const groupId = useId();
  const preview = useCursorScatter(value, scatterEnabled && !disabled);

  return <div className="pointer-picker">
    <fieldset className="pointer-options" disabled={disabled}>
      <legend className="sr-only">首页鼠标样式</legend>
      {pointerPresets.map((preset) => <label className="pointer-option" key={preset.value}>
        <input className="sr-only" type="radio" name={groupId} checked={value === preset.value} onChange={() => onChange(preset.value)} />
        <span className="pointer-option-art" aria-hidden="true">
          {"image" in preset ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preset.image} width={32} height={32} alt="" />
          ) : <Cursor size={24} weight="light" />}
        </span>
        <span className="pointer-option-copy"><strong>{preset.label}</strong><small>{preset.description}</small></span>
        {value === preset.value && <Check className="pointer-option-check" size={14} aria-hidden="true" />}
      </label>)}
    </fieldset>

    <label className="pointer-scatter-option">
      <input type="checkbox" checked={scatterEnabled && value !== "system"} disabled={disabled || value === "system"} onChange={(event) => onScatterChange(event.target.checked)} />
      <span>点击散落</span>
    </label>
    <div className="cursor-preview" data-pointer-style={value} onClickCapture={preview.scatter}>
      <span className="cursor-preview-copy"><strong>鼠标试用区</strong><small>移到按钮上看悬停样式，点一下试试散落</small></span>
      <button type="button" disabled={disabled}>试点一下</button>
      <CursorScatter bursts={preview.bursts} onFinish={preview.removeBurst} />
    </div>
    <p className="pointer-picker-hint">保存后应用到首页。系统开启「减少动态效果」时，点击散落自动关闭。</p>
  </div>;
}
