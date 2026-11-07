"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AssetImage } from "@/components/asset-image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowSquareOut, ArrowUp, Check, CheckCircle, DownloadSimple, Eye, EyeSlash, GearSix, GlobeHemisphereWest, LockKey, MagnifyingGlass, Mountains, PencilSimple, Plus, SignOut, SpinnerGap, Trash, UploadSimple, UserCircle, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { ImagePicker } from "@/components/image-picker";
import { coverPresets } from "@/lib/media-presets";
import { IconPicker } from "@/components/icon-picker";
import { SiteIcon } from "@/components/site-icon";
import { AdminSettingsPanel, type AdminSettingsSection } from "@/components/admin-settings-panel";
import { ImportConfigDialog } from "@/components/import-config-dialog";
import { CategoryBadge, CategoryFilters } from "@/components/category-filters";
import { categoryKey } from "@/lib/categories";
import type { AdminData, PortalData, PortalSettings, Site } from "@/lib/types";

const covers = coverPresets;
const newSite: Omit<Site, "id"> = { name: "", url: "", description: "", image: covers[0].image, icon: "globe", category: "", sortOrder: 0, visible: true, requiresPassword: false };

// 统一处理后台 JSON 请求；会话失效时重新走服务端登录检查，避免继续操作旧数据。
async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (response.status === 401) { window.location.reload(); throw new Error("登录已过期，请重新登录。"); }
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "操作失败，请稍后再试。");
  return result;
}

