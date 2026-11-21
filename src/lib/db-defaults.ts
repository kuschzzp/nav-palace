import type { PortalSettings } from "./types";
import { departureDelaySchema } from "./validation";
import { ambientIntensityNames, ambientStyleNames, normalizeLegacyAtmosphere } from "./ambient-presets";
import { pointerStyleNames } from "./pointer-presets";
import { departureCountdown } from "./departure-settings";

// 两种存储共用公开配置的默认值与历史字段兼容规则。
export const defaultSettings: PortalSettings = {
  name: "NAV PALACE",
  headline: "让热爱，有处可达。",
  subtitle: "我的网站与作品，都从这里出发。",
  footer: "每一个入口，都通往热爱",
  logoUrl: "",
  aboutTitle: "关于这里",
  aboutText: "一个收藏作品、记录热爱的小小入口。",
  atmosphereStyle: "none",
  atmosphereIntensity: "balanced",
  pointerStyle: "system",
  pointerScatter: true,
  departureDelaySeconds: departureCountdown.defaultSeconds,
};

export function normalizeSettings(value: string): PortalSettings {
  const stored = JSON.parse(value) as Record<string, unknown>;
  const settings = Object.fromEntries(Object.entries(defaultSettings).map(([key, fallback]) => [key, typeof stored[key] === typeof fallback ? stored[key] : fallback])) as PortalSettings;
  const style = normalizeLegacyAtmosphere(settings.atmosphereStyle);
  settings.atmosphereStyle = ambientStyleNames.includes(style as typeof ambientStyleNames[number]) ? style as PortalSettings["atmosphereStyle"] : "none";
  if (!ambientIntensityNames.includes(settings.atmosphereIntensity)) settings.atmosphereIntensity = "balanced";
  if (!pointerStyleNames.includes(settings.pointerStyle)) settings.pointerStyle = defaultSettings.pointerStyle;
  const departureDelay = departureDelaySchema.safeParse(settings.departureDelaySeconds);
  settings.departureDelaySeconds = departureDelay.success ? departureDelay.data : defaultSettings.departureDelaySeconds;
  return settings;
}
