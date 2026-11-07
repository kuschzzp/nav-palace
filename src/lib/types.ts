import type { AmbientIntensity, AmbientStyle } from "./ambient-presets";
import type { PointerStyle } from "./pointer-presets";

export type PortalSettings = {
  name: string;
  headline: string;
  subtitle: string;
  footer: string;
  logoUrl: string;
  aboutTitle: string;
  aboutText: string;
  // 装饰配置不包含私密访问凭据，可以安全传给访客页面。
  atmosphereStyle: AmbientStyle;
  atmosphereIntensity: AmbientIntensity;
  pointerStyle: PointerStyle;
  pointerScatter: boolean;
  departureDelaySeconds: number;
};

export type Site = {
  id: string;
  name: string;
  url: string;
  description: string;
  image: string;
  icon: string;
  category: string;
  // 数值越小越靠前；后台调整顺序时会重写为连续的位置编号。
  sortOrder: number;
  // 隐藏只停止公开展示与跳转，不删除后台配置。
  visible: boolean;
  // 公开展示与密码保护独立：隐藏项即使解锁也不会出现。
  requiresPassword: boolean;
};

export type PortalData = { settings: PortalSettings; sites: Site[] };
export type AdminData = PortalData & { accessConfigured: boolean };
