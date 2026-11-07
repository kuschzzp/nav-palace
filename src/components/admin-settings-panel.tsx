"use client";

import { useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { Check, Cursor, ImageSquare, LockKey, Sparkle, SpinnerGap, TextT } from "@phosphor-icons/react";
import { AmbientPicker } from "@/components/ambient-picker";
import { ImagePicker } from "@/components/image-picker";
import { PointerPicker } from "@/components/pointer-picker";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { logoPresets } from "@/lib/media-presets";
import { departureCountdown } from "@/lib/departure-settings";
import type { PortalSettings } from "@/lib/types";
import "./admin-settings-panel.css";

export type AdminSettingsSection = "content" | "visual" | "effects" | "pointer" | "security";

type AdminSettingsPanelProps = {
  settings: PortalSettings;
  accessConfigured: boolean;
  busy: boolean;
  section: AdminSettingsSection;
  onSectionChange: (section: AdminSettingsSection) => void;
  onSaveSettings: (settings: PortalSettings) => Promise<boolean>;
  onSetAccessPassword: (password: string) => Promise<boolean>;
  notify: (message: string, error?: boolean) => void;
};

type TextKey = "name" | "headline" | "subtitle" | "footer" | "aboutTitle" | "aboutText";
const textLimits: Record<TextKey, number> = { name: 80, headline: 120, subtitle: 300, footer: 300, aboutTitle: 80, aboutText: 3000 };
const sections = [
  { value: "content", label: "内容文案", icon: TextT },
  { value: "visual", label: "视觉素材", icon: ImageSquare },
  { value: "effects", label: "页面效果", icon: Sparkle },
  { value: "pointer", label: "鼠标样式", icon: Cursor },
  { value: "security", label: "私密访问", icon: LockKey },
] as const;

export function AdminSettingsPanel({ settings, accessConfigured, busy, section, onSectionChange, onSaveSettings, onSetAccessPassword, notify }: AdminSettingsPanelProps) {
  const id = useId();
  // 所有分区共用一份草稿；切换标签不会丢失尚未保存的文字或素材。
  const [draft, setDraft] = useState<PortalSettings>(() => ({ ...settings }));
  const [saved, setSaved] = useState<PortalSettings>(() => ({ ...settings }));
  const [pending, setPending] = useState<"settings" | "password" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordFieldVersion, setPasswordFieldVersion] = useState(0);
  const tabRefs = useRef<Partial<Record<AdminSettingsSection, HTMLButtonElement | null>>>({});
  const confirmationRef = useRef<HTMLInputElement>(null);
  // ref 同步阻止同一帧内重复提交，状态负责显示保存进度。
  const submitting = useRef(false);
  const saving = busy || pending !== null;
  const blocked = saving || uploading;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const { minSeconds, maxSeconds } = departureCountdown;
  const countdownFill = (draft.departureDelaySeconds - minSeconds) / (maxSeconds - minSeconds) * 100;

  function update<K extends keyof PortalSettings>(key: K, value: PortalSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    if (blocked || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = sections.findIndex((item) => item.value === section);
    const next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length;
    const value = sections[next].value;
    onSectionChange(value);
    tabRefs.current[value]?.focus();
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || submitting.current || !dirty) return;
    submitting.current = true;
    setPending("settings");
    const snapshot = { ...draft };
    try {
      // 保存整份草稿；只有服务器确认成功后，才更新本地的已保存基线。
      if (await onSaveSettings(snapshot)) setSaved(snapshot);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "保存设置失败，请稍后重试。", true);
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked || submitting.current) return;
    if (password.length < 8 || password.length > 128) { notify("访问密码需要 8 至 128 个字符。", true); return; }
    if (password !== confirmation) { notify("两次输入的访问密码不一致。", true); confirmationRef.current?.focus(); return; }
    submitting.current = true;
    setPending("password");
    try {
      // 密码独立提交，不写进公开配置，也不读取或回显已保存的密码。
      if (await onSetAccessPassword(password)) {
        setPassword("");
        setConfirmation("");
        setPasswordFieldVersion((version) => version + 1);
      }
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "更新访问密码失败，请稍后重试。", true);
    } finally {
      submitting.current = false;
      setPending(null);
    }
  }

  function textField(key: TextKey, label: string, multiline = false) {
    const fieldId = `${id}-${key}`;
    const props = { id: fieldId, value: draft[key], maxLength: textLimits[key], disabled: saving, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(key, event.target.value) };
    return <label className="field" htmlFor={fieldId}>{label}{multiline ? <textarea {...props} rows={4} /> : <input {...props} required={key === "name" || key === "headline"} />}</label>;
  }

  function saveActions() {
    return <div className="admin-settings-actions">
      <span className="admin-settings-draft-state" role="status">{uploading ? "请先完成 Logo 上传" : dirty ? "有未保存的更改 · 切换分区会保留草稿" : "所有设置已保存"}</span>
      <Button data-specular-action="true" type="submit" disabled={blocked || !dirty}>{pending === "settings" ? <SpinnerGap size={17} className="spin" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{pending === "settings" ? "保存中…" : "保存站点设置"}</Button>
    </div>;
  }

  const panelProps = (value: AdminSettingsSection) => ({ id: `${id}-panel-${value}`, role: "tabpanel", "aria-labelledby": `${id}-tab-${value}`, hidden: section !== value, tabIndex: 0 });

  return <div className="admin-settings-panel" aria-busy={saving}>
    <div className="admin-settings-tabs" role="tablist" aria-label="站点设置分区" aria-orientation="horizontal" onKeyDown={moveTab}>
      {sections.map(({ value, label, icon: Icon }) => <button key={value} ref={(node) => { tabRefs.current[value] = node; }} type="button" role="tab" id={`${id}-tab-${value}`} aria-controls={`${id}-panel-${value}`} aria-selected={section === value} tabIndex={section === value ? 0 : -1} disabled={blocked} onClick={() => onSectionChange(value)}><Icon size={18} aria-hidden="true" />{label}</button>)}
    </div>

    {/* 分区保持挂载，切换页面时保留草稿和 Logo 上传状态。 */}
    <section {...panelProps("content")} className="admin-settings-tabpanel">
      <header className="admin-settings-heading"><h2>让文字带上你的温度</h2><p>编辑首页与「关于」中的介绍，让访客一眼认识这里。</p></header>
      <form className="admin-form admin-settings-content" onSubmit={saveSettings}>
        <div className="form-columns">{textField("name", "站点名称")}{textField("headline", "首页标题")}</div>
        <div className="form-columns">{textField("subtitle", "首页介绍")}{textField("footer", "页脚文案")}</div>
        {textField("aboutTitle", "关于标题")}
        {textField("aboutText", "关于内容", true)}
        {saveActions()}
      </form>
    </section>

    <section {...panelProps("visual")} className="admin-settings-tabpanel">
      <header className="admin-settings-heading"><h2>给站点一个专属标志</h2><p>可选 10 款水墨 Logo、默认山形标志，也可上传自己的 Logo。选择后点击「保存站点设置」生效，图片保留完整比例与透明区域。</p></header>
      <form className="admin-form" onSubmit={saveSettings}>
        <div className="admin-settings-media-grid">
          <ImagePicker label="Logo 图片" value={draft.logoUrl} presets={logoPresets} onChange={(value) => update("logoUrl", value)} onFeedback={notify} onBusyChange={setUploading} disabled={saving} contain />
        </div>
        {saveActions()}
      </form>
    </section>

    <section {...panelProps("effects")} className="admin-settings-tabpanel">
      <header className="admin-settings-heading"><h2>给小天地添一点生气</h2><p>设置首页飘落物和跳转中间页的倒计时。</p></header>
      <form className="admin-form" onSubmit={saveSettings}>
        <div className="admin-settings-effects-grid admin-settings-effects-ink">
          <div className="admin-settings-effect-block"><h3>页面氛围</h3><AmbientPicker value={draft.atmosphereStyle} onChange={(value) => update("atmosphereStyle", value)} intensity={draft.atmosphereIntensity} onIntensityChange={(value) => update("atmosphereIntensity", value)} disabled={saving} /></div>
          <div className="admin-settings-effect-block">
            <h3>跳转中间页</h3>
            <div className="admin-settings-countdown">
              <label htmlFor={`${id}-departure-delay`}>自动跳转倒计时</label>
              <div className="admin-settings-countdown-controls">
                <input
                  id={`${id}-departure-delay`}
                  type="range"
                  min={minSeconds}
                  max={maxSeconds}
                  step={1}
                  value={draft.departureDelaySeconds}
                  aria-valuetext={`${draft.departureDelaySeconds} 秒`}
                  aria-describedby={`${id}-departure-help`}
                  style={{ "--countdown-fill": `${countdownFill}%` } as CSSProperties}
                  onChange={(event) => update("departureDelaySeconds", event.currentTarget.valueAsNumber)}
                  disabled={saving}
                />
                <output htmlFor={`${id}-departure-delay`} aria-hidden="true">{draft.departureDelaySeconds} 秒</output>
                <div className="admin-settings-countdown-bounds" aria-hidden="true"><span>{minSeconds} 秒</span><span>{maxSeconds} 秒</span></div>
              </div>
              <small id={`${id}-departure-help`}>应用到所有网站入口，访客仍可立即前往或取消自动跳转。</small>
            </div>
          </div>
        </div>
        {saveActions()}
      </form>
    </section>

    <section {...panelProps("pointer")} className="admin-settings-tabpanel">
      <header className="admin-settings-heading"><h2>鼠标样式</h2><p>选择首页指针，并在试用区体验点击散落。</p></header>
      <form className="admin-form" onSubmit={saveSettings}>
        <div className="admin-settings-effects-grid">
          <PointerPicker value={draft.pointerStyle} scatterEnabled={draft.pointerScatter} onChange={(value) => update("pointerStyle", value)} onScatterChange={(value) => update("pointerScatter", value)} disabled={saving} />
        </div>
        {saveActions()}
      </form>
    </section>

    <section {...panelProps("security")} className="admin-settings-tabpanel">
      <header className="admin-settings-heading"><h2>为私密入口留一把钥匙</h2><p>访问密码用于解锁首页的私密网站，独立于管理员登录密码。</p></header>
      <form className="admin-form admin-settings-security" onSubmit={savePassword}>
        <div className={`admin-settings-access-state ${accessConfigured ? "is-configured" : ""}`}><LockKey size={17} aria-hidden="true" /><span>{accessConfigured ? "已设置访问密码，可在下方更换" : "尚未设置密码，私密入口会保持锁定"}</span></div>
        <PasswordInput key={`access-${passwordFieldVersion}`} id={`${id}-password`} label={accessConfigured ? "新访问密码" : "访问密码"} name="accessPassword" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} placeholder="8 至 128 个字符" disabled={saving} aria-describedby={`${id}-password-help`} />
        <PasswordInput key={`confirm-${passwordFieldVersion}`} id={`${id}-confirmation`} label="确认访问密码" ref={confirmationRef} name="accessConfirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required minLength={8} maxLength={128} disabled={saving} />
        <p id={`${id}-password-help`} className="admin-settings-security-help">访客解锁后，当前浏览器会记住 7 天。更换密码会立即撤销旧的解锁记录。已保存的密码不会在此处显示。</p>
        <div className="admin-settings-password-actions"><Button type="submit" disabled={blocked}>{pending === "password" ? <SpinnerGap size={17} className="spin" aria-hidden="true" /> : <LockKey size={17} aria-hidden="true" />}{pending === "password" ? "更新中…" : accessConfigured ? "更新访问密码" : "设置访问密码"}</Button></div>
      </form>
    </section>
  </div>;
}
