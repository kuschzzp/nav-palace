import assert from "node:assert/strict";
import { test } from "node:test";
import { settingsSchema, siteInputSchema, sitePatchSchema } from "../src/lib/validation";
import { ambientIntensityNames, ambientStyleNames } from "../src/lib/ambient-presets";
import { pointerStyleNames } from "../src/lib/pointer-presets";

test("settings receive ambient defaults and accept only bundled atmosphere styles", () => {
  const oldSettings = { name: "我的导航", headline: "从这里出发", subtitle: "", footer: "", logoUrl: "", aboutTitle: "", aboutText: "" };
  const parsed = settingsSchema.parse(oldSettings);
  assert.equal("cursorStyle" in parsed, false);
  assert.equal(settingsSchema.safeParse({ ...parsed, heroImage: "/images/old.webp" }).success, false);
  assert.equal(parsed.atmosphereStyle, "none");
  assert.equal(parsed.atmosphereIntensity, "balanced");
  assert.equal(parsed.pointerStyle, "system");
  assert.equal(parsed.pointerScatter, true);
  for (const pointerStyle of pointerStyleNames) assert.equal(settingsSchema.parse({ ...parsed, pointerStyle }).pointerStyle, pointerStyle);
  assert.equal(settingsSchema.safeParse({ ...parsed, pointerStyle: "url(https://example.com/cursor)" }).success, false);
  assert.equal(settingsSchema.safeParse({ ...parsed, pointerScatter: "false" }).success, false);
  for (const atmosphereIntensity of ambientIntensityNames) assert.equal(settingsSchema.parse({ ...parsed, atmosphereIntensity }).atmosphereIntensity, atmosphereIntensity);
  for (const atmosphereIntensity of ["extreme", 32, null, { count: 16 }]) assert.equal(settingsSchema.safeParse({ ...parsed, atmosphereIntensity }).success, false);
  for (const atmosphereStyle of ambientStyleNames) assert.equal(settingsSchema.parse({ ...parsed, atmosphereStyle }).atmosphereStyle, atmosphereStyle);
  assert.equal(settingsSchema.safeParse({ ...parsed, atmosphereStyle: "custom-script" }).success, false);
  assert.equal(settingsSchema.safeParse({ ...parsed, petalsEnabled: true }).success, false);
  assert.equal(settingsSchema.safeParse({ ...parsed, companionEnabled: true }).success, false);
});

test("retired cursor and ambient settings cannot be reintroduced through normal saves", () => {
  const base = { name: "导航", headline: "欢迎", subtitle: "", footer: "", logoUrl: "", aboutTitle: "", aboutText: "" };
  for (const cursorStyle of ["default", "sakura", "ocean", "url(https://example.com/cursor)"]) {
    assert.equal(settingsSchema.safeParse({ ...base, cursorStyle }).success, false);
  }
  for (const atmosphereStyle of ["sakura", "snow", "stars", "bubbles"]) assert.equal(settingsSchema.safeParse({ ...base, atmosphereStyle }).success, false);
  assert.equal(settingsSchema.safeParse({ ...base, musicEnabled: true }).success, false);
});

test("password protection defaults to public and partial updates preserve omitted access settings", () => {
  assert.equal(siteInputSchema.parse({ name: "站点", url: "https://example.com" }).requiresPassword, false);
  assert.equal(sitePatchSchema.parse({ requiresPassword: true }).requiresPassword, true);
  assert.equal("requiresPassword" in sitePatchSchema.parse({ name: "新名称" }), false);
});
