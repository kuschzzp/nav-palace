"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AssetImage } from "@/components/asset-image";
import { ArrowLeft, ArrowRight, ArrowSquareOut, MapPin, Mountains, PaperPlaneTilt, Pause } from "@phosphor-icons/react";
import type { PortalSettings, Site } from "@/lib/types";

export function Departure({ site, settings }: { site: Site; settings: PortalSettings }) {
  const departureDelay = settings.departureDelaySeconds * 1000;
  const [remaining, setRemaining] = useState(settings.departureDelaySeconds);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"countdown" | "cancelled" | "leaving">("countdown");
  const [logoFailed, setLogoFailed] = useState(false);
  const navigation = useRef<number | null>(null);
  const countdown = useRef<number | null>(null);
  // 自动跳转与进度刷新分别计时，取消、立即前往和卸载时必须同时清理。
  const stop = useCallback(() => {
    if (navigation.current !== null) window.clearTimeout(navigation.current);
    if (countdown.current !== null) window.clearInterval(countdown.current);
    navigation.current = null;
    countdown.current = null;
  }, []);

  const goNow = useCallback(() => {
    stop();
    setRemaining(0);
    setProgress(1);
    setState("leaving");
    // 替换当前历史记录，避免访客按后退键时再次进入倒计时循环。
    window.location.replace(site.url);
  }, [site.url, stop]);

  useEffect(() => {
    if (state !== "countdown") return;
    // 按单调时钟的截止时间计算进度，避免定时器调度延迟逐次累积。
    const deadline = performance.now() + departureDelay;
    countdown.current = window.setInterval(() => {
      const milliseconds = Math.max(0, deadline - performance.now());
      setRemaining(Math.ceil(milliseconds / 1000));
      setProgress(Math.min(1, 1 - milliseconds / departureDelay));
    }, 100);
    navigation.current = window.setTimeout(goNow, departureDelay);
    return stop;
  }, [departureDelay, goNow, state, stop]);

  function cancel() {
    stop();
    setState("cancelled");
  }

  const statusLabel = state === "countdown" ? "秒后自动跳转" : state === "cancelled" ? "自动跳转已取消" : "正在打开目标网站…";
  const progressLabel = state === "countdown" ? `${remaining} ${statusLabel}` : statusLabel;

  return <main className={`departure-page departure-${state}`}>
    <div className="departure-backdrop" aria-hidden="true" />
    <header className="departure-header"><Link href="/" className="departure-brand" onNavigate={stop}>
      {settings.logoUrl && !logoFailed ? <AssetImage maximumWidth={96} loading="eager" src={settings.logoUrl} alt="" width={38} height={38} onError={() => setLogoFailed(true)} /> : <Mountains size={38} weight="light" aria-hidden="true" />}
      <span>{settings.name}</span>
    </Link><Link href="/" className="departure-home" onNavigate={stop}><ArrowLeft size={16} aria-hidden="true" />返回首页</Link></header>

    <section className="departure-panel" aria-labelledby="departure-title">
      <div className="departure-destination">
        <h1 id="departure-title">{site.name}</h1>
        <div className="departure-ornament" aria-hidden="true"><span /></div>
        <p className="departure-host"><ArrowSquareOut size={16} aria-hidden="true" /><span>{new URL(site.url).hostname}</span></p>
        {site.description && <p className="departure-description">{site.description}</p>}
      </div>

      <div className="departure-status" role="status" aria-atomic="true">
        <div className="departure-readout">
          {state === "countdown" ? <strong>{String(remaining).padStart(2, "0")}</strong> : state === "cancelled" ? <Pause weight="light" aria-hidden="true" /> : <PaperPlaneTilt weight="light" aria-hidden="true" />}
        </div>
        <p>{statusLabel}</p>
      </div>

      <div className="departure-progress" role="progressbar" aria-label="自动跳转进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-valuetext={progressLabel}>
        <Mountains className="departure-route-end" size={30} weight="light" aria-hidden="true" />
        <div className="departure-track" aria-hidden="true">
          <span className="departure-track-fill" style={{ transform: `scaleX(${progress})` }} />
          <PaperPlaneTilt className="departure-plane" size={32} weight="regular" style={{ left: `${progress * 100}%` }} />
        </div>
        <MapPin className="departure-route-end" size={28} weight="regular" aria-hidden="true" />
      </div>

      <div className="departure-actions">
        <button type="button" className="departure-primary" onClick={goNow} disabled={state === "leaving"}>立即前往<ArrowRight size={18} aria-hidden="true" /></button>
        <button type="button" className="departure-cancel" onClick={cancel} disabled={state !== "countdown"}><Pause size={16} aria-hidden="true" />{state === "cancelled" ? "已取消自动跳转" : "取消自动跳转"}</button>
      </div>
      <noscript><p className="departure-no-script">浏览器未启用 JavaScript，<a href={site.url} rel="noopener noreferrer">点击这里前往网站</a>。</p></noscript>
    </section>
    <footer className="departure-footer">每一个入口，都通往热爱。</footer>
  </main>;
}
