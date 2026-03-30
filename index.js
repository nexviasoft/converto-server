const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

const app = express();

const PORT = process.env.PORT || 10000;
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(
  cors({
    origin: true,
    credentials: true,
    exposedHeaders: ["Content-Disposition", "Content-Type"],
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 1000 * 1024 * 1024,
  },
});

const AUDIO_FORMATS = new Set([
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "opus",
  "flac",
  "aiff",
  "wma",
  "amr",
]);

const VIDEO_FORMATS = new Set([
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
  "wmv",
  "flv",
  "m4v",
  "mpg",
  "mpeg",
  "3gp",
]);

const IMAGE_FORMATS = new Set([
  "gif",
  "png",
  "jpg",
  "webp",
  "bmp",
  "tiff",
  "ico",
  "avif",
]);

const MIME_MAP = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  aiff: "audio/aiff",
  wma: "audio/x-ms-wma",
  amr: "audio/amr",

  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  wmv: "video/x-ms-wmv",
  flv: "video/x-flv",
  m4v: "video/x-m4v",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  "3gp": "video/3gpp",

  gif: "image/gif",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  ico: "image/x-icon",
  avif: "image/avif",
};

function safeUnlink(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

function cleanupFiles(...paths) {
  for (const p of paths) {
    safeUnlink(p);
  }
}

function normalizeTarget(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function detectInputExt(filename = "") {
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  if (ext === "jpeg") return "jpg";
  if (ext === "tif") return "tiff";
  if (ext === "aif") return "aiff";
  return ext;
}

function isSupportedTarget(target) {
  return (
    AUDIO_FORMATS.has(target) ||
    VIDEO_FORMATS.has(target) ||
    IMAGE_FORMATS.has(target)
  );
}

function buildOutputName(originalName, target) {
  const base = path.parse(originalName || "output").name || "output";
  return `${base}_converto.${target}`;
}

function normalizeTimeValue(value) {
  const v = String(value || "").trim();
  return v || null;
}

function isValidTimeValue(value) {
  if (!value) return true;
  return (
    /^(\d{1,2}:)?\d{1,2}:\d{1,2}(\.\d+)?$/.test(value) ||
    /^\d+(\.\d+)?$/.test(value)
  );
}

function normalizeAudioBitrate(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (!v) return null;

  const allowed = new Set([
    "64k",
    "96k",
    "128k",
    "160k",
    "192k",
    "256k",
    "320k",
  ]);

  return allowed.has(v) ? v : null;
}

function normalizeAudioSampleRate(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  const allowed = new Set(["22050", "32000", "44100", "48000"]);
  return allowed.has(v) ? v : null;
}

function normalizeAudioChannels(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  const allowed = new Set(["1", "2"]);
  return allowed.has(v) ? v : null;
}

function normalizeVideoResolution(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (!v) return null;

  if (v === "2160p") return "4k";

  const allowed = new Set([
    "144p",
    "240p",
    "360p",
    "480p",
    "720p",
    "1080p",
    "1440p",
    "4k",
  ]);

  return allowed.has(v) ? v : null;
}

function normalizeVideoCodec(value, target) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (!v) return null;

  if (target === "webm") {
    const allowed = new Set(["vp8", "vp9"]);
    return allowed.has(v) ? v : null;
  }

  const allowed = new Set(["h264", "h265"]);
  return allowed.has(v) ? v : null;
}

function normalizeVideoQuality(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (!v) return null;

  const allowed = new Set(["high", "balanced", "small"]);
  return allowed.has(v) ? v : null;
}

function normalizeVideoFps(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  const allowed = new Set(["24", "30", "60"]);
  return allowed.has(v) ? v : null;
}

function normalizeDimension(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return null;

  const n = Number(v);
  if (!Number.isFinite(n) || n < 16 || n > 8000) return null;

  return n;
}

function normalizeImageQuality(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return null;

  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 100) return null;

  return n;
}

function normalizeIconSize(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  const allowed = new Set(["16", "32", "48", "64", "128", "256"]);
  return allowed.has(v) ? Number(v) : null;
}

