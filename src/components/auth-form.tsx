"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Mountains, SpinnerGap } from "@phosphor-icons/react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";

export function AuthForm({ mode }: { mode: "login" | "setup" }) {
  const router = useRouter();
  const setup = mode === "setup";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      // 首次初始化先创建管理员；普通登录跳过该步骤，两种入口随后共用登录流程。
      if (setup) {
        const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || "初始化失败，请稍后再试。");
        }
      }
      const result = await authClient.signIn.email({ email: String(data.email).trim().toLowerCase(), password: String(data.password) });
      if (result.error) throw new Error(setup ? "账号已创建，请前往登录页登录。" : "邮箱或密码不正确，请检查后重试。");
      // 进入后台时刷新服务端会话视图，历史记录中不保留登录表单。
      router.replace("/admin");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "连接失败，请稍后再试。");
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-visual" aria-hidden="true"><div className="auth-brand"><Mountains size={37} weight="light" /><span>NAV PALACE</span></div><div className="auth-visual-copy"><p>A PERSONAL COLLECTION OF WORLDS</p><h2>让热爱，<br />有处可达。</h2><span>藏一方天地，记万千热爱。</span></div></section>
    <section className="auth-content"><Link href="/" className="auth-back"><ArrowLeft size={17} /> 回到首页</Link><div className="auth-form-wrap"><p className="admin-eyebrow">{setup ? "THE FIRST IMPRESSION" : "RETURN TO YOUR COLLECTION"}</p><h1>{setup ? "为你的天地落款" : "好久不见"}</h1><p className="auth-intro">{setup ? "创建管理员账号，让这里成为你的网站之家。" : "登录后台，打理属于你的每一处入口。"}</p>
      <form onSubmit={submit} className="admin-form">
        {setup && <label className="field">你的称呼<input name="name" autoComplete="name" placeholder="怎么称呼你？" required maxLength={60} /></label>}
        <label className="field">邮箱<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} /></label>
        <PasswordInput label="密码" name="password" autoComplete={setup ? "new-password" : "current-password"} placeholder={setup ? "至少 12 个字符" : "输入你的密码"} required minLength={setup ? 12 : 1} maxLength={128} />
        {setup && <PasswordInput label="初始化密钥" name="token" autoComplete="off" placeholder="填写 SETUP_TOKEN" required maxLength={256} aria-describedby="setup-token-help">
          <small id="setup-token-help">在部署环境或本地 .env.local 中查看 SETUP_TOKEN，仅首次创建账号时使用。</small>
        </PasswordInput>}
        {error && <p className="form-error" role="alert">{error} {setup && <Link href="/admin/login">前往登录</Link>}</p>}
        <Button type="submit" disabled={busy}>{busy ? <SpinnerGap className="spin" size={18} /> : <ArrowRight size={18} />}{busy ? "请稍候…" : setup ? "创建账号，开始管理" : "登录管理后台"}</Button>
      </form><p className="auth-footnote">{setup ? "每个站点独立部署，数据保存在你自己的服务器。" : "此入口仅供站点管理员使用。"}</p>
    </div><p className="auth-bottom">NAV PALACE · 每一个入口，都通往热爱</p></section>
  </main>;
}
