"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeSlash, LockKey, LockKeyOpen, SpinnerGap, X } from "@phosphor-icons/react";
import "./portal-access.css";

export function PortalAccess({ unlocked, configured, onAccessLost, onUnlock }: { unlocked: boolean; configured: boolean; onAccessLost: () => void; onUnlock: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!unlocked) return;
    const controller = new AbortController();
    // 页面长期停留或从后台返回时重新核验，过期/改密后及时收起私密入口。
    async function check() {
      if (document.hidden) return;
      try {
        const response = await fetch("/api/portal/access", { cache: "no-store", signal: controller.signal });
        if (response.ok && !(await response.json()).unlocked) { onAccessLost(); router.refresh(); }
      } catch { /* 离线时保留已查看页面；任何新跳转仍由服务端重新验证。 */ }
    }
    const interval = window.setInterval(check, 60000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, [unlocked, onAccessLost, router]);

  function reset() { setPassword(""); setRevealed(false); setError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/portal/access", {
        method: unlocked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: unlocked ? undefined : JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "操作失败，请稍后再试。");
      if (unlocked) onAccessLost(); else onUnlock();
      reset(); dialog.current?.close(); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "连接失败，请稍后再试。"); }
    finally { pending.current = false; setBusy(false); }
  }

  return <>
    <button className="portal-lock" type="button" aria-label={unlocked ? "管理私密访问" : "解锁私密站点"} title={unlocked ? "私密站点已解锁" : "解锁私密站点"} onClick={() => { reset(); dialog.current?.showModal(); if (!unlocked) passwordInput.current?.focus(); }}>
      {unlocked ? <LockKeyOpen size={22} weight="light" aria-hidden="true" /> : <LockKey size={22} weight="light" aria-hidden="true" />}
      {unlocked && <span className="lock-unlocked-dot" aria-hidden="true" />}
    </button>
    <dialog className="portal-access" ref={dialog} aria-labelledby="access-title" aria-describedby="access-description" onClose={reset} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="access-content">
        <button className="access-close" type="button" aria-label="关闭私密访问" disabled={busy} onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button>
        <div className="access-emblem" aria-hidden="true">{unlocked ? <LockKeyOpen size={29} weight="light" /> : <LockKey size={29} weight="light" />}</div>
        <p className="access-eyebrow">一枚私印 · 一方天地</p>
        <h2 id="access-title">{unlocked ? "属于你的入口，已展开。" : "有些收藏，只想与你分享。"}</h2>
        <p id="access-description">{unlocked ? "这个浏览器已获得私密访问权限。你也可以现在收起这些入口。" : configured ? "输入访问密码后显示全部站点，当前浏览器将在 7 天内记住这次解锁。" : "站长还没有设置访问密码。请先在管理后台的站点设置中完成配置。"}</p>
        {(configured || unlocked) && <form onSubmit={submit}>
          {!unlocked && <div className="access-field"><label htmlFor="portal-access-input">访问密码</label><div className="access-password"><input id="portal-access-input" ref={passwordInput} type={revealed ? "text" : "password"} name="portal-access-password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} maxLength={128} required disabled={busy} aria-invalid={!!error} aria-describedby={error ? "access-error" : undefined} placeholder="输入这片小天地的密码" /><button type="button" aria-label={revealed ? "隐藏访问密码" : "显示访问密码"} aria-pressed={revealed} disabled={busy} onClick={() => setRevealed((value) => !value)}>{revealed ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></div></div>}
          {error && <p className="access-error" id="access-error" role="alert">{error}</p>}
          <button className="access-submit" type="submit" disabled={busy}>{busy ? <><SpinnerGap className="access-spinner" size={18} aria-hidden="true" />{unlocked ? "正在锁定…" : "正在解锁…"}</> : <>{unlocked ? "重新锁定私密站点" : "解锁全部站点"}<ArrowRight size={18} aria-hidden="true" /></>}</button>
        </form>}
        {!configured && !unlocked && <a className="access-submit" href="/admin">前往管理后台<ArrowRight size={18} aria-hidden="true" /></a>}
        <small className="access-note">{unlocked ? "重新锁定后，再次查看需要输入密码。" : "访问密码仅用于展示私密入口，不会登录目标网站。"}</small>
      </div>
    </dialog>
  </>;
}
