"use client";

import { ArrowRight, GlobeHemisphereWest, Mountains, Sparkle, X } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { AssetImage } from "@/components/asset-image";
import { SiteCard } from "@/components/site-card";
import { PortalAccess } from "@/components/portal-access";
import { AmbientScene } from "@/components/ambient-scene";
import { CursorScatter, useCursorScatter } from "@/components/effects/cursor-scatter";
import "@/components/ambient-scene.css";
import type { PortalSettings, Site } from "@/lib/types";

export function Portal({ settings, sites, accessUnlocked = false, accessConfigured = false }: { settings: PortalSettings; sites: Site[]; accessUnlocked?: boolean; accessConfigured?: boolean }) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const [ambientPaused, setAmbientPaused] = useState(false);
  const [locallyLocked, setLocallyLocked] = useState(false);
  const cursor = useCursorScatter(settings.pointerStyle, settings.pointerScatter);
  const closePrivate = useCallback(() => setLocallyLocked(true), []);
  const openPrivate = useCallback(() => setLocallyLocked(false), []);
  const unlocked = accessUnlocked && !locallyLocked;
  const aboutDialog = useRef<HTMLDialogElement>(null);
  // 首页直接展示有权查看的入口；隐藏与私密权限仍独立生效，顺序沿用后台配置。
  const publicSites = sites.filter((site) => site.visible && (!site.requiresPassword || unlocked)).toSorted((a, b) => a.sortOrder - b.sortOrder);

  // 短题签按标点分成两列；无标点时均分，长标题与手机改为横排，避免依赖高度自动断句。
  const headlineChars = Array.from(settings.headline);
  const splitAt = headlineChars.findIndex((char) => /[，,；;]/u.test(char));
  const headlineBreak = splitAt > 0 && splitAt < headlineChars.length - 1 ? splitAt + 1 : Math.ceil(headlineChars.length / 2);
  const headlineLines = headlineChars.length > 5 && headlineChars.length <= 10
    ? [headlineChars.slice(0, headlineBreak).join(""), headlineChars.slice(headlineBreak).join("")]
    : [settings.headline];
  const columns = publicSites.length <= 3 ? Math.max(1, publicSites.length) : publicSites.length <= 6 && publicSites.length !== 4 ? 3 : 4;

  return (
    <main className="portal-page" id="top" data-pointer-style={settings.pointerStyle} onClickCapture={cursor.scatter}>
      <a className="skip-link" href="#sites">跳到网站列表</a>
      {/* 独立生成的纸纹、朱砂与松枝仅做背景，所有入口文字和布局仍由真实数据生成。 */}
      <div className="portal-backdrop" aria-hidden="true" />
      <div className="portal-corner" aria-hidden="true" />
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
          <button className="ambience-toggle" type="button" aria-label={ambientPaused ? "继续背景动画" : "暂停背景动画"} title={ambientPaused ? "继续背景动画" : "暂停背景动画"} aria-pressed={ambientPaused} onClick={() => setAmbientPaused((value) => !value)}><Sparkle size={22} weight={ambientPaused ? "light" : "regular"} aria-hidden="true" /></button>
          <PortalAccess unlocked={unlocked} configured={accessConfigured} onAccessLost={closePrivate} onUnlock={openPrivate} />
        </nav>
      </header>

      <div className="portal-main portal-container">
        <section className="hero-intro" aria-labelledby="portal-heading" data-long={Array.from(settings.headline).length > 10}>
          <h1 id="portal-heading">{headlineLines.map((line, index) => <span key={index}>{line}</span>)}</h1>
          <p className="hero-subtitle">{settings.subtitle}</p>
        </section>

        <section className="portal-sites" id="sites" aria-labelledby="sites-heading">
          <h2 id="sites-heading" className="sr-only">我的站点</h2>
          <p className="sr-only" role="status">共 {publicSites.length} 个站点</p>
          <div className="site-grid" id="site-grid" data-count={publicSites.length} data-columns={columns}>
            {/* 每个入口都是独立组件，数量变化只改变列数和行数，不依赖整张固定海报。 */}
            {publicSites.map((site, index) => <div className="portal-card-enter" key={site.id} style={{ animationDelay: Math.min(index, 8) * 45 + "ms" }}><SiteCard site={site} index={index} columns={columns} /></div>)}
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
