"use client";

import { ArrowRight, GlobeHemisphereWest, Mountains, Sparkle, X } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { AssetImage } from "@/components/asset-image";
import { SiteCard } from "@/components/site-card";
import { PortalAccess } from "@/components/portal-access";
import { AmbientScene } from "@/components/ambient-scene";
import { CursorScatter, useCursorScatter } from "@/components/effects/cursor-scatter";
import { usePortalDepth } from "@/components/use-portal-depth";
import "@/components/ambient-scene.css";
import "@/components/portal-depth.css";
import "@/components/bookshelf.css";
import type { PortalSettings, Site } from "@/lib/types";

export function Portal({ settings, sites, accessUnlocked = false, accessConfigured = false }: { settings: PortalSettings; sites: Site[]; accessUnlocked?: boolean; accessConfigured?: boolean }) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const [ambientPaused, setAmbientPaused] = useState(false);
  const page = useRef<HTMLElement>(null);
  usePortalDepth(page, settings.depthEnabled, settings.depthStrength, ambientPaused);
  const [locallyLocked, setLocallyLocked] = useState(false);
  const cursor = useCursorScatter(settings.pointerStyle, settings.pointerScatter);
  const closePrivate = useCallback(() => setLocallyLocked(true), []);
  const openPrivate = useCallback(() => setLocallyLocked(false), []);
  const unlocked = accessUnlocked && !locallyLocked;
  const aboutDialog = useRef<HTMLDialogElement>(null);
  // 首页直接展示有权查看的入口；隐藏与私密权限仍独立生效，顺序沿用后台配置。
  const publicSites = sites.filter((site) => site.visible && (!site.requiresPassword || unlocked)).toSorted((a, b) => a.sortOrder - b.sortOrder);
  const desktopRows = Math.ceil(publicSites.length / 4);

  return (
    <main ref={page} className="portal-page" id="top" data-screen-shelves={desktopRows === 1 || desktopRows === 2 ? desktopRows : undefined} data-depth-active={settings.depthEnabled} data-pointer-style={settings.pointerStyle} onClickCapture={cursor.scatter}>
      <a className="skip-link" href="#sites">跳到网站列表</a>
      {/* 装饰图层独立于内容流，较小的视口由浏览器选用较窄的图。 */}
      <div className="portal-depth-art" aria-hidden="true">
        <AssetImage className="portal-depth-sun" src="/images/ink/relief-sun.webp"
          width={1152} height={1109} maximumWidth={1152} sizes="(max-width: 542px) 320px, (max-width: 1491px) 59vw, 880px" loading="eager" />
        <AssetImage className="portal-depth-pine" src="/images/ink/relief-pine.webp"
          width={960} height={320} maximumWidth={960} sizes="(max-width: 510px) 47vw, (max-width: 720px) 240px, (max-width: 1500px) 34vw, 510px" loading="eager" />
        <AssetImage className="portal-depth-plum" src="/images/bookshelf/hero-plum.webp"
          width={337} height={200} sizes="(max-width: 700px) 105px, 12.1vw" loading="eager" />
      </div>
      <AmbientScene style={settings.atmosphereStyle} intensity={settings.atmosphereIntensity} paused={ambientPaused} />
      <CursorScatter bursts={cursor.bursts} onFinish={cursor.removeBurst} />

      <header className="portal-header portal-container">
        <a className="portal-brand" href="#top" aria-label={settings.name + "首页"}>
          {settings.logoUrl && failedLogoUrl !== settings.logoUrl ? (
            // 管理员可以配置任意合法图片地址，直接由浏览器加载并处理回退。
            <AssetImage className="brand-image" src={settings.logoUrl} alt="" width={40} height={34} maximumWidth={96} loading="eager" onError={() => setFailedLogoUrl(settings.logoUrl)} />
          ) : <Mountains className="brand-mark" size={40} weight="light" aria-hidden="true" />}
          <span>{settings.name}</span>
        </a>
        <nav className="portal-nav" aria-label="主导航">
          <button type="button" onClick={() => aboutDialog.current?.showModal()}>关于</button>
          {(settings.depthEnabled || settings.atmosphereStyle !== "none") &&
            <button className="ambience-toggle" type="button" aria-label={ambientPaused ? "继续背景动画" : "暂停背景动画"} title={ambientPaused ? "继续背景动画" : "暂停背景动画"} aria-pressed={ambientPaused} onClick={() => setAmbientPaused((value) => !value)}><Sparkle size={22} weight={ambientPaused ? "light" : "regular"} aria-hidden="true" /></button>}
          <PortalAccess unlocked={unlocked} configured={accessConfigured} onAccessLost={closePrivate} onUnlock={openPrivate} />
        </nav>
      </header>

      <div className="portal-main portal-container">
        <section className="hero-intro" aria-labelledby="portal-heading" aria-describedby="portal-subtitle" data-long={Array.from(settings.headline).length > 10}>
          <h1 id="portal-heading">{settings.headline}</h1>
          <p className="sr-only" id="portal-subtitle">{settings.subtitle}</p>
        </section>

        <section className="portal-sites" id="sites" aria-labelledby="sites-heading">
          <h2 id="sites-heading" className="sr-only">我的站点</h2>
          <p className="sr-only" role="status">共 {publicSites.length} 个站点</p>
          <div className="bookshelf-grid" data-count={publicSites.length}>
            {/* 独立渲染每本书，由样式按屏幕宽度分层。 */}
            {publicSites.map((site, index) => (
              <div className="bookshelf-slot" key={site.id} style={{ animationDelay: Math.min(index, 8) * 45 + "ms" }}>
                <SiteCard site={site} priority={index === 0} />
              </div>
            ))}
          </div>
          {publicSites.length === 0 && <div className="sites-empty"><GlobeHemisphereWest size={32} weight="light" aria-hidden="true" /><h3>留一页空白，待新的故事。</h3><p>站点发布后，就会出现在这里。</p></div>}
        </section>
      </div>

      <footer className="portal-footer portal-container">
        <p><span>{settings.name}</span><span className="footer-dot" aria-hidden="true">·</span>{settings.footer}</p>
        <a href="/admin">管理后台</a>
      </footer>

      <dialog
        className="portal-about"
        ref={aboutDialog}
        aria-labelledby="about-title"
        aria-describedby="about-description"
      >
        <div className="about-content">
          <button className="about-close" type="button" aria-label="关闭关于" onClick={() => aboutDialog.current?.close()}>
            <X size={23} weight="light" aria-hidden="true" />
          </button>
          <Mountains size={42} weight="light" aria-hidden="true" />
          <span className="about-eyebrow">{settings.name} · 一纸小记</span>
          <h2 id="about-title">{settings.aboutTitle || "每一个入口，都通往热爱。"}</h2>
          <p id="about-description">{settings.aboutText || "这里收藏着我用心创造的网站与作品。愿你在一次次抵达中，发现属于自己的灵感。"}</p>
          <button className="about-back" type="button" onClick={() => aboutDialog.current?.close()}>继续探索<ArrowRight size={19} aria-hidden="true" /></button>
        </div>
      </dialog>
    </main>
  );
}