function Switch({ checked, onChange, label, description, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return <div className="switch-field"><div><span>{label}</span>{description && <small>{description}</small>}</div><button type="button" className="ui-switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} disabled={disabled}><span /></button></div>;
}

function SiteEditor({ site, onSave, busy, error, notify, accessConfigured, onBusyChange }: { site: Site | null; onSave: (data: Omit<Site, "id">) => void; busy: boolean; error: string; notify: (message: string, error?: boolean) => void; accessConfigured: boolean; onBusyChange: (busy: boolean) => void }) {
  const [uploading, setUploading] = useState(false);
  // 编辑草稿与列表数据分离，只有保存成功才刷新列表；弹窗通过 key 切换不同网站的草稿。
  const [draft, setDraft] = useState<Omit<Site, "id">>(() => site ? {
    name: site.name, url: site.url, description: site.description,
    image: site.image, icon: site.icon, category: site.category,
    sortOrder: site.sortOrder, visible: site.visible, requiresPassword: site.requiresPassword,
  } : { ...newSite });
  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  // 图片地址在上传完成后才写入草稿，上传期间不能提交旧地址。
  function submit(event: FormEvent) { event.preventDefault(); if (!busy && !uploading) onSave(draft); }
  return <form className="admin-form" onSubmit={submit}>
    <div className="form-columns"><label className="field"><span>网站名称 <span className="required" aria-hidden="true">*</span></span><input value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="为这个入口起个名字" required maxLength={80} /></label><label className="field">分类<input value={draft.category} onChange={(event) => update("category", event.target.value)} placeholder="可选，例如：我的作品" maxLength={40} /></label></div>
    <label className="field"><span>网站地址 <span className="required" aria-hidden="true">*</span></span><input type="url" value={draft.url} onChange={(event) => update("url", event.target.value)} placeholder="https://example.com" required maxLength={2048} /></label>
    <label className="field">一句话介绍<textarea value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="让访客知道，这里有什么值得发现。" rows={2} maxLength={300} /></label>
    <IconPicker value={draft.icon} onChange={(icon) => update("icon", icon)} disabled={busy} />
    <ImagePicker label="封面图片" value={draft.image} presets={covers} onChange={(image) => update("image", image)} onFeedback={notify} onBusyChange={(value) => { setUploading(value); onBusyChange(value); }} disabled={busy} />
    <Switch checked={draft.visible} onChange={(value) => update("visible", value)} label="在首页展示" description="关闭后保留配置，访客不会看到这个网站。" disabled={busy} />
    <Switch checked={draft.requiresPassword} onChange={(value) => update("requiresPassword", value)} label="需要访问密码" description="解锁后才显示名称与地址；关闭首页展示后，即使解锁也不会出现。" disabled={busy} />
    {draft.requiresPassword && !accessConfigured && <p className="private-access-hint"><LockKey size={16} aria-hidden="true" />尚未设置访问密码，这个网站会保持锁定。请在「站点设置」中设置密码。</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><Button data-specular-action="true" type="submit" disabled={busy || uploading}>{busy ? <SpinnerGap className="spin" size={17} /> : <Check size={17} />}{busy ? "保存中…" : "保存网站"}</Button></div>
  </form>;
}

// 两处个人信息共用同一张本地默认头像，浏览器可复用缓存，无需外部头像服务。
function AdminAvatar({ compact = false }: { compact?: boolean }) {
  const size = compact ? 28 : 52;
  return <AssetImage className={`admin-avatar${compact ? " admin-avatar-compact" : ""}`} src="/images/ink/avatar.webp" alt="" width={size} height={size} maximumWidth={128} />;
}

function AccountPanel({ user, notify }: { user: { name: string; email: string }; notify: (message: string, error?: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [passwordFieldVersion, setPasswordFieldVersion] = useState(0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("newPassword") !== data.get("confirmation")) { notify("两次输入的新密码不一致。", true); return; }
    setBusy(true);
    try {
      // 修改密码后撤销其他会话，当前设备保留登录状态。
      const result = await authClient.changePassword({ currentPassword: String(data.get("currentPassword")), newPassword: String(data.get("newPassword")), revokeOtherSessions: true });
      if (result.error) throw new Error("修改失败，请检查当前密码后重试。");
      setPasswordFieldVersion((version) => version + 1);
      notify("密码已更新，其他设备的会话已退出。");
    } catch (cause) { notify(cause instanceof Error ? cause.message : "修改失败，请稍后再试。", true); }
    finally { setBusy(false); }
  }
  return <div className="account-panel">
    <section className="account-identity"><AdminAvatar /><div><h2>{user.name}</h2><p>{user.email}</p></div><span className="state-tag">管理员</span></section>
    <form className="admin-form" onSubmit={submit}>
      <h2>修改密码</h2>
      <PasswordInput key={`current-${passwordFieldVersion}`} label="当前密码" name="currentPassword" autoComplete="current-password" required maxLength={128} />
      <PasswordInput key={`new-${passwordFieldVersion}`} label="新密码" name="newPassword" autoComplete="new-password" minLength={12} maxLength={128} placeholder="至少 12 个字符" required />
      <PasswordInput key={`confirm-${passwordFieldVersion}`} label="确认新密码" name="confirmation" autoComplete="new-password" minLength={12} maxLength={128} required />
      <Button data-specular-action="true" type="submit" disabled={busy}><LockKey size={17} />{busy ? "更新中…" : "更新密码"}</Button>
    </form>
  </div>;
}

export function AdminDashboard({ initialData, user }: { initialData: AdminData; user: { name: string; email: string } }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 导航保存在 URL 中，刷新和分享后台地址时仍停留在当前分区。
  const tabParam = searchParams.get("tab");
  const tab = tabParam === "settings" || tabParam === "account" ? tabParam : "sites";
  const sectionParam = searchParams.get("section");
  const settingsSection: AdminSettingsSection = sectionParam === "visual" || sectionParam === "effects" || sectionParam === "pointer" || sectionParam === "security" ? sectionParam : "content";
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [editorUploading, setEditorUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState<Site | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const [noticePaused, setNoticePaused] = useState(false);
  // 按地址记录加载失败，换用另一个 Logo 后允许重新加载。
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

  // 鼠标悬停或键盘聚焦时暂停关闭；解除暂停后重新给出完整的阅读时间。
  useEffect(() => {
    if (!notice || noticePaused) return;
    const timeout = window.setTimeout(() => setNotice(null), notice.error ? 6000 : 3500);
    return () => window.clearTimeout(timeout);
  }, [notice, noticePaused]);

  const sites = data.sites.toSorted((a, b) => a.sortOrder - b.sortOrder);
  const publicVisible = sites.filter((site) => site.visible && !site.requiresPassword).length;
  const privateVisible = sites.filter((site) => site.visible && site.requiresPassword).length;
  const effectiveCategory = selectedCategory !== null && sites.some((site) => categoryKey(site.category) === selectedCategory) ? selectedCategory : null;
  const hasFilters = !!query.trim() || effectiveCategory !== null;
  const filtered = sites.filter((site) => (effectiveCategory === null || categoryKey(site.category) === effectiveCategory) && `${site.name} ${site.url} ${site.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  function navigate(nextTab: "sites" | "settings" | "account", nextSection = settingsSection) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    params.set("section", nextSection);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }
  function notify(message: string, error = false) { setNoticePaused(false); setNotice({ message, error }); }
  function edit(site: Site | null) { setEditing(site); setEditorError(""); setEditorUploading(false); setEditorOpen(true); }
  async function refresh() { const result = await request<AdminData>("/api/admin/data", "GET"); setData(result); }
  async function saveSite(draft: Omit<Site, "id">) {
    setBusy(true); setEditorError("");
    try {
      await request(editing ? `/api/admin/sites/${editing.id}` : "/api/admin/sites", editing ? "PATCH" : "POST", { ...draft, sortOrder: editing?.sortOrder ?? sites.length });
      await refresh(); setEditorOpen(false); notify(editing ? "网站已更新，首页也已同步。" : "新的网站入口已添加。");
    } catch (cause) { setEditorError(cause instanceof Error ? cause.message : "保存失败。"); }
    finally { setBusy(false); }
  }
  async function toggleSite(site: Site) {
    setBusy(true);
    try { await request(`/api/admin/sites/${site.id}`, "PATCH", { visible: !site.visible }); await refresh(); notify(site.visible ? "网站已隐藏，配置仍然保留。" : "网站已在首页展示。"); }
    catch (cause) { notify(cause instanceof Error ? cause.message : "更新失败。", true); }
    finally { setBusy(false); }
  }
  async function move(site: Site, direction: -1 | 1) {
    if (busy || hasFilters) return;
    const index = sites.findIndex((item) => item.id === site.id);
    const target = index + direction;
    if (target < 0 || target >= sites.length) return;
    // 只允许在完整列表中排序，避免搜索或分类筛选使移动位置产生歧义。
    const reordered = [...sites];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setBusy(true);
    try { await request("/api/admin/sites/reorder", "PUT", { ids: reordered.map((item) => item.id) }); await refresh(); notify("展示顺序已更新。"); }
    catch (cause) { notify(cause instanceof Error ? cause.message : "排序失败。", true); }
    finally { setBusy(false); }
  }
  async function removeSite() {
    if (!deleting) return;
    setDeleteError("");
    setBusy(true);
    try { await request(`/api/admin/sites/${deleting.id}`, "DELETE"); await refresh(); setDeleting(null); notify("网站入口已删除。"); }
    catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "删除失败。"); }
    finally { setBusy(false); }
  }
  async function saveSettings(settings: PortalSettings): Promise<boolean> {
    setBusy(true);
    try { const result = await request<PortalSettings>("/api/admin/settings", "PUT", settings); setData((current) => ({ ...current, settings: result })); router.refresh(); notify("站点设置已保存，刷新首页即可看到。"); return true; }
    catch (cause) { notify(cause instanceof Error ? cause.message : "保存失败。", true); return false; }
    finally { setBusy(false); }
  }
  async function setAccessPassword(password: string): Promise<boolean> {
    setBusy(true);
    try {
      await request("/api/admin/access", "PUT", { password });
      setData((current) => ({ ...current, accessConfigured: true }));
      notify("访问密码已更新，先前的解锁记录已失效。");
      return true;
    } catch (cause) { notify(cause instanceof Error ? cause.message : "更新访问密码失败。", true); return false; }
    finally { setBusy(false); }
  }
  async function imported() {
    await refresh();
    setQuery("");
    setSelectedCategory(null);
    // 导入是整体替换操作，显式重建设置草稿，避免旧表单覆盖刚导入的配置。
    setSettingsRevision((current) => current + 1);
  }
  async function exportData() {
    setBusy(true);
    try {
      const result = await request<PortalData>("/api/admin/export", "GET");
      // 此导出只包含站点配置，不含登录凭据、数据库和上传图片文件。
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `nav-palace-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); notify("网站配置已导出。完整数据库备份请使用 npm run db:backup。");
    } catch (cause) { notify(cause instanceof Error ? cause.message : "导出失败。", true); }
    finally { setBusy(false); }
  }
  async function signOut() { setBusy(true); try { const result = await authClient.signOut(); if (result.error) throw new Error(); router.replace("/admin/login"); router.refresh(); } catch { setBusy(false); notify("退出失败，请稍后重试。", true); } }

  return <div className="admin-shell">
    <aside className="admin-sidebar"><Link href="/" className="admin-brand">{data.settings.logoUrl && failedLogoUrl !== data.settings.logoUrl ? <AssetImage maximumWidth={96} loading="eager" src={data.settings.logoUrl} alt="" width={32} height={32} onError={() => setFailedLogoUrl(data.settings.logoUrl)} /> : <Mountains size={32} weight="light" />}<span>NAV PALACE<small>藏一方天地，记万千热爱。</small></span></Link><div className="sidebar-label">书局工作台</div><nav className="admin-menu" aria-label="后台导航"><button type="button" aria-current={tab === "sites" ? "page" : undefined} disabled={busy} onClick={() => navigate("sites")}><GlobeHemisphereWest size={21} />网站管理<span>{sites.length}</span></button><button type="button" aria-current={tab === "settings" ? "page" : undefined} disabled={busy} onClick={() => navigate("settings")}><GearSix size={21} />站点设置</button><button type="button" aria-current={tab === "account" ? "page" : undefined} disabled={busy} onClick={() => navigate("account")}><UserCircle size={21} />我的账号</button></nav><div className="sidebar-bottom"><Link href="/" target="_blank" rel="noopener noreferrer"><ArrowSquareOut size={19} />查看首页</Link><button id="sign-out-trigger" type="button" onClick={() => setSignOutOpen(true)} disabled={busy}><SignOut size={19} />退出登录</button><p>你的每一份创造，都值得被看见。</p></div></aside>
    <main className="admin-main"><header className="admin-topbar"><span>管理后台 <span className="breadcrumb">/ {tab === "sites" ? "网站管理" : tab === "settings" ? "站点设置" : "我的账号"}</span></span><span className="user-chip"><AdminAvatar compact /><span className="user-chip-name">{user.name}</span></span></header><div className="admin-workspace">
      <div className="admin-page-heading"><div><p className="admin-eyebrow">{tab === "sites" ? "THE COLLECTION" : tab === "settings" ? "THE IMPRESSION" : "THE KEEPER"}</p><h1>{tab === "sites" ? "整理你的山海书简" : tab === "settings" ? "让这里，更像你" : "你好，" + user.name}</h1><p>{tab === "sites" ? `${sites.length} 个网站入口，${publicVisible} 个公开、${privateVisible} 个需密码。` : tab === "settings" ? "从一行题字、一幅墨绘开始，留下属于你的落款。" : "管理你的登录凭据，让热爱安心生长。"}</p></div>{tab === "sites" && <Button data-specular-action="true" onClick={() => edit(null)} disabled={busy}><Plus size={18} />添加网站</Button>}</div>
      {tab === "sites" && <section className="collection-panel" aria-label="网站列表"><div className="collection-toolbar"><div className="admin-search" role="search"><MagnifyingGlass size={19} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索网站名称、地址或分类" aria-label="搜索网站" />{query && <button type="button" className="admin-search-clear" onClick={() => setQuery("")} aria-label="清除搜索"><X size={15} aria-hidden="true" /></button>}</div><div className="collection-toolbar-actions"><Button id="import-config-trigger" variant="ghost" size="sm" onClick={() => setImportOpen(true)} disabled={busy}><UploadSimple size={17} />导入配置</Button><Button variant="ghost" size="sm" onClick={exportData} disabled={busy}><DownloadSimple size={17} />导出配置</Button></div></div><CategoryFilters sites={sites} value={effectiveCategory} onChange={setSelectedCategory} className="collection-category-filters" /><div className="collection-table"><div className="collection-table-heading"><span>网站</span><span>分类</span><span>展示状态</span><span>操作</span></div>{filtered.length ? filtered.map((site) => {
        const index = sites.findIndex((item) => item.id === site.id);
        return <article className="collection-row" key={site.id}><div className="collection-site"><AssetImage src={site.image || covers[0].image} fallbackSrc={covers[0].image} maximumWidth={240} sizes="84px" alt="" width={84} height={57} /><div><h2><SiteIcon name={site.icon} size={16} />{site.name}{site.requiresPassword && <span className={`private-site-tag ${data.accessConfigured ? "" : "needs-password"}`} title={data.accessConfigured ? "访客解锁后可见" : "尚未设置访问密码，访客暂时无法解锁"}><LockKey size={11} aria-hidden="true" />{data.accessConfigured ? "私密" : "待设密码"}</span>}</h2><a href={site.url} target="_blank" rel="noopener noreferrer">{site.url.replace(/^https?:\/\//, "")}<ArrowSquareOut size={12} /></a><CategoryBadge category={site.category} className="collection-mobile-category" /></div></div><CategoryBadge category={site.category} className="collection-category" /><button type="button" className={`state-tag ${site.visible ? "" : "is-hidden"}`} onClick={() => toggleSite(site)} disabled={busy} aria-label={`${site.visible ? "隐藏" : "展示"}${site.name}`}>{site.visible ? <Eye size={15} /> : <EyeSlash size={15} />}{site.visible ? "展示中" : "已隐藏"}</button><div className="row-actions"><Button variant="ghost" size="icon" onClick={() => move(site, -1)} disabled={busy || index === 0 || hasFilters} aria-label={`上移${site.name}`} title="上移"><ArrowUp size={17} /></Button><Button variant="ghost" size="icon" onClick={() => move(site, 1)} disabled={busy || index === sites.length - 1 || hasFilters} aria-label={`下移${site.name}`} title="下移"><ArrowDown size={17} /></Button><Button variant="ghost" size="icon" onClick={() => edit(site)} disabled={busy} aria-label={`编辑${site.name}`} title="编辑"><PencilSimple size={18} /></Button><Button variant="ghost" size="icon" onClick={() => { setDeleteError(""); setDeleting(site); }} disabled={busy} aria-label={`删除${site.name}`} title="删除"><Trash size={18} /></Button></div></article>;
      }) : <div className="admin-empty"><GlobeHemisphereWest size={38} weight="light" /><h2>{hasFilters ? "没有找到匹配的网站" : "给你的世界，添一个入口"}</h2><p>{hasFilters ? "试试其他关键词，或选择其他分类。" : "添加网站名称、地址和介绍，就能在首页展示。"}</p>{hasFilters ? <Button variant="secondary" onClick={() => { setQuery(""); setSelectedCategory(null); }}>清除筛选</Button> : <Button onClick={() => edit(null)}><Plus size={17} />添加第一个网站</Button>}</div>}</div><div className="collection-tip">通过上下箭头调整首页顺序，点击展示状态可以快速隐藏网站。{hasFilters && " 清除搜索与分类筛选后可调整排序。"}</div></section>}
      {tab === "sites" && sites.some((site) => site.url.includes(".example.com")) && <p className="demo-hint">当前包含示例网站，你可以编辑为自己的地址，也可以删除后重新添加。</p>}
      <div hidden={tab !== "settings"}><AdminSettingsPanel key={settingsRevision} settings={data.settings} accessConfigured={data.accessConfigured} busy={busy} section={settingsSection} onSectionChange={(section) => navigate("settings", section)} onSaveSettings={saveSettings} onSetAccessPassword={setAccessPassword} notify={notify} /></div>
      {tab === "account" && <AccountPanel user={user} notify={notify} />}
      <footer className="admin-footer"><span>NAV PALACE · 用心创造，自在抵达</span></footer>
    </div></main>
    {/* 挂载到 body，避免提示占用列表空间，也避免受父级布局和裁剪影响。 */}
    {notice && createPortal(
      <div
        className={`admin-toast ${notice.error ? "is-error" : ""}`}
        role={notice.error ? "alert" : "status"}
        aria-atomic="true"
        onMouseEnter={() => setNoticePaused(true)}
        onMouseLeave={() => setNoticePaused(false)}
        onFocus={() => setNoticePaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setNoticePaused(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setNotice(null); setNoticePaused(false); }
        }}
      >
        {notice.error ? <X size={19} aria-hidden="true" /> : <CheckCircle size={19} aria-hidden="true" />}
        <span>{notice.message}</span>
        <button type="button" aria-label="关闭提示" onClick={() => { setNotice(null); setNoticePaused(false); }}><X size={16} aria-hidden="true" /></button>
      </div>,
      document.body,
    )}
    <Dialog open={editorOpen} onOpenChange={(open) => { if (!busy && !editorUploading) setEditorOpen(open); }}><DialogContent><DialogTitle className="dialog-title">{editing ? "编辑网站" : "添一个新的入口"}</DialogTitle><DialogDescription className="dialog-description">填写网站信息，保存后会同步到首页。</DialogDescription><SiteEditor key={editing?.id || "new"} site={editing} onSave={saveSite} busy={busy} error={editorError} notify={notify} accessConfigured={data.accessConfigured} onBusyChange={setEditorUploading} /></DialogContent></Dialog>
    <ImportConfigDialog open={importOpen} onOpenChange={setImportOpen} onImported={imported} notify={notify} />
    <Dialog open={signOutOpen} onOpenChange={(open) => { if (!busy) setSignOutOpen(open); }}><DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); document.getElementById("sign-out-trigger")?.focus(); }}><DialogTitle className="dialog-title">退出管理后台？</DialogTitle><DialogDescription className="dialog-description">退出后需要重新登录才能管理网站。请先保存尚未提交的更改。</DialogDescription><div className="form-actions"><Button variant="secondary" onClick={() => setSignOutOpen(false)} disabled={busy}>继续管理</Button><Button onClick={signOut} disabled={busy}>{busy ? "退出中…" : "确认退出"}</Button></div></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={(open) => { if (!busy && !open) setDeleting(null); }}><DialogContent><DialogTitle className="dialog-title">删除「{deleting?.name}」？</DialogTitle><DialogDescription className="dialog-description">这会移除这个网站入口。如果只是暂时不展示，可以关闭展示状态。</DialogDescription>{deleteError && <p className="form-error" role="alert">{deleteError}</p>}<div className="form-actions"><Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>保留网站</Button><Button variant="destructive" onClick={removeSite} disabled={busy}>{busy ? "删除中…" : "确认删除"}</Button></div></DialogContent></Dialog>
  </div>;
}
