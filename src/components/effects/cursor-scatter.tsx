"use client";

import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { PointerStyle } from "@/lib/pointer-presets";
import "./cursor-effects.css";

type Burst = {
  id: number;
  x: number;
  y: number;
  style: Exclude<PointerStyle, "system">;
};

// 每组碎片有固定的扩散方向，避免点击时为每个粒子计算随机动画。
const fragments = [
  [-34, -24, 11, -140],
  [-17, -39, 8, 180],
  [8, -43, 12, 140],
  [34, -28, 8, 230],
  [42, -5, 11, 170],
  [18, 14, 7, 260],
  [-22, 16, 7, -205],
] as const;

export function useCursorScatter(style: PointerStyle, enabled: boolean) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const sequence = useRef(0);

  function scatter(event: MouseEvent<HTMLElement>) {
    if (!enabled || style === "system" || event.button !== 0 || event.detail === 0) return;
    const pointerType = (event.nativeEvent as Partial<PointerEvent>).pointerType;
    if (pointerType ? pointerType !== "mouse" : !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!(event.target instanceof Element) || event.target.closest("input, textarea, select, [contenteditable], :disabled, dialog")) return;
    if (window.getSelection()?.isCollapsed === false) return;

    // 只记录已完成的点击，不接管默认操作。限制同屏批次，避免连点累积。
    const burst = { id: ++sequence.current, x: event.clientX, y: event.clientY, style };
    setBursts((current) => [...current.slice(-5), burst]);
  }

  function removeBurst(id: number) {
    setBursts((current) => current.filter((burst) => burst.id !== id));
  }

  return { scatter, bursts, removeBurst };
}

export function CursorScatter({ bursts, onFinish }: { bursts: Burst[]; onFinish: (id: number) => void }) {
  if (bursts.length === 0) return null;

  return <div className="cursor-scatter" aria-hidden="true">
    {bursts.map(({ id, x, y, style }) => <span
      key={id}
      className="cursor-burst"
      data-cursor-burst={style}
      style={{ left: x, top: y }}
      onAnimationEnd={(event) => { if (event.target === event.currentTarget) onFinish(id); }}
    >
      {fragments.map(([dx, dy, size, spin], index) => <span
        key={index}
        className="cursor-fragment"
        style={{
          "--cursor-fragment-x": `${dx}px`,
          "--cursor-fragment-y": `${dy}px`,
          "--cursor-fragment-size": `${size}px`,
          "--cursor-fragment-spin": `${spin}deg`,
        } as CSSProperties}
      />)}
    </span>)}
  </div>;
}
