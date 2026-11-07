"use client";

import { useEffect } from "react";

/**
 * 仅增强后台显式标记的主操作：共享事件委托与一个按需 RAF，不改变原按钮外观。
 * 光源沿圆角矩形边界投射；CSS 负责双瓣高光、边缘遮罩及玻璃内部反射。
 */
const buttonSelector = 'button[data-specular-action="true"]';

const dynamicProperties = ["--specular-angle", "--specular-x", "--specular-y"];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const angularDistance = (from: number, to: number) => ((to - from + 540) % 360 + 360) % 360 - 180;

type Registration = { specular: string | null; position: string | null };
type Light = {
  element: HTMLElement;
  rect: DOMRect;
  radius: number;
  measure: boolean;
  angle: number;
  x: number;
  y: number;
};

// 圆角区域使用最近的圆弧点，直线区域使用最近的边，避免把圆角按钮当作普通矩形。
function boundaryPoint(x: number, y: number, width: number, height: number, radius: number) {
  const halfX = width / 2;
  const halfY = height / 2;
  const innerX = halfX - radius;
  const innerY = halfY - radius;
  const centerX = clamp(x, -innerX, innerX);
  const centerY = clamp(y, -innerY, innerY);
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.hypot(dx, dy);
  if (distance > 0.001) return { x: centerX + dx / distance * radius, y: centerY + dy / distance * radius };
  return halfX - Math.abs(x) < halfY - Math.abs(y)
    ? { x: Math.sign(x || 1) * halfX, y }
    : { x, y: Math.sign(y || -1) * halfY };
}

