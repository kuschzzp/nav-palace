import assert from "node:assert/strict";
import { test } from "node:test";
import { siteIconCatalog, siteIconNames } from "../src/lib/site-icons";
import { siteInputSchema, sitePatchSchema } from "../src/lib/validation";

// 用同一份图标目录检查创建和局部更新，防止选择器与后端可选值脱节。
test("the complete selectable icon catalog is accepted when creating and updating sites", () => {
  assert.equal(new Set(siteIconNames).size, siteIconCatalog.length);
  assert.ok(siteIconCatalog.length >= 40);
  for (const icon of siteIconNames) {
    assert.equal(siteInputSchema.parse({ name: "我的网站", url: "https://example.com", icon }).icon, icon);
    assert.equal(sitePatchSchema.parse({ icon }).icon, icon);
  }
  assert.equal(siteInputSchema.safeParse({ name: "网站", url: "https://example.com", icon: "unknown-icon" }).success, false);
});