function normalizeIconBitDepth(value) {
  const v = String(value || "").trim();
  if (!v) return null;

  const allowed = new Set(["8", "24", "32"]);
  return allowed.has(v) ? Number(v) : null;
}

function getScaleFilterForResolution(resolution) {
  switch (resolution) {
    case "144p":
      return "scale=-2:144";
    case "240p":
      return "scale=-2:240";
    case "360p":
      return "scale=-2:360";
    case "480p":
      return "scale=-2:480";
    case "720p":
      return "scale=-2:720";
    case "1080p":
      return "scale=-2:1080";
    case "1440p":
      return "scale=-2:1440";
    case "4k":
      return "scale=-2:2160";
    default:
      return null;
  }
}

function getCrfForVideoQuality(quality, codec) {
  if (codec === "libx265") {
    switch (quality) {
      case "high":
        return "24";
      case "small":
        return "31";
      default:
        return "28";
    }
  }

  if (codec === "libvpx" || codec === "libvpx-vp9") {
    switch (quality) {
      case "high":
        return "30";
      case "small":
        return "40";
      default:
        return "36";
    }
  }

  switch (quality) {
    case "high":
      return "22";
    case "small":
      return "30";
    default:
      return "26";
  }
}

function getWebpQuality(imageQuality) {
  if (!imageQuality) return "92";
  return String(imageQuality);
}

function getAvifQuality(imageQuality) {
  if (!imageQuality) return "32";
  const mapped = Math.round(63 - ((imageQuality - 1) / 99) * 45);
  return String(Math.max(18, Math.min(63, mapped)));
}

function getJpgQValue(imageQuality) {
  return String(
    Math.max(2, Math.min(31, Math.round(31 - (imageQuality / 100) * 29)))
  );
}

