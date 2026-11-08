"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, LockKey } from "@phosphor-icons/react";
import { SiteIcon } from "@/components/site-icon";
import { AssetImage } from "@/components/asset-image";
import type { Site } from "@/lib/types";
import "./site-card.css";

/** 点击插画翻转整张卡片，点击下方的文字或箭头访问站点。 */
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
    >
      <div className="site-card-rotor">
        {/* 隐藏面仍参与 3D 绘制，但不能接收点击、Tab 焦点或读屏访问。 */}
        <div className="site-card-face site-card-front" aria-hidden={flipped} inert={flipped}>
          <button
            ref={frontControl}
            className="site-card-cover"
            type="button"
            title="查看站点介绍"
            aria-label={`翻转${site.name}，查看介绍`}
            aria-controls={detailsId}
            aria-expanded={flipped}
            onClick={() => turn(true)}
          >
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
          </button>
          <a className="site-card-front-copy" href={href} target={target} rel={rel} aria-label={visitLabel}>
            <h3 title={site.name}><span>{site.name}</span>{site.requiresPassword && <LockKey className="site-card-private" size={15} aria-label="私密站点" />}</h3>
            {site.description && <p>{site.description}</p>}
            <span className="site-card-action"><ArrowRight size={22} aria-hidden="true" /></span>
          </a>
        </div>

        <div
          className="site-card-face site-card-back"
          id={detailsId}
          aria-hidden={!flipped}
          inert={!flipped}
          onClick={(event) => {
            if (event.target instanceof Element && !event.target.closest("a")) turn(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              turn(false);
            }
          }}
        >
          {/* 卡面承接点击，键盘和读屏通过原生按钮翻回封面。 */}
          <button ref={backControl} className="sr-only" type="button" aria-label={`翻回${site.name}封面`} />
          <div className="site-card-back-heading">
            <SiteIcon name={site.icon} size={25} aria-hidden="true" />
            <h3 title={site.name}>{site.name}</h3>
          </div>
          {/* 长介绍在背面内部滚动，不撑高卡片，也不裁掉访问入口。 */}
          <div className="site-card-back-description" tabIndex={0} role="region" aria-label={`${site.name}介绍`}>{site.description || "一个值得发现的入口，准备好就出发吧。"}</div>
          <a className="site-card-back-visit" href={href} target={target} rel={rel} aria-label={visitLabel}>前往站点<ArrowRight size={17} aria-hidden="true" /></a>
        </div>
      </div>
    </article>
  );
}