export function SpecularButtons() {
  useEffect(() => {
    const registrations = new Map<HTMLElement, Registration>();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)");
    const pointer = { x: 0, y: 0 };
    let active: Light | null = null;
    let focused: HTMLElement | null = null;
    let hovering = false;
    let frameId = 0;
    let lastFrame = 0;
    let destroyed = false;

    function enabled() { return !document.hidden && !reducedMotion.matches && !coarsePointer.matches; }
    function available(element: HTMLElement) {
      return element.isConnected && !element.matches(":disabled, [aria-disabled='true']") && !element.closest("[hidden], [inert], [aria-hidden='true']") && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
    }
    function find(target: EventTarget | null) {
      const element = target instanceof Element ? target.closest<HTMLElement>(buttonSelector) : null;
      return element && available(element) ? element : null;
    }

    function restoreAttribute(element: HTMLElement, name: string, value: string | null) {
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }
    function release(element: HTMLElement) {
      const registration = registrations.get(element);
      if (!registration) return;
      restoreAttribute(element, "data-specular", registration.specular);
      restoreAttribute(element, "data-specular-position", registration.position);
      element.removeAttribute("data-specular-active");
      element.removeAttribute("data-specular-pressed");
      dynamicProperties.forEach((property) => element.style.removeProperty(property));
      registrations.delete(element);
    }
    function registerTree(root: ParentNode) {
      const candidates: HTMLElement[] = [];
      if (root instanceof HTMLElement && root.matches(buttonSelector)) candidates.push(root);
      candidates.push(...root.querySelectorAll<HTMLElement>(buttonSelector));
      // 先读位置再写属性，保持原有 absolute / fixed 布局，不覆盖翻面与关闭按钮的定位。
      const pending = candidates.filter((element) => !registrations.has(element)).map((element) => ({ element, relative: getComputedStyle(element).position === "static" }));
      for (const { element, relative } of pending) {
        registrations.set(element, { specular: element.getAttribute("data-specular"), position: element.getAttribute("data-specular-position") });
        element.setAttribute("data-specular", "");
        if (relative) element.setAttribute("data-specular-position", "relative");
      }
    }

    function stop() {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = 0;
      if (active) {
        active.element.removeAttribute("data-specular-active");
        active.element.removeAttribute("data-specular-pressed");
        dynamicProperties.forEach((property) => active?.element.style.removeProperty(property));
        resizeObserver.unobserve(active.element);
      }
      active = null;
    }
    function measure(light: Light) {
      light.rect = light.element.getBoundingClientRect();
      light.radius = Math.min(parseFloat(getComputedStyle(light.element).borderTopLeftRadius) || 0, light.rect.width / 2, light.rect.height / 2);
      light.measure = false;
    }
    function start(element: HTMLElement, mode: "pointer" | "focus") {
      if (!registrations.has(element)) registerTree(element);
      if (active?.element !== element) {
        stop();
        active = { element, rect: element.getBoundingClientRect(), radius: 0, measure: true, angle: -45, x: 18, y: 14 };
        resizeObserver.observe(element);
      }
      hovering = mode === "pointer";
      element.setAttribute("data-specular-active", mode);
      if (enabled()) wake();
    }
    function wake() {
      if (!frameId && !destroyed && enabled() && active) frameId = requestAnimationFrame(frame);
    }
    function frame(now: number) {
      frameId = 0;
      const light = active;
      if (!light || !enabled() || !available(light.element)) { stop(); return; }
      if (light.measure) measure(light);
      const { rect } = light;
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) { stop(); return; }
      let targetAngle = -45;
      let targetX = 18;
      let targetY = 14;
      if (hovering) {
        const x = pointer.x - rect.left - rect.width / 2;
        const y = pointer.y - rect.top - rect.height / 2;
        const point = boundaryPoint(x, y, rect.width, rect.height, light.radius);
        const edgeAngle = Math.atan2(point.y, point.x) * 180 / Math.PI + 90;
        // 按钮中心的小幅摆动回归静态光源，穿过中心时不会突然跳转到对面的边。
        const depth = clamp(Math.min(rect.width / 2 - Math.abs(x), rect.height / 2 - Math.abs(y)) / Math.max(1, rect.height * .4), 0, 1);
        const blend = depth * depth * (3 - 2 * depth);
        const restAngle = -45 - x / Math.max(1, rect.width) * 16;
        targetAngle = edgeAngle + angularDistance(edgeAngle, restAngle) * blend;
        targetX = clamp((point.x * .85 / rect.width + .5) * 100, 0, 100);
        targetY = clamp((point.y * .85 / rect.height + .5) * 100, 0, 100);
      }
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .05) : 1 / 60;
      lastFrame = now;
      const progress = 1 - Math.exp(-dt * 12);
      const distance = angularDistance(light.angle, targetAngle);
      light.angle += distance * progress;
      light.x += (targetX - light.x) * progress;
      light.y += (targetY - light.y) * progress;
      light.element.style.setProperty("--specular-angle", `${light.angle.toFixed(2)}deg`);
      light.element.style.setProperty("--specular-x", `${light.x.toFixed(2)}%`);
      light.element.style.setProperty("--specular-y", `${light.y.toFixed(2)}%`);
      // 只有当前按钮仍在追赶光源时再画一帧；停止鼠标后没有常驻动画循环。
      if (Math.abs(distance) > .08 || Math.abs(targetX - light.x) > .08 || Math.abs(targetY - light.y) > .08) wake();
      else lastFrame = 0;
    }

    function onPointerMove(event: PointerEvent) {
      if (!enabled() || event.pointerType === "touch") return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      const element = find(event.target);
      if (element) { start(element, "pointer"); wake(); }
      else if (focused && available(focused) && focused.matches(":focus-visible")) start(focused, "focus");
      else stop();
    }
    function onPointerDown(event: PointerEvent) {
      if (!enabled() || event.pointerType === "touch") return;
      onPointerMove(event);
      if (active?.element === find(event.target)) active?.element.setAttribute("data-specular-pressed", "");
    }
    function onPointerEnd() { active?.element.removeAttribute("data-specular-pressed"); }
    function onPointerLeave() {
      onPointerEnd();
      if (focused && available(focused) && focused.matches(":focus-visible")) start(focused, "focus");
      else stop();
    }
    function onFocusIn(event: FocusEvent) {
      focused = find(event.target);
      if (focused?.matches(":focus-visible")) start(focused, "focus");
    }
    function onFocusOut() { focused = null; if (!hovering) stop(); }
    function onGeometryChange() { if (active) { active.measure = true; wake(); } }
    function onPreferenceChange() {
      stop();
      if (!document.hidden && focused && available(focused) && focused.matches(":focus-visible")) start(focused, "focus");
    }

    const resizeObserver = new ResizeObserver(onGeometryChange);
    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "childList") {
          record.addedNodes.forEach((node) => { if (node instanceof Element) registerTree(node); });
          record.removedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            for (const element of registrations.keys()) if (node === element || node.contains(element)) {
              if (element.isConnected) continue;
              if (active?.element === element) stop();
              release(element);
            }
          });
        } else if (record.target instanceof HTMLElement && record.target.matches(buttonSelector)) registerTree(record.target);
      }
      if (active && !available(active.element)) stop();
      else onGeometryChange();
    });

    registerTree(document.body);
    mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "hidden", "inert", "aria-hidden", "open", "class", "role", "data-slot"] });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerup", onPointerEnd, { passive: true });
    document.addEventListener("pointercancel", onPointerEnd, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onPreferenceChange);
    document.addEventListener("scroll", onGeometryChange, { capture: true, passive: true });
    window.addEventListener("resize", onGeometryChange, { passive: true });
    reducedMotion.addEventListener("change", onPreferenceChange);
    coarsePointer.addEventListener("change", onPreferenceChange);

    return () => {
      destroyed = true;
      mutationObserver.disconnect();
      stop();
      resizeObserver.disconnect();
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerEnd);
      document.removeEventListener("pointercancel", onPointerEnd);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onPreferenceChange);
      document.removeEventListener("scroll", onGeometryChange, true);
      window.removeEventListener("resize", onGeometryChange);
      reducedMotion.removeEventListener("change", onPreferenceChange);
      coarsePointer.removeEventListener("change", onPreferenceChange);
      for (const element of registrations.keys()) release(element);
    };
  }, []);

  return null;
}
