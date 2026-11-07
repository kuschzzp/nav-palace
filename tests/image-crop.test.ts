import assert from "node:assert/strict";
import { test } from "node:test";
import { getCropGeometry, getCropOutputSize } from "../src/lib/image-crop";

test("cover exports match the bundled aspect ratio and generic crops retain their ratio", () => {
  assert.deepEqual(getCropOutputSize(8 / 5), { width: 800, height: 500 });
  assert.deepEqual(getCropOutputSize(4 / 5), { width: 800, height: 1000 });
});

test("portrait photos fill a landscape crop without blank edges and clamp panning", () => {
  const crop = getCropGeometry({ width: 1000, height: 2000 }, { width: 400, height: 250 }, 1, { x: 999, y: -999 });
  assert.deepEqual(crop.offset, { x: 0, y: -275 });
  assert.equal(crop.source.x, 0);
  assert.equal(crop.source.y, 1375);
  assert.equal(crop.source.width, 1000);
  assert.equal(crop.source.height, 625);
  assert.equal(crop.source.y + crop.source.height, 2000);
});

test("zoom and pan export the same visible coordinates as the preview", () => {
  const crop = getCropGeometry({ width: 1600, height: 1000 }, { width: 400, height: 250 }, 2, { x: 100, y: -50 });
  assert.equal(crop.scale, .5);
  assert.deepEqual(crop.source, { x: 200, y: 350, width: 800, height: 500 });
});

test("viewport resizing preserves the source crop for a centered photo", () => {
  const original = getCropGeometry({ width: 1920, height: 1080 }, { width: 640, height: 360 }, 1.5, { x: 0, y: 0 });
  const resized = getCropGeometry({ width: 1920, height: 1080 }, { width: 320, height: 180 }, 1.5, { x: 0, y: 0 });
  assert.deepEqual(original.source, resized.source);
  assert.throws(() => getCropGeometry({ width: 0, height: 1080 }, { width: 640, height: 360 }, 1, { x: 0, y: 0 }));
  assert.throws(() => getCropOutputSize(0));
});
