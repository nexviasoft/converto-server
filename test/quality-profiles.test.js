"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { getQualityProfile, getQualityCrf, getGifFilterComplex, normalizeProfile } = require("../quality-profiles");

test("Android quality values are preserved and friendly aliases normalize", () => {
  assert.equal(normalizeProfile("small"), "small");
  assert.equal(normalizeProfile("compressed"), "small");
  assert.equal(normalizeProfile("balanced"), "balanced");
  assert.equal(normalizeProfile("Best Quality"), "high");
});

test("video quality monotonic by compression for common codecs", () => {
  for (const codec of ["libx264", "libx265", "libvpx-vp9"]) {
    const [high, balanced, small] = ["high", "balanced", "small"].map(q=>Number(getQualityCrf(q,codec)));
    assert(high < balanced && balanced < small, `CRF ordering for ${codec}`);
  }
});

test("GIF size/fps/color budget differs by profile", () => {
  const small = getQualityProfile("small");
  const balanced = getQualityProfile("balanced");
  const high = getQualityProfile("high");
  assert(small.gifFps < balanced.gifFps && balanced.gifFps < high.gifFps);
  assert(small.gifMaxWidth < balanced.gifMaxWidth && balanced.gifMaxWidth < high.gifMaxWidth);
  assert.match(getGifFilterComplex({videoQuality:"small"}), /palettegen=max_colors=64/);
  assert.match(getGifFilterComplex({videoQuality:"high"}), /palettegen=max_colors=256/);
});
