import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

// 跳转目标只能按已保存且可见的网站 ID 查询，不能把任意 URL 当作目标。
// 测试使用独立临时数据库，并在 finally 中关闭连接与清理文件。
test("departure destinations resolve by site ID and never expose hidden or missing sites", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nav-palace-departure-"));
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(directory, "navigation.db");
  const store = await import("../src/lib/db");
  try {
    const site = store.getPublicSite("journal");
    assert.equal(site?.url, "https://journal.example.com");
    assert.equal(store.getPublicSite("https://evil.example"), undefined);
    assert.equal(store.getPublicSite("missing"), undefined);
    store.updateSite("journal", { visible: false });
    assert.equal(store.getPublicSite("journal"), undefined);
    assert.equal(store.getAdminData().sites.some((item) => item.id === "journal"), true);
  } finally {
    store.closeDatabase();
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
