"use strict";

// Three intentional profiles. These are encoder trade-offs, not a promise that
// every output will be smaller than its already-compressed input.
const QUALITY_PROFILES = Object.freeze({
  small: Object.freeze({
    name: "Compressed",
    h264Crf: 29,
    h265Crf: 32,
    vp9Crf: 42,
    vp8Crf: 22,
    x264Preset: "veryfast",
    vpxCpuUsed: 5,
    audioBitrate: "96k",
    mpegQuantizer: 12,
    gifFps: 8,
    gifMaxWidth: 360,
    gifColors: 64,
  }),
  balanced: Object.freeze({
    name: "Balanced",
    h264Crf: 23,
    h265Crf: 27,
    vp9Crf: 34,
    vp8Crf: 12,
    x264Preset: "veryfast",
    vpxCpuUsed: 4,
    audioBitrate: "128k",
    mpegQuantizer: 7,
    gifFps: 12,
    gifMaxWidth: 480,
    gifColors: 128,
  }),
  high: Object.freeze({
    name: "Best Quality",
    h264Crf: 19,
    h265Crf: 23,
    vp9Crf: 27,
    vp8Crf: 6,
    x264Preset: "faster",
    vpxCpuUsed: 3,
    audioBitrate: "192k",
    mpegQuantizer: 3,
    gifFps: 15,
    gifMaxWidth: 720,
    gifColors: 256,
  }),
});

function normalizeProfile(value) {
  const normalized = String(value || "balanced").trim().toLowerCase();
  if (["compressed", "smaller", "smaller file", "low"].includes(normalized)) return "small";
  if (["best", "best quality", "quality", "highest"].includes(normalized)) return "high";
  return Object.prototype.hasOwnProperty.call(QUALITY_PROFILES, normalized)
    ? normalized
    : "balanced";
}

function getQualityProfile(value) {
  return QUALITY_PROFILES[normalizeProfile(value)];
}

function getQualityCrf(value, codec) {
  const p = getQualityProfile(value);
  if (codec === "libx265") return String(p.h265Crf);
  if (codec === "libvpx-vp9") return String(p.vp9Crf);
  if (codec === "libvpx") return String(p.vp8Crf);
  return String(p.h264Crf);
}

function getGifFilterComplex(options = {}) {
  const p = getQualityProfile(options.videoQuality);
  // An explicit resolution/resize is respected; otherwise keep GIF dimensions
  // within a budget to avoid unintentionally huge animated images.
  const scale = options.videoResolution
    ? (typeof options.getResolutionFilter === "function" ? options.getResolutionFilter(options.videoResolution) : null)
    : options.imageWidth || options.imageHeight
      ? `scale=${options.imageWidth || -1}:${options.imageHeight || -1}`
      : `scale=w='min(iw,${p.gifMaxWidth})':h=-1`;
  const filters = [
    `fps=${options.videoFps || p.gifFps}`,
    `${scale || `scale=w='min(iw,${p.gifMaxWidth})':h=-1`}:flags=lanczos`,
    "split[base][pal]",
  ].join(",");
  return `[0:v]${filters};[pal]palettegen=max_colors=${p.gifColors}:stats_mode=diff[p];[base][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle[out]`;
}

module.exports = { QUALITY_PROFILES, normalizeProfile, getQualityProfile, getQualityCrf, getGifFilterComplex };
