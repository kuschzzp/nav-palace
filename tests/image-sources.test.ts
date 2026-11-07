import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { test } from "node:test";
import { getImageSources } from "../src/lib/image-sources";
import { coverPresets, logoPresets } from "../src/lib/media-presets";

test("built-in cover and logo choices resolve to existing versioned images without changing stored values", async () => {
  for (const preset of [...coverPresets, ...logoPresets].filter((item) => item.image)) {
    const original = preset.image;
    const source = getImageSources(original, 240);
    assert.match(source.src, /^\/images\/optimized\//);
    const candidates = source.srcSet!.split(", ").map((entry) => entry.split(" "));
    assert.ok(candidates.every(([, width]) => Number(width.slice(0, -1)) <= 256));
    await Promise.all(candidates.map(([url]) => access(`public${url}`)));
    assert.equal(preset.image, original);
    if (source.avifSrcSet) {
      const avif = source.avifSrcSet.split(", ").map((entry) => entry.split(" "));
      assert.deepEqual(avif.map(([, width]) => width), candidates.map(([, width]) => width));
      await Promise.all(avif.map(([url]) => access(`public${url}`)));
    }
  }
});

test("uploaded thumbnails use only supported widths and leave the original URL intact", () => {
  const url = "/uploads/12345678-1234-4123-8123-123456789abc.webp";
  assert.equal(getImageSources(url, 240).src, `${url}?w=240`);
  assert.equal(getImageSources(url).srcSet, `${url}?w=240 240w, ${url}?w=480 480w, ${url}?w=800 800w`);
});

test("custom remote URLs and unrecognized local addresses are never rewritten or proxied", () => {
  for (const url of ["https://example.com/image.webp?width=900", "/images/custom.webp", "/uploads/../secret.webp", ""]) {
    assert.deepEqual(getImageSources(url), { src: url, srcSet: undefined, avifSrcSet: undefined });
  }
});
