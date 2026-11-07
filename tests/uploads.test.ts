import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { ApiError } from "../src/lib/validation";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_REQUEST_BYTES, getUploadsDirectory, readUploadForm, readUploadedImage, saveUploadedImage } from "../src/lib/uploads";
import { GET, HEAD } from "../src/app/uploads/[filename]/route";

// 用真实图像验证转码、透明度、文件权限及 GET/HEAD 响应，避免仅检查文件后缀。
// 所有成功上传都写入独立临时目录，结束后恢复环境并删除文件。
test("uploaded images persist next to the database, resize, retain transparency, and serve as WebP", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nav-palace-upload-test-"));
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(directory, "nav.db");
  try {
    const source = await sharp({ create: { width: 3000, height: 1500, channels: 4, background: { r: 80, g: 150, b: 220, alpha: 0.4 } } }).png().toBuffer();
    const result = await saveUploadedImage(source);
    assert.match(result.url, /^\/uploads\/[0-9a-f-]{36}\.webp$/);
    assert.equal(result.width, 2400);
    assert.equal(result.height, 1200);
    assert.equal(getUploadsDirectory(), join(directory, "uploads"));
    const filename = result.url.split("/").at(-1)!;
    const bytes = await readUploadedImage(filename);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.hasAlpha, true);
    const pixel = await sharp(bytes).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(pixel[3] > 80 && pixel[3] < 130);
    assert.equal((await stat(join(directory, "uploads", filename))).mode & 0o777, 0o600);
    for (const width of [240, 480, 800]) {
      const variantPath = join(directory, "uploads", filename.replace(".webp", `-w${width}.webp`));
      const variant = await readFile(variantPath);
      const info = await sharp(variant).metadata();
      assert.equal(info.width, width);
      assert.equal(info.height, width / 2);
      assert.equal(info.hasAlpha, true);
      const rgba = await sharp(variant).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
      assert.ok(rgba[3] > 80 && rgba[3] < 130);
      assert.equal((await stat(variantPath)).mode & 0o777, 0o600);
      assert.ok(variant.byteLength < bytes.byteLength);
    }
    const context = { params: Promise.resolve({ filename }) };
    const response = await GET(new Request(`http://localhost${result.url}`), context);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("cache-control")!, /immutable/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    const head = await HEAD(new Request(`http://localhost${result.url}`, { method: "HEAD" }), context);
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(Number(head.headers.get("content-length")), bytes.byteLength);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("upload decoding rejects oversized, empty, corrupt and unsupported image content", async () => {
  await assert.rejects(() => saveUploadedImage(new Uint8Array(MAX_UPLOAD_BYTES + 1)), (error) => error instanceof ApiError && error.status === 413);
  await assert.rejects(() => saveUploadedImage(new Uint8Array()), (error) => error instanceof ApiError && error.status === 400);
  await assert.rejects(() => saveUploadedImage(Buffer.from("not a PNG despite its filename")), (error) => error instanceof ApiError && error.status === 400);
  await assert.rejects(() => saveUploadedImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" /></svg>')), (error) => error instanceof ApiError && error.status === 415);
});

test("JPEG, WebP and AVIF uploads are decoded and normalized instead of trusting filenames", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nav-palace-upload-format-test-"));
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(directory, "nav.db");
  try {
    for (const format of ["jpeg", "webp", "avif"] as const) {
      const source = await sharp({ create: { width: 12, height: 8, channels: 3, background: "#98c5da" } }).toFormat(format).toBuffer();
      const saved = await saveUploadedImage(source);
      const bytes = await readUploadedImage(saved.url.split("/").at(-1)!);
      assert.equal((await sharp(bytes).metadata()).format, "webp");
      assert.equal(saved.width, 12);
      assert.equal(saved.height, 8);
      for (const width of [240, 480, 800]) {
        const metadata = await sharp(await readUploadedImage(saved.url.split("/").at(-1)!, width)).metadata();
        assert.equal(metadata.width, 12);
        assert.equal(metadata.height, 8);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

// 故意伪造更小的长度头，确认实际接收的字节数仍受限制。
test("multipart request limits count streamed bytes rather than trusting the length header", async () => {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([1, 2, 3])], "picture.png", { type: "image/png" }));
  const decoded = await readUploadForm(new Request("http://localhost/api/admin/uploads", { method: "POST", body: form }));
  assert.equal((decoded.get("file") as File).name, "picture.png");
  await assert.rejects(() => readUploadForm(new Request("http://localhost/api/admin/uploads", {
    method: "POST", headers: { "content-type": "multipart/form-data; boundary=test", "content-length": "1" },
    body: new Uint8Array(MAX_UPLOAD_REQUEST_BYTES + 1),
  })), (error) => error instanceof ApiError && error.status === 413);
  await assert.rejects(() => readUploadForm(new Request("http://localhost/api/admin/uploads", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  })), (error) => error instanceof ApiError && error.status === 415);
});

// 公共图片路由既要拒绝路径穿越，也要为不存在的合法文件名返回 404。
test("public image reads reject path traversal and return 404 for missing images", async () => {
  for (const filename of ["../secret", "..%2Fsecret", "/etc/passwd", "x.svg", "123.webp"]) {
    await assert.rejects(() => readUploadedImage(filename), (error) => error instanceof ApiError && error.status === 404);
  }
  const missing = "00000000-0000-4000-8000-000000000000.webp";
  const response = await GET(new Request(`http://localhost/uploads/${missing}`), { params: Promise.resolve({ filename: missing }) });
  assert.equal(response.status, 404);
});


test("legacy uploads generate variants once under concurrent GET/HEAD and reuse immutable disk files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nav-palace-upload-legacy-test-"));
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(directory, "nav.db");
  try {
    await mkdir(getUploadsDirectory());
    const filename = "00000000-0000-4000-8000-000000000001.webp";
    const original = await sharp({ create: { width: 1000, height: 1500, channels: 4, background: { r: 80, g: 150, b: 220, alpha: 0.4 } } }).webp().toBuffer();
    await writeFile(join(getUploadsDirectory(), filename), original);
    const context = { params: Promise.resolve({ filename }) };
    const url = `http://localhost/uploads/${filename}?w=480`;
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => index % 2
      ? HEAD(new Request(url, { method: "HEAD" }), context) : GET(new Request(url), context)));
    const variantPath = join(getUploadsDirectory(), filename.replace(".webp", "-w480.webp"));
    const variant = await readFile(variantPath);
    const metadata = await sharp(variant).metadata();
    assert.equal(metadata.width, 480);
    assert.equal(metadata.height, 720);
    assert.equal(metadata.hasAlpha, true);
    for (const [index, response] of responses.entries()) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
      assert.equal(response.headers.get("content-type"), "image/webp");
      assert.equal(Number(response.headers.get("content-length")), variant.byteLength);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), index % 2 ? Buffer.alloc(0) : variant);
    }
    const before = await stat(variantPath);
    assert.deepEqual(await readUploadedImage(filename, 480), variant);
    const after = await stat(variantPath);
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeMs, before.mtimeMs);
    assert.deepEqual(await readUploadedImage(filename), original);
    assert.deepEqual((await readdir(getUploadsDirectory())).sort(), [filename, filename.replace(".webp", "-w480.webp")].sort());
    const directVariant = await GET(new Request(url), { params: Promise.resolve({ filename: filename.replace(".webp", "-w480.webp") }) });
    assert.equal(directVariant.status, 404);
    for (const query of ["w=", "w=1", "w=2400", "w=0480", "w=480.0", "w=480&w=480", "w=../secret", "w=NaN"]) {
      assert.equal((await GET(new Request(`http://localhost/uploads/${filename}?${query}`), context)).status, 400);
    }
    await assert.rejects(() => readUploadedImage(filename, 999), (error) => error instanceof ApiError && error.status === 400);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("legacy derivation rejects corrupt content, oversized pixels and disguised formats without leaving temporary files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nav-palace-upload-invalid-test-"));
  const previous = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(directory, "nav.db");
  try {
    await mkdir(getUploadsDirectory());
    const filename = "00000000-0000-4000-8000-000000000002.webp";
    const path = join(getUploadsDirectory(), filename);
    const oversized = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "white" } }).webp().toBuffer();
    const png = await sharp({ create: { width: 12, height: 8, channels: 3, background: "white" } }).png().toBuffer();
    for (const invalid of [Buffer.from("broken webp"), oversized, png]) {
      await writeFile(path, invalid);
      await assert.rejects(() => readUploadedImage(filename, 240), (error) => error instanceof ApiError && error.status === 400);
      assert.deepEqual(await readdir(getUploadsDirectory()), [filename]);
    }
    await rm(path);
    await assert.rejects(() => readUploadedImage(filename, 240), (error) => error instanceof ApiError && error.status === 404);
    await writeFile(path, await sharp({ create: { width: 12, height: 8, channels: 3, background: "white" } }).webp().toBuffer());
    assert.equal((await sharp(await readUploadedImage(filename, 240)).metadata()).width, 12);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