function isTruthy(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

function parseConversionOptions(body = {}, target = "") {
  const trimStart = normalizeTimeValue(body.trimStart || body.startTime);
  const trimEnd = normalizeTimeValue(body.trimEnd || body.endTime);

  const audioBitrate = normalizeAudioBitrate(body.audioBitrate || body.bitrate);
  const audioSampleRate = normalizeAudioSampleRate(
    body.audioSampleRate || body.sampleRate
  );
  const audioChannels = normalizeAudioChannels(
    body.audioChannels || body.channels
  );

  const videoResolution = normalizeVideoResolution(body.videoResolution);
  const videoCodec = normalizeVideoCodec(body.videoCodec, target);
  const videoQuality = normalizeVideoQuality(body.videoQuality);
  const videoFps = normalizeVideoFps(body.videoFps || body.fps);

  const imageWidth = normalizeDimension(body.imageWidth || body.width);
  const imageHeight = normalizeDimension(body.imageHeight || body.height);
  const imageQuality = normalizeImageQuality(body.imageQuality);

  const iconSize = normalizeIconSize(body.iconSize);
  const iconBitDepth = normalizeIconBitDepth(body.iconBitDepth || body.bitDepth);

  const muteAudio = isTruthy(body.muteAudio);

  return {
    trimStart,
    trimEnd,
    audioBitrate,
    audioSampleRate,
    audioChannels,
    videoResolution,
    videoCodec,
    videoQuality,
    videoFps,
    imageWidth,
    imageHeight,
    imageQuality,
    iconSize,
    iconBitDepth,
    muteAudio,
  };
}

function validateOptions(options, target, entitlement = { isPro: false }) {
  if (!isValidTimeValue(options.trimStart)) {
    return "Invalid trim start value.";
  }

  if (!isValidTimeValue(options.trimEnd)) {
    return "Invalid trim end value.";
  }

  if (
    (options.trimStart || options.trimEnd) &&
    IMAGE_FORMATS.has(target) &&
    target !== "gif"
  ) {
    return "Trim is only supported for audio and video conversions.";
  }

  if (
    options.audioBitrate &&
    !AUDIO_FORMATS.has(target) &&
    !VIDEO_FORMATS.has(target)
  ) {
    return "Audio bitrate is not supported for this target format.";
  }

  if (
    options.audioSampleRate &&
    !AUDIO_FORMATS.has(target) &&
    !VIDEO_FORMATS.has(target)
  ) {
    return "Audio sample rate is not supported for this target format.";
  }

  if (
    options.audioChannels &&
    !AUDIO_FORMATS.has(target) &&
    !VIDEO_FORMATS.has(target)
  ) {
    return "Audio channels are not supported for this target format.";
  }

  if (options.videoResolution && !VIDEO_FORMATS.has(target) && target !== "gif") {
    return "Video resolution is only supported for video outputs.";
  }

  if (options.videoCodec && !VIDEO_FORMATS.has(target)) {
    return "Video codec is only supported for video outputs.";
  }

  if (options.videoQuality && !VIDEO_FORMATS.has(target) && target !== "gif") {
    return "Video quality is only supported for video outputs.";
  }

  if (options.videoFps && !VIDEO_FORMATS.has(target) && target !== "gif") {
    return "Video FPS is only supported for video or GIF outputs.";
  }

  if (options.muteAudio && !VIDEO_FORMATS.has(target)) {
    return "Mute audio is only supported for video outputs.";
  }

  if ((options.imageWidth || options.imageHeight) && !IMAGE_FORMATS.has(target)) {
    return "Image resize is only supported for image outputs.";
  }

  if (options.imageQuality && !["jpg", "webp", "avif"].includes(target)) {
    return "Image quality is only supported for JPG, WEBP, and AVIF outputs.";
  }

  if (options.iconSize && target !== "ico") {
    return "Icon size is only supported for ICO output.";
  }

  if (options.iconBitDepth && target !== "ico") {
    return "Icon bit depth is only supported for ICO output.";
  }

  if (!entitlement.isPro) {
    if (options.videoResolution === "1440p" || options.videoResolution === "4k") {
      return "Upgrade to Pro to use 1440p or 4K export.";
    }

    if (options.iconSize && options.iconSize > 48) {
      return "Upgrade to Pro to export large ICO sizes.";
    }

    if (options.iconBitDepth && options.iconBitDepth === 32) {
      return "Upgrade to Pro to use 32-bit ICO export.";
    }
  }

  return null;
}

function getEntitlementFromRequest(req) {
  const headerCandidates = [
    req.headers["x-user-tier"],
    req.headers["x-plan-tier"],
    req.headers["x-tier"],
    req.headers["x-entitlement-tier"],
  ];

  const bodyCandidates = [
    req.body?.tier,
    req.body?.userTier,
    req.body?.planTier,
    req.body?.entitlementTier,
  ];

  const normalizedHeader = headerCandidates
    .map((v) => String(v || "").trim().toLowerCase())
    .find(Boolean);

  const normalizedBody = bodyCandidates
    .map((v) => String(v || "").trim().toLowerCase())
    .find(Boolean);

  const explicitPro =
    isTruthy(req.body?.isPro) ||
    isTruthy(req.headers["x-user-pro"]) ||
    isTruthy(req.headers["x-is-pro"]);

  const tier = explicitPro
    ? "pro"
    : normalizedHeader === "pro" || normalizedBody === "pro"
    ? "pro"
    : "free";

  return {
    tier,
    isPro: tier === "pro",
  };
}

function buildTrimArgs(trimStart, trimEnd) {
  const args = [];

  if (trimStart) {
    args.push("-ss", trimStart);
  }

  args.push("-i");

  return {
    inputArgs: args,
    outputArgs: trimEnd ? ["-to", trimEnd] : [],
  };
}

function buildAudioOutputArgs({ audioBitrate, audioSampleRate, audioChannels }) {
  const args = [];

  if (audioBitrate) {
    args.push("-b:a", audioBitrate);
  }

  if (audioSampleRate) {
    args.push("-ar", audioSampleRate);
  }

  if (audioChannels) {
    args.push("-ac", audioChannels);
  }

  return args;
}

function buildVideoAudioArgs(
  { muteAudio, audioBitrate, audioSampleRate, audioChannels },
  codec = "aac",
  fallbackBitrate = "128k"
) {
  if (muteAudio) return ["-an"];

  const args = ["-c:a", codec];

  if (audioBitrate) {
    args.push("-b:a", audioBitrate);
  } else if (fallbackBitrate) {
    args.push("-b:a", fallbackBitrate);
  }

  if (audioSampleRate) {
    args.push("-ar", audioSampleRate);
  }

  if (audioChannels) {
    args.push("-ac", audioChannels);
  }

  return args;
}

function buildScaleFilterForImageResize(width, height) {
  if (!width && !height) return null;

  if (width && height) {
    return `scale=${width}:${height}`;
  }

  if (width) {
    return `scale=${width}:-2`;
  }

  return `scale=-2:${height}`;
}

function buildImageFilters(options) {
  const filters = [];
  const resizeFilter = buildScaleFilterForImageResize(
    options.imageWidth,
    options.imageHeight
  );

  if (resizeFilter) {
    filters.push(resizeFilter);
  }

  return filters;
}

function buildVideoFilters(options) {
  const filters = [];
  const resolutionFilter = getScaleFilterForResolution(options.videoResolution);

  if (resolutionFilter) {
    filters.push(resolutionFilter);
  }

  return filters;
}

function buildGifFilters(options) {
  const filters = [];
  const fps = options.videoFps || "10";
  filters.push(`fps=${fps}`);

  if (options.videoResolution) {
    const resFilter = getScaleFilterForResolution(options.videoResolution);
    if (resFilter) {
      const scaleOnly = resFilter.replace(/^scale=/, "");
      filters.push(`scale=${scaleOnly}:flags=lanczos`);
    }
  } else if (options.imageWidth || options.imageHeight) {
    const resize = buildScaleFilterForImageResize(
      options.imageWidth,
      options.imageHeight
    );
    if (resize) {
      const scaleOnly = resize.replace(/^scale=/, "");
      filters.push(`scale=${scaleOnly}:flags=lanczos`);
    } else {
      filters.push("scale=iw:-1:flags=lanczos");
    }
  } else {
    filters.push("scale=iw:-1:flags=lanczos");
  }

  return filters.join(",");
}

function buildIcoFilters(options) {
  const filters = [];

  const baseResize = buildScaleFilterForImageResize(
    options.imageWidth,
    options.imageHeight
  );
  if (baseResize) {
    filters.push(baseResize);
  }

  if (options.iconSize) {
    filters.push(`scale=${options.iconSize}:${options.iconSize}`);
  }

  return filters;
}

function buildIcoPixelFormatArgs(iconBitDepth) {
  if (!iconBitDepth) return [];

  if (iconBitDepth === 32) return ["-pix_fmt", "rgba"];
  if (iconBitDepth === 24) return ["-pix_fmt", "rgb24"];
  if (iconBitDepth === 8) return ["-pix_fmt", "pal8"];

  return [];
}

function buildFfmpegArgs(inputPath, target, outputPath, options = {}) {
  const trimArgs = buildTrimArgs(options.trimStart, options.trimEnd);
  const inputArgs = [...trimArgs.inputArgs, inputPath];
  const extraOutputArgs = [...trimArgs.outputArgs];

  if (AUDIO_FORMATS.has(target)) {
    switch (target) {
      case "mp3":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          "-vn",
          "-codec:a",
          "libmp3lame",
          ...(options.audioBitrate ? ["-b:a", options.audioBitrate] : ["-q:a", "3"]),
          ...(options.audioSampleRate ? ["-ar", options.audioSampleRate] : []),
          ...(options.audioChannels ? ["-ac", options.audioChannels] : []),
          outputPath,
        ];

      case "wav":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          "-vn",
          "-c:a",
          "pcm_s16le",
          ...(options.audioSampleRate ? ["-ar", options.audioSampleRate] : []),
          ...(options.audioChannels ? ["-ac", options.audioChannels] : []),
          outputPath,
        ];

      case "m4a":
      case "aac":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          "-vn",
          "-c:a",
          "aac",
          ...buildAudioOutputArgs({
            audioBitrate: options.audioBitrate || "160k",
            audioSampleRate: options.audioSampleRate,
            audioChannels: options.audioChannels,
          }),
          outputPath,
        ];

      case "ogg":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          "-vn",
          "-c:a",
          "libvorbis",
          ...(options.audioBitrate ? ["-b:a", options.audioBitrate] : ["-q:a", "4"]),
          ...(options.audioSampleRate ? ["-ar", options.audioSampleRate] : []),
          ...(options.audioChannels ? ["-ac", options.audioChannels] : []),
          outputPath,
        ];

      case "opus":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          "-vn",
          "-c:a",
          "libopus",
          ...buildAudioOutputArgs({
            audioBitrate: options.audioBitrate || "128k",
            audioSampleRate: options.audioSampleRate,
            audioChannels: options.audioChannels,
          }),
          outputPath,
        ];

      case "flac":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          "-vn",
          "-c:a",
          "flac",
          ...(options.audioSampleRate ? ["-ar", options.audioSampleRate] : []),
          ...(options.audioChannels ? ["-ac", options.audioChannels] : []),
          outputPath,
        ];

      case "aiff":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          "-vn",
          "-c:a",
          "pcm_s16be",
          ...(options.audioSampleRate ? ["-ar", options.audioSampleRate] : []),
          ...(options.audioChannels ? ["-ac", options.audioChannels] : []),
          outputPath,
        ];

      case "wma":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          "-vn",
          "-c:a",
          "wmav2",
          ...buildAudioOutputArgs({
            audioBitrate: options.audioBitrate || "160k",
            audioSampleRate: options.audioSampleRate,
            audioChannels: options.audioChannels,
          }),
          outputPath,
        ];

      case "amr":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          "-vn",
          "-c:a",
          "libopencore_amrnb",
          "-ar",
          "8000",
          "-ac",
          "1",
          "-b:a",
          "12.2k",
          outputPath,
        ];

      default:
        return null;
    }
  }

  if (VIDEO_FORMATS.has(target)) {
    const videoFilters = buildVideoFilters(options);
    const vfArgs = videoFilters.length ? ["-vf", videoFilters.join(",")] : [];
    const fpsArgs = options.videoFps ? ["-r", options.videoFps] : [];

    switch (target) {
      case "mp4":
      case "mov":
      case "mkv":
      case "m4v": {
        const codec = options.videoCodec === "h265" ? "libx265" : "libx264";
        const crf = getCrfForVideoQuality(options.videoQuality, codec);

        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...vfArgs,
          ...fpsArgs,
          "-c:v",
          codec,
          "-preset",
          "ultrafast",
          "-crf",
          crf,
          ...buildVideoAudioArgs(options, "aac", "128k"),
          ...(target === "mp4" ? ["-movflags", "+faststart"] : []),
          outputPath,
        ];
      }

      case "webm": {
        const codec = options.videoCodec === "vp8" ? "libvpx" : "libvpx-vp9";
        const crf = getCrfForVideoQuality(options.videoQuality, codec);

        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...vfArgs,
          ...fpsArgs,
          "-c:v",
          codec,
          "-crf",
          crf,
          "-b:v",
          "0",
          "-deadline",
          "realtime",
          "-cpu-used",
          "5",
          ...buildVideoAudioArgs(options, "libopus", "128k"),
          outputPath,
        ];
      }

      case "avi":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...vfArgs,
          ...fpsArgs,
          "-c:v",
          "mpeg4",
          "-q:v",
          options.videoQuality === "high"
            ? "4"
            : options.videoQuality === "small"
            ? "10"
            : "7",
          ...(options.muteAudio
            ? ["-an"]
            : [
                "-c:a",
                "libmp3lame",
                ...(options.audioBitrate ? ["-b:a", options.audioBitrate] : ["-q:a", "4"]),
                ...(options.audioSampleRate ? ["-ar", options.audioSampleRate] : []),
                ...(options.audioChannels ? ["-ac", options.audioChannels] : []),
              ]),
          outputPath,
        ];

      case "wmv":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...vfArgs,
          ...fpsArgs,
          "-c:v",
          "wmv2",
          ...(options.muteAudio
            ? ["-an"]
            : [
                "-c:a",
                "wmav2",
                ...(options.audioBitrate ? ["-b:a", options.audioBitrate] : []),
                ...(options.audioSampleRate ? ["-ar", options.audioSampleRate] : []),
                ...(options.audioChannels ? ["-ac", options.audioChannels] : []),
              ]),
          outputPath,
        ];

      case "flv":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...vfArgs,
          ...fpsArgs,
          "-c:v",
          "flv",
          ...(options.muteAudio
            ? ["-an"]
            : [
                "-c:a",
                "libmp3lame",
                ...(options.audioBitrate ? ["-b:a", options.audioBitrate] : []),
                ...(options.audioSampleRate ? ["-ar", options.audioSampleRate] : []),
                ...(options.audioChannels ? ["-ac", options.audioChannels] : []),
              ]),
          outputPath,
        ];

      case "mpg":
      case "mpeg":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...vfArgs,
          ...fpsArgs,
          "-c:v",
          "mpeg2video",
          "-q:v",
          options.videoQuality === "high"
            ? "4"
            : options.videoQuality === "small"
            ? "10"
            : "7",
          ...(options.muteAudio
            ? ["-an"]
            : [
                "-c:a",
                "mp2",
                ...(options.audioSampleRate ? ["-ar", options.audioSampleRate] : []),
                ...(options.audioChannels ? ["-ac", options.audioChannels] : []),
              ]),
          outputPath,
        ];

      case "3gp":
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...vfArgs,
          ...fpsArgs,
          "-c:v",
          "h263",
          ...(options.muteAudio
            ? ["-an"]
            : ["-c:a", "aac", "-ar", "8000", "-ac", "1"]),
          outputPath,
        ];

      default:
        return null;
    }
  }

  if (IMAGE_FORMATS.has(target)) {
    switch (target) {
      case "gif": {
        const gifFilter = buildGifFilters(options);
        return [...inputArgs, ...extraOutputArgs, "-vf", gifFilter, outputPath];
      }

      case "png": {
        const filters = buildImageFilters(options);
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...(filters.length ? ["-vf", filters.join(",")] : []),
          "-frames:v",
          "1",
          outputPath,
        ];
      }

      case "jpg": {
        const filters = buildImageFilters(options);
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...(filters.length ? ["-vf", filters.join(",")] : []),
          "-frames:v",
          "1",
          ...(options.imageQuality ? ["-q:v", getJpgQValue(options.imageQuality)] : []),
          outputPath,
        ];
      }

      case "webp": {
        const filters = buildImageFilters(options);
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...(filters.length ? ["-vf", filters.join(",")] : []),
          "-frames:v",
          "1",
          "-compression_level",
          "6",
          "-quality",
          getWebpQuality(options.imageQuality),
          outputPath,
        ];
      }

      case "bmp":
      case "tiff": {
        const filters = buildImageFilters(options);
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...(filters.length ? ["-vf", filters.join(",")] : []),
          "-frames:v",
          "1",
          outputPath,
        ];
      }

      case "ico": {
        const filters = buildIcoFilters(options);
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...(filters.length ? ["-vf", filters.join(",")] : []),
          "-frames:v",
          "1",
          ...buildIcoPixelFormatArgs(options.iconBitDepth),
          outputPath,
        ];
      }

      case "avif": {
        const filters = buildImageFilters(options);
        return [
          ...inputArgs,
          ...extraOutputArgs,
          ...(filters.length ? ["-vf", filters.join(",")] : []),
          "-frames:v",
          "1",
          "-c:v",
          "libaom-av1",
          "-still-picture",
          "1",
          "-crf",
          getAvifQuality(options.imageQuality),
          outputPath,
        ];
      }

      default:
        return null;
    }
  }

  return null;
}

