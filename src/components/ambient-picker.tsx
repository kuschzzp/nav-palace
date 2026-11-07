"use client";

import { Check, Minus } from "@phosphor-icons/react";
import { useId, type CSSProperties } from "react";
import { AmbientSymbol } from "@/components/ambient-symbol";
import { ambientIntensityPresets, ambientPresets, type AmbientIntensity, type AmbientStyle } from "@/lib/ambient-presets";
import "./ambient-scene.css";
import "./ambient-picker.css";

/** 后台预览仅在悬停或键盘聚焦时播放，只有正在查看的方案播放。 */
export function AmbientPicker({ value, onChange, intensity, onIntensityChange, disabled = false }: { value: AmbientStyle; onChange: (value: AmbientStyle) => void; intensity: AmbientIntensity; onIntensityChange: (value: AmbientIntensity) => void; disabled?: boolean }) {
  const hintId = useId();
  return <div className="ambient-picker-field">
    <div className="ambient-picker" role="group" aria-label="首页页面氛围" aria-describedby={hintId}>
      {ambientPresets.map(({ value: style, label, description, accent }) => <button className="ambient-choice" key={style} type="button" aria-pressed={value === style} onClick={() => onChange(style)} disabled={disabled} style={{ "--ambient-accent": accent } as CSSProperties}>
        <span className="ambient-choice-art" data-ambient-effect={style} aria-hidden="true">
          {style === "none" ? <Minus size={22} weight="light" /> : [0, 1, 2].map((index) => <span className="ambient-choice-particle" key={index}><AmbientSymbol style={style} /></span>)}
        </span>
        <span className="ambient-choice-copy"><strong>{label}</strong><small>{description}</small></span>
        {value === style && <Check className="ambient-choice-check" size={15} aria-hidden="true" />}
      </button>)}
    </div>
    {value !== "none" && <fieldset className="ambient-intensity" disabled={disabled} aria-describedby={`${hintId}-intensity`}>
      <legend>漂浮强度</legend>
      <div className="ambient-intensity-options">
        {ambientIntensityPresets.map((preset) => <label className="ambient-intensity-choice" key={preset.value}>
          <input type="radio" name={`${hintId}-intensity`} value={preset.value} checked={intensity === preset.value} onChange={() => onIntensityChange(preset.value)} />
          <span><strong>{preset.label}</strong><span>{preset.description}</span><small>电脑 {preset.desktop} · 手机 {preset.mobile}</small></span>
        </label>)}
      </div>
      <p className="ambient-intensity-hint" id={`${hintId}-intensity`}>调整飘落物数量，保存后应用到首页。切换氛围会保留这项设置。</p>
    </fieldset>}
    <p className="ambient-picker-hint" id={hintId}>悬停或用键盘聚焦可预览，选择后保存站点设置。系统开启“减少动态效果”时停止播放。</p>
  </div>;
}
