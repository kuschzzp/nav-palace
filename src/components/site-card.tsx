"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, ArrowRight, ArrowsClockwise, LockKey } from "@phosphor-icons/react";
import { SiteIcon } from "@/components/site-icon";
import { AssetImage } from "@/components/asset-image";
import type { Site } from "@/lib/types";
import "./site-card.css";

/** 导航与翻面是两个独立操作：卡面直接访问网站，角落按钮查看介绍。 */
export function SiteCard({ site, index = 0, columns = 4 }: { site: Site; index?: number; columns?: number }) {
  const [flipped, setFlipped] = useState(false);
  const card = useRef<HTMLElement>(null);
  const frontControl = useRef<HTMLButtonElement>(null);
  const backControl = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  const detailsId = useId();
  const fallback = site.icon === "bulb" || site.icon === "code"
    ? "/images/ink/tools.webp"
    : site.icon === "camera" ? "/images/ink/landscape.webp" : "/images/ink/writing.webp";
  const href = `/go/${encodeURIComponent(site.id)}`;
  // 所有站点统一在新标签页访问，保留当前导航入口。
  const target = "_blank";
  const rel = "noopener noreferrer";
  const visitLabel = `访问${site.name}（在新标签页打开）`;

  function turn(next: boolean) {
    // 先移走旧面的焦点，再隐藏该面，避免让 aria-hidden 暂时包住焦点元素。
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && card.current?.contains(focused)) focused.blur();
    moveFocus.current = true;
    setFlipped(next);
  }

  useLayoutEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    // 翻面后原按钮所在面立即变为 inert，将焦点交给当前可见面的返回/翻转按钮。
    // 不等待动画结束，因此系统关闭动画或快速连续操作时也能正常使用键盘。
    (flipped ? backControl : frontControl).current?.focus({ preventScroll: true });
  }, [flipped]);

  return (
    <article
      ref={card}
      className="site-card"
      data-flipped={flipped}
      data-site-position={index + 1}
      aria-label={site.name}
      onKeyDown={(event) => {
        if (event.key === "Escape" && flipped) {
          event.preventDefault();
          event.stopPropagation();
          turn(false);
        }
      }}
    >
      <div className="site-card-rotor">
        {/* 隐藏面仍参与 3D 绘制，但不能接收点击、Tab 焦点或读屏访问。 */}
        <div className="site-card-face site-card-front" aria-hidden={flipped} inert={flipped}>
          <a className="site-card-visit" href={href} target={target} rel={rel} aria-label={visitLabel}>
            <span className="site-card-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {/* 墨绘素材与可配置文字分离，上传封面仍由浏览器正常加载。 */}
            <AssetImage
              className="site-card-art"
              src={site.image || fallback}
              fallbackSrc={fallback}
              data-ink-art={(site.image || fallback).startsWith("/images/ink/")}
              alt=""
              width={720}
              height={440}
              sizes={`(max-width: 480px) 100vw, (max-width: 700px) 50vw, (max-width: 1050px) 40vw, ${columns === 1 ? "480px" : `${Math.ceil(82 / columns)}vw`}`}
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
              decoding="async"
            />
            <div className="site-card-front-copy">
              <h3 title={site.name}><span>{site.name}</span>{site.requiresPassword && <LockKey className="site-card-private" size={15} aria-label="私密站点" />}</h3>
              {site.description && <p>{site.description}</p>}
              <span className="site-card-action"><span className="sr-only">前往站点</span><ArrowRight size={22} aria-hidden="true" /></span>
            </div>
          </a>
          <button
            ref={frontControl}
            className="site-card-turn"
            type="button"
            title="查看站点介绍"
            aria-label={`翻转${site.name}，查看介绍`}
            aria-controls={detailsId}
            aria-expanded={flipped}
            onClick={() => turn(true)}
          ><ArrowsClockwise size={18} aria-hidden="true" /></button>
        </div>

        <div className="site-card-face site-card-back" id={detailsId} aria-hidden={!flipped} inert={!flipped}>
          <div className="site-card-back-heading">
            <SiteIcon name={site.icon} size={25} aria-hidden="true" />
            <h3 title={site.name}>{site.name}</h3>
          </div>
          <button
            ref={backControl}
            className="site-card-turn site-card-return"
            type="button"
            title="返回封面"
            aria-label={`翻回${site.name}封面`}
            onClick={() => turn(false)}
          ><ArrowCounterClockwise size={18} aria-hidden="true" /></button>
          {/* 长介绍在背面内部滚动，不撑高卡片，也不裁掉访问入口。 */}
          <div className="site-card-back-description" tabIndex={0} role="region" aria-label={`${site.name}介绍`}>{site.description || "一个值得发现的入口，准备好就出发吧。"}</div>
          <a className="site-card-back-visit" href={href} target={target} rel={rel} aria-label={visitLabel}>前往站点<ArrowRight size={17} aria-hidden="true" /></a>
        </div>
      </div>
    </article>
  );
}
