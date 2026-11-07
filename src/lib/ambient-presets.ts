// 氛围标识用于保存与导入，保留已发布的静态和花瓣配置。
export const ambientStyleNames = ["none", "petals", "golden-leaves", "paper-snow", "ink-feathers"] as const;
export const atmosphereStyleNames = ambientStyleNames;
export type AmbientStyle = (typeof ambientStyleNames)[number];

export type AmbientPreset = { value: AmbientStyle; label: string; description: string; accent: string };
export const ambientPresets: readonly AmbientPreset[] = [
  { value: "none", label: "静纸无声", description: "只留纸面与水墨，安静浏览", accent: "#817566" },
  { value: "petals", label: "朱砂落英", description: "少量朱红花瓣，随风缓缓落下", accent: "#b83224" },
  { value: "golden-leaves", label: "金叶纷飞", description: "赭金叶片迎风翻转，斜斜落下", accent: "#a2611b" },
  { value: "paper-snow", label: "雪落宣纸", description: "蓝灰描边的六角雪花，打着旋飘落", accent: "#486c87" },
  { value: "ink-feathers", label: "墨羽飘落", description: "墨灰羽毛左右摆荡，轻轻落下", accent: "#4c4743" },
];

const replacedAtmospheres = new Map([
  ["pine-wind", "golden-leaves"],
  ["mountain-mist", "paper-snow"],
  ["ink-bloom", "ink-feathers"],
]);

// 迁移入口兼容旧氛围开关；未知值保持原样，交给严格的导入校验拒绝。
export function normalizeLegacyAtmosphere(value: unknown, petalsEnabled?: unknown): unknown {
  if (typeof value === "string") {
    if (["sakura", "snow", "fireflies", "stars", "bubbles", "leaves"].includes(value)) return "petals";
    return replacedAtmospheres.get(value) ?? value;
  }
  if (value === undefined && typeof petalsEnabled === "boolean") return petalsEnabled ? "petals" : "none";
  return value;
}

// 强度只调整装饰数量，不改变文字、卡片或动画速度；手机始终使用一半数量。
export const ambientIntensityNames = ["gentle", "balanced", "vivid"] as const;
export type AmbientIntensity = (typeof ambientIntensityNames)[number];
export const ambientIntensityPresets: readonly {
  value: AmbientIntensity;
  label: string;
  description: string;
  desktop: number;
  mobile: number;
}[] = [
  { value: "gentle", label: "轻柔", description: "少量点缀", desktop: 8, mobile: 4 },
  { value: "balanced", label: "适中", description: "舒适陪伴", desktop: 16, mobile: 8 },
  { value: "vivid", label: "浓郁", description: "更有氛围", desktop: 32, mobile: 16 },
];
