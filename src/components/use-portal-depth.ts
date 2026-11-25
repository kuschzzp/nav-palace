"use client";

import { useEffect, type RefObject } from "react";

/** 只在鼠标移动时按需绘制，不让整个首页随指针反复渲染。 */
export function usePortalDepth(root: RefObject<HTMLElement | null>, enabled: boolean, strength: number, paused: boolean) {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reset = () => {
      element.style.setProperty("--depth-x", "0");
      element.style.setProperty("--depth-y", "0");
    };
    if (!enabled) { reset(); return; }
    // 暂停时保留当前构图，继续后从这一位置平滑跟随。
    if (paused) return;

    const media = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 701px) and (prefers-reduced-motion: no-preference)");
    let x = Number(element.style.getPropertyValue("--depth-x")) || 0;
    let y = Number(element.style.getPropertyValue("--depth-y")) || 0;
    let targetX = x, targetY = y, frame = 0, previousTime = 0;
    const writePosition = () => {
      element.style.setProperty("--depth-x", x.toFixed(4));
      element.style.setProperty("--depth-y", y.toFixed(4));
    };
    const paint = (time: number) => {
      frame = 0;
      if (document.hidden || !media.matches) return;
      const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
      previousTime = time;
      const easing = 1 - Math.exp(-elapsed / 125);
      x += (targetX - x) * easing;
      y += (targetY - y) * easing;
      const settled = Math.abs(targetX - x) + Math.abs(targetY - y) < .002;
      if (settled) { x = targetX; y = targetY; }
      writePosition();
      if (!settled) frame = requestAnimationFrame(paint);
    };
    const schedule = () => {
      if (!frame && media.matches && !document.hidden) {
        previousTime = 0;
        frame = requestAnimationFrame(paint);
      }
    };
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType !== "mouse" || document.hidden) return;
      // 浮层打开时不继续驱动背后的画面，正文和按钮本身始终不位移。
      if (document.querySelector("dialog[open], [role='dialog'][data-state='open']")) return;
      const amplitude = strength / 100;
      targetX = Math.max(-1, Math.min(1, event.clientX / window.innerWidth * 2 - 1)) * amplitude;
      targetY = Math.max(-1, Math.min(1, event.clientY / window.innerHeight * 2 - 1)) * amplitude;
      schedule();
    };
    const leave = () => { targetX = 0; targetY = 0; schedule(); };
    const updateMedia = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      x = 0; y = 0; targetX = 0; targetY = 0;
      reset();
    };
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else schedule();
    };
    if (!media.matches) reset();
    element.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerleave", leave, { passive: true });
    window.addEventListener("blur", leave);
    window.addEventListener("resize", updateMedia, { passive: true });
    media.addEventListener("change", updateMedia);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      window.removeEventListener("resize", updateMedia);
      media.removeEventListener("change", updateMedia);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [root, enabled, strength, paused]);
}