app.get("/", (req, res) => {
  res.send("Converto API running");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "converto-server",
    ffmpegPath: ffmpegInstaller.path,
    uptimeSeconds: Math.round(process.uptime()),
    maxUploadMb: 1000,
    targets: {
      audio: Array.from(AUDIO_FORMATS),
      video: Array.from(VIDEO_FORMATS),
      image: Array.from(IMAGE_FORMATS),
    },
  });
});

app.post("/convert", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const startedAt = Date.now();
  const entitlement = getEntitlementFromRequest(req);

  const target = normalizeTarget(req.body?.target);
  const originalName = req.file.originalname || "";
  const inputExt = detectInputExt(originalName);
  const inputPath = req.file.path;
  const outputPath = `${inputPath}.${target}`;
  const downloadName = buildOutputName(originalName, target);

  if (!target) {
    cleanupFiles(inputPath);
    return res.status(400).json({ error: "Target format is required." });
  }

  if (!isSupportedTarget(target)) {
    cleanupFiles(inputPath);
    return res.status(400).json({ error: "Unsupported target format." });
  }

  if (inputExt && inputExt === target) {
    cleanupFiles(inputPath);
    return res
      .status(400)
      .json({ error: "Input and output formats are the same." });
  }

  const options = parseConversionOptions(req.body, target);
  const optionError = validateOptions(options, target, entitlement);

  if (optionError) {
    cleanupFiles(inputPath);
    return res.status(400).json({ error: optionError });
  }

  const ffmpegArgs = buildFfmpegArgs(inputPath, target, outputPath, options);

  if (!ffmpegArgs) {
    cleanupFiles(inputPath);
    return res
      .status(400)
      .json({ error: "This conversion path is not supported yet." });
  }

  console.log("Starting conversion:", {
    tier: entitlement.tier,
    from: inputExt || "unknown",
    to: target,
    file: originalName,
    sizeMB: Number((req.file.size / (1024 * 1024)).toFixed(2)),
    trimStart: options.trimStart,
    trimEnd: options.trimEnd,
    audioBitrate: options.audioBitrate,
    audioSampleRate: options.audioSampleRate,
    audioChannels: options.audioChannels,
    videoResolution: options.videoResolution,
    videoCodec: options.videoCodec,
    videoQuality: options.videoQuality,
    videoFps: options.videoFps,
    imageWidth: options.imageWidth,
    imageHeight: options.imageHeight,
    imageQuality: options.imageQuality,
    iconSize: options.iconSize,
    iconBitDepth: options.iconBitDepth,
    muteAudio: options.muteAudio,
  });

  const ffmpeg = spawn(ffmpegInstaller.path, ["-y", ...ffmpegArgs], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  let ffmpegErrorLog = "";
  let cleanedUp = false;

  const finalizeCleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    cleanupFiles(inputPath, outputPath);
  };

  ffmpeg.stderr.on("data", (data) => {
    ffmpegErrorLog += data.toString();
  });

  ffmpeg.on("error", (error) => {
    console.error("FFmpeg spawn error:", error);
    finalizeCleanup();

    if (!res.headersSent) {
      return res.status(500).json({ error: "FFmpeg could not be started." });
    }
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0) {
      console.error("FFmpeg exit code:", code);
      console.error(ffmpegErrorLog);
      finalizeCleanup();

      if (!res.headersSent) {
        return res.status(500).json({ error: "Conversion failed." });
      }
      return;
    }

    fs.stat(outputPath, (statErr, stats) => {
      if (statErr || !stats || stats.size <= 0) {
        console.error("Output file missing or empty:", statErr);
        finalizeCleanup();

        if (!res.headersSent) {
          return res
            .status(500)
            .json({ error: "Conversion output could not be prepared." });
        }
        return;
      }

      const mimeType = MIME_MAP[target] || "application/octet-stream";

      res.setHeader("Content-Type", mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${downloadName}"`
      );
      res.setHeader("Content-Length", String(stats.size));

      const stream = fs.createReadStream(outputPath);

      stream.on("error", (streamErr) => {
        console.error("Stream error:", streamErr);
        finalizeCleanup();

        if (!res.headersSent) {
          return res.status(500).json({ error: "File streaming failed." });
        }

        try {
          res.end();
        } catch (_) {}
      });

      res.on("finish", () => {
        const durationMs = Date.now() - startedAt;
        console.log("Conversion finished:", {
          tier: entitlement.tier,
          from: inputExt || "unknown",
          to: target,
          file: originalName,
          durationMs,
          durationSec: Number((durationMs / 1000).toFixed(2)),
        });
        finalizeCleanup();
      });

      res.on("close", () => {
        finalizeCleanup();
      });

      stream.pipe(res);
    });
  });
});

app.use((err, req, res, next) => {
  if (req?.file?.path) {
    cleanupFiles(req.file.path);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File is too large. Max 1000MB." });
    }

    return res.status(400).json({ error: err.message });
  }

  console.error("Unexpected server error:", err);
  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});