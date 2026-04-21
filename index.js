const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const archiver = require("archiver");
const { PDFDocument } = require("pdf-lib");

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

// Frontend'deki PDF_TO_IMAGE_TARGETS ile eşleşen set
const PDF_TO_IMAGE_FORMATS = new Set(["png", "jpg", "webp"]);

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

function getFirstHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getUserTier(userId) {
  const normalizedUserId = String(getFirstHeaderValue(userId) || "").trim();

  if (normalizedUserId === "user_3Bfa3QpE3MCJzYTIIvMkFJlFmwo") {
    return "pro";
  }

  return "free";
}

function safeUnlink(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

function cleanupFiles(...paths) {
  for (const p of paths) {
    safeUnlink(p);
  }
}

function parsePdfPageRange(input, maxPages) {
  if (!input || typeof input !== "string") {
    throw new Error("Page range is required.");
  }

  const parts = input.split(",");
  const pages = new Set();

  for (const rawPart of parts) {
    const part = String(rawPart || "").trim();
    if (!part) continue;

    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-").map((v) => v.trim());
      const start = Number(startRaw);
      const end = Number(endRaw);

      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error(`Invalid range: ${part}`);
      }

      if (start < 1 || end < 1 || start > end) {
        throw new Error(`Invalid range: ${part}`);
      }

      for (let i = start; i <= end; i += 1) {
        if (i > maxPages) {
          throw new Error(`Page ${i} exceeds PDF page count (${maxPages}).`);
        }
        pages.add(i - 1);
      }
    } else {
      const page = Number(part);

      if (!Number.isInteger(page) || page < 1) {
        throw new Error(`Invalid page: ${part}`);
      }

      if (page > maxPages) {
        throw new Error(`Page ${page} exceeds PDF page count (${maxPages}).`);
      }

      pages.add(page - 1);
    }
  }

  const ordered = Array.from(pages).sort((a, b) => a - b);

  if (!ordered.length) {
    throw new Error("No valid pages selected.");
  }

  return ordered;
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

function isAudioSupportedTarget(target) {
  return AUDIO_FORMATS.has(target) || VIDEO_FORMATS.has(target);
}

function isVideoSupportedTarget(target) {
  return VIDEO_FORMATS.has(target);
}

function isImageSupportedTarget(target) {
  return IMAGE_FORMATS.has(target);
}

function isGifTarget(target) {
  return target === "gif";
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

function timeToSeconds(value) {
  if (!value) return null;

  const raw = String(value).trim();

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

function isTruthy(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();

  return v === "true" || v === "1" || v === "yes" || v === "on";
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

function parseConversionOptions(body = {}, target = "") {
  const trimEnabled = isTruthy(body.trimEnabled);

  const trimStart = trimEnabled
    ? normalizeTimeValue(body.trimStart || body.startTime)
    : null;

  const trimEnd = trimEnabled
    ? normalizeTimeValue(body.trimEnd || body.endTime)
    : null;

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
    trimEnabled,
    trimStart,
    trimEnd,
    trimStartSeconds: trimStart ? timeToSeconds(trimStart) : null,
    trimEndSeconds: trimEnd ? timeToSeconds(trimEnd) : null,
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

function sanitizeOptionsForTarget(options, target) {
  const sanitized = { ...options };

  const audioSupported = isAudioSupportedTarget(target);
  const videoSupported = isVideoSupportedTarget(target);
  const imageSupported = isImageSupportedTarget(target);
  const gifTarget = isGifTarget(target);
  const imageResizeSupported = imageSupported;
  const imageQualitySupported = ["jpg", "webp", "avif"].includes(target);
  const iconSupported = target === "ico";
  const trimSupported = audioSupported || videoSupported || gifTarget;

  if (!audioSupported) {
    sanitized.audioBitrate = null;
    sanitized.audioSampleRate = null;
    sanitized.audioChannels = null;
  }

  if (!videoSupported && !gifTarget) {
    sanitized.videoResolution = null;
    sanitized.videoCodec = null;
    sanitized.videoQuality = null;
    sanitized.videoFps = null;
  }

  if (!videoSupported) {
    sanitized.muteAudio = false;
  }

  if (!imageResizeSupported) {
    sanitized.imageWidth = null;
    sanitized.imageHeight = null;
  }

  if (!imageQualitySupported) {
    sanitized.imageQuality = null;
  }

  if (!iconSupported) {
    sanitized.iconSize = null;
    sanitized.iconBitDepth = null;
  }

  if (!trimSupported) {
    sanitized.trimEnabled = false;
    sanitized.trimStart = null;
    sanitized.trimEnd = null;
    sanitized.trimStartSeconds = null;
    sanitized.trimEndSeconds = null;
  }

  return sanitized;
}

function validateOptions(options, target, entitlement = { isPro: false }) {
  if (options.trimEnabled) {
    if (!options.trimStart || !options.trimEnd) {
      return "Trim start and trim end are required when trim is enabled.";
    }

    if (!isValidTimeValue(options.trimStart)) {
      return "Invalid trim start value.";
    }

    if (!isValidTimeValue(options.trimEnd)) {
      return "Invalid trim end value.";
    }

    if (
      !Number.isFinite(options.trimStartSeconds) ||
      !Number.isFinite(options.trimEndSeconds)
    ) {
      return "Trim values could not be parsed.";
    }

    if (options.trimStartSeconds < 0 || options.trimEndSeconds < 0) {
      return "Trim values must be positive.";
    }

    if (options.trimEndSeconds <= options.trimStartSeconds) {
      return "Trim end must be greater than trim start.";
    }

    if (IMAGE_FORMATS.has(target) && target !== "gif") {
      return "Trim is only supported for audio, video, and GIF conversions.";
    }
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
    getFirstHeaderValue(req.headers["x-user-tier"]),
    getFirstHeaderValue(req.headers["x-plan-tier"]),
    getFirstHeaderValue(req.headers["x-tier"]),
    getFirstHeaderValue(req.headers["x-entitlement-tier"]),
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
    isTruthy(getFirstHeaderValue(req.headers["x-user-pro"])) ||
    isTruthy(getFirstHeaderValue(req.headers["x-is-pro"]));

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

function resolveEntitlement(req) {
  const requestEntitlement = getEntitlementFromRequest(req);
  const userId = getFirstHeaderValue(req.headers["x-user-id"]);
  const serverTier = getUserTier(userId);

  if (serverTier === "pro") {
    return {
      tier: "pro",
      isPro: true,
      source: "server-user-tier",
    };
  }

  return {
    ...requestEntitlement,
    source: requestEntitlement.isPro ? "request-tier" : "default-free",
  };
}

function buildTrimArgs(options) {
  if (!options.trimEnabled) {
    return {
      inputPrefixArgs: [],
      outputTimingArgs: [],
    };
  }

  const start = options.trimStartSeconds;
  const end = options.trimEndSeconds;

  if (Number.isFinite(start) && Number.isFinite(end)) {
    const duration = Math.max(0, end - start);

    return {
      inputPrefixArgs: ["-ss", String(start)],
      outputTimingArgs: ["-t", String(duration)],
    };
  }

  if (Number.isFinite(start)) {
    return {
      inputPrefixArgs: ["-ss", String(start)],
      outputTimingArgs: [],
    };
  }

  if (Number.isFinite(end)) {
    return {
      inputPrefixArgs: [],
      outputTimingArgs: ["-to", String(end)],
    };
  }

  return {
    inputPrefixArgs: [],
    outputTimingArgs: [],
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

function buildVideoFpsArgs(options) {
  if (!options.videoFps) return [];
  return ["-r", options.videoFps];
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
  const trimArgs = buildTrimArgs(options);
  const inputArgs = [...trimArgs.inputPrefixArgs, "-i", inputPath];
  const extraOutputArgs = [...trimArgs.outputTimingArgs];

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
    const fpsArgs = buildVideoFpsArgs(options);

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
          ...(options.muteAudio
            ? ["-an"]
            : [
                "-c:a",
                "libopus",
                "-b:a",
                options.audioBitrate || "128k",
                "-ar",
                options.audioSampleRate || "48000",
                ...(options.audioChannels ? ["-ac", options.audioChannels] : []),
              ]),
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

function runFfmpegConversion(inputPath, target, outputPath, options) {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = buildFfmpegArgs(inputPath, target, outputPath, options);

    if (!ffmpegArgs) {
      reject(new Error("This conversion path is not supported yet."));
      return;
    }

    const ffmpeg = spawn(ffmpegInstaller.path, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      ...ffmpegArgs,
    ]);

    let stderr = "";

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `FFmpeg exited with code ${code}`));
      }
    });
  });
}

// ─── PDF sayfasını FFmpeg ile image'a dönüştür ───────────────────────────────
// mutool (mupdf-tools) ile PDF sayfasını raster PNG'ye çevirir,
// ardından isteğe göre JPG/WEBP'e dönüştürür.
function renderPdfPageWithFfmpeg(inputPath, pageIndex, outputPath, targetFmt) {
  return new Promise((resolve, reject) => {
    // FFmpeg'in PDF decoder'ı (libgs / Ghostscript) gerektirir.
    // Render için sayfa seçimi: -page_index flag'i ile.
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-vf",
      `select=eq(n\\,${pageIndex})`,
      "-frames:v",
      "1",
    ];

    if (targetFmt === "jpg") {
      args.push("-q:v", "3");
    } else if (targetFmt === "webp") {
      args.push("-quality", "92");
    }

    args.push(outputPath);

    const ffmpeg = spawn(ffmpegInstaller.path, args);
    let stderr = "";

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `FFmpeg exited with code ${code}`));
      }
    });
  });
}

function createBatchZipName(target) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `converto_batch_${target}_${stamp}.zip`;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "converto-server",
    message: "FFmpeg conversion backend is running.",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "converto-server",
    ffmpegPath: ffmpegInstaller.path,
    uploadDir,
    supportedTargets: [
      ...Array.from(AUDIO_FORMATS),
      ...Array.from(VIDEO_FORMATS),
      ...Array.from(IMAGE_FORMATS),
    ],
  });
});

// ─── /pdf/split (mevcut, korundu) ────────────────────────────────────────────
app.post("/pdf/split", upload.single("file"), async (req, res) => {
  const file = req.file;
  const range = String(req.body?.range || "").trim();

  if (!file) {
    return res.status(400).json({ error: "PDF file is required." });
  }

  if (!range) {
    cleanupFiles(file.path);
    return res.status(400).json({ error: "Page range is required." });
  }

  try {
    const pdfBytes = fs.readFileSync(file.path);
    const originalPdf = await PDFDocument.load(pdfBytes);
    const totalPages = originalPdf.getPageCount();

    const selectedPages = parsePdfPageRange(range, totalPages);

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(originalPdf, selectedPages);

    copiedPages.forEach((page) => newPdf.addPage(page));

    const newPdfBytes = await newPdf.save();

    const outputPath = path.join(uploadDir, `split_${Date.now()}.pdf`);
    fs.writeFileSync(outputPath, newPdfBytes);

    const baseName = (file.originalname || "document").replace(/\.pdf$/i, "");
    const downloadName = `${baseName}-split.pdf`;

    res.download(outputPath, downloadName, () => {
      cleanupFiles(file.path, outputPath);
    });
  } catch (error) {
    console.error("Split PDF error:", error);
    cleanupFiles(file.path);
    return res.status(400).json({
      error: error?.message || "Split PDF failed.",
    });
  }
});

// ─── /pdf/to-images (YENİ — frontend'deki /pdf/to-images endpoint'i) ─────────
// Frontend: POST ${API_URL}/pdf/to-images
// FormData: file (PDF), target (png | jpg | webp)
// Yanıt: Tek sayfalıysa doğrudan image dosyası,
//         çok sayfalıysa ZIP (her sayfa ayrı dosya)
app.post("/pdf/to-images", upload.single("file"), async (req, res) => {
  const file = req.file;
  const rawTarget = normalizeTarget(req.body?.target || "png");

  if (!file) {
    return res.status(400).json({ error: "PDF file is required." });
  }

  const isPdf =
    file.mimetype === "application/pdf" ||
    (file.originalname || "").toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    cleanupFiles(file.path);
    return res.status(400).json({ error: "Only PDF files are supported." });
  }

  if (!PDF_TO_IMAGE_FORMATS.has(rawTarget)) {
    cleanupFiles(file.path);
    return res
      .status(400)
      .json({ error: "Supported output formats: png, jpg, webp." });
  }

  const target = rawTarget; // "png" | "jpg" | "webp"
  const outputFiles = [];

  try {
    // pdf-lib ile sayfa sayısını al
    const pdfBytes = fs.readFileSync(file.path);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();

    if (pageCount === 0) {
      cleanupFiles(file.path);
      return res.status(400).json({ error: "PDF has no pages." });
    }

    const baseName = path.parse(file.originalname || "document").name;
    const stamp = Date.now();

    // Her sayfa için FFmpeg ile render et
    for (let i = 0; i < pageCount; i++) {
      const outputName = `pdf_page_${stamp}_${i + 1}.${target}`;
      const outputPath = path.join(uploadDir, outputName);

      await renderPdfPageWithFfmpeg(file.path, i, outputPath, target);

      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        outputFiles.push({ path: outputPath, name: `${baseName}-page-${i + 1}.${target}` });
      }
    }

    if (!outputFiles.length) {
      cleanupFiles(file.path);
      return res.status(500).json({ error: "No pages could be rendered." });
    }

    // Tek sayfa → doğrudan image döndür
    if (outputFiles.length === 1) {
      const single = outputFiles[0];
      const mime = MIME_MAP[target] || "application/octet-stream";

      res.setHeader("Content-Type", mime);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${single.name}"`
      );

      res.download(single.path, single.name, () => {
        cleanupFiles(file.path, single.path);
      });

      return;
    }

    // Çok sayfa → ZIP
    const zipName = `${baseName}-${target}-pages.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipName}"`
    );

    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("error", (err) => {
      console.error("PDF to image ZIP error:", err);
      cleanupFiles(file.path, ...outputFiles.map((f) => f.path));
      if (!res.headersSent) {
        res.status(500).json({ error: "ZIP creation failed." });
      } else {
        try { res.end(); } catch (_) {}
      }
    });

    res.on("finish", () => {
      cleanupFiles(file.path, ...outputFiles.map((f) => f.path));
    });

    res.on("close", () => {
      cleanupFiles(file.path, ...outputFiles.map((f) => f.path));
    });

    archive.pipe(res);

    for (const entry of outputFiles) {
      archive.file(entry.path, { name: entry.name });
    }

    await archive.finalize();
  } catch (error) {
    console.error("PDF to image error:", error);
    cleanupFiles(file.path, ...outputFiles.map((f) => f.path));

    if (!res.headersSent) {
      return res.status(500).json({
        error: error?.message || "PDF to image conversion failed.",
      });
    }
  }
});

// ─── /convert (mevcut, korundu) ──────────────────────────────────────────────
app.post("/convert", upload.single("file"), async (req, res) => {
  const startedAt = Date.now();
  const file = req.file;
  const target = normalizeTarget(req.body.target);
  const entitlement = resolveEntitlement(req);

  if (!file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  if (!target) {
    cleanupFiles(file.path);
    return res.status(400).json({ error: "Target format is required." });
  }

  if (!isSupportedTarget(target)) {
    cleanupFiles(file.path);
    return res.status(400).json({ error: "Unsupported target format." });
  }

  const originalName = file.originalname || "";
  const inputExt = detectInputExt(originalName);
  const inputPath = file.path;
  const outputPath = `${inputPath}.${target}`;
  const downloadName = buildOutputName(originalName, target);

  if (inputExt && inputExt === target) {
    cleanupFiles(inputPath);
    return res.status(400).json({
      error: "Input and output formats are the same.",
    });
  }

  const rawOptions = parseConversionOptions(req.body, target);
  const options = sanitizeOptionsForTarget(rawOptions, target);
  const optionError = validateOptions(options, target, entitlement);

  if (optionError) {
    cleanupFiles(inputPath);
    return res.status(400).json({ error: optionError });
  }

  console.log("Conversion request:", {
    tier: entitlement.tier,
    entitlementSource: entitlement.source,
    from: inputExt || "unknown",
    to: target,
    file: originalName,
    sizeMB: Number((file.size / (1024 * 1024)).toFixed(2)),
    trimEnabled: options.trimEnabled,
    trimStart: options.trimStart,
    trimEnd: options.trimEnd,
    audioBitrate: options.audioBitrate,
    audioSampleRate: options.audioSampleRate,
    audioChannels: options.audioChannels,
    videoResolution: options.videoResolution,
    videoCodec: options.videoCodec,
    videoQuality: options.videoQuality,
    videoFps: options.videoFps,
    muteAudio: options.muteAudio,
    imageWidth: options.imageWidth,
    imageHeight: options.imageHeight,
    imageQuality: options.imageQuality,
    iconSize: options.iconSize,
    iconBitDepth: options.iconBitDepth,
  });

  try {
    await runFfmpegConversion(inputPath, target, outputPath, options);

    const durationMs = Date.now() - startedAt;
    console.log("Conversion success:", {
      tier: entitlement.tier,
      entitlementSource: entitlement.source,
      from: inputExt || "unknown",
      to: target,
      file: originalName,
      sizeMB: Number((file.size / (1024 * 1024)).toFixed(2)),
      durationMs,
      durationSec: Number((durationMs / 1000).toFixed(2)),
    });

    res.setHeader(
      "Content-Type",
      MIME_MAP[target] || "application/octet-stream"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadName}"`
    );

    res.download(outputPath, downloadName, (err) => {
      cleanupFiles(inputPath, outputPath);

      if (err) {
        console.error("Download callback error:", err);
      }
    });
  } catch (error) {
    cleanupFiles(inputPath, outputPath);

    console.error("Conversion failed:", {
      tier: entitlement.tier,
      from: inputExt || "unknown",
      to: target,
      file: originalName,
      error: error.message,
    });

    return res.status(500).json({
      error: error.message || "Conversion failed.",
    });
  }
});

// ─── /convert/batch (YENİ PATH — frontend POST ${API_URL}/convert/batch) ─────
// Eski /batch-convert path'i de alias olarak korunuyor (geriye dönük uyumluluk)
async function handleBatchConvert(req, res) {
  const startedAt = Date.now();
  const files = Array.isArray(req.files) ? req.files : [];
  const target = normalizeTarget(req.body.target);
  const entitlement = resolveEntitlement(req);

  // Frontend: FREE_BATCH_DAILY_LIMIT = 5, sunucu da aynı sınırı uygular
  const FREE_BATCH_LIMIT = 5;

  if (!files.length) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  if (!entitlement.isPro && files.length > FREE_BATCH_LIMIT) {
    cleanupFiles(...files.map((f) => f.path));
    return res.status(403).json({
      error: `Free plan supports up to ${FREE_BATCH_LIMIT} files per batch. Upgrade to Pro for unlimited batch conversion.`,
    });
  }

  if (!target) {
    cleanupFiles(...files.map((f) => f.path));
    return res.status(400).json({ error: "Target format is required." });
  }

  if (!isSupportedTarget(target)) {
    cleanupFiles(...files.map((f) => f.path));
    return res.status(400).json({ error: "Unsupported target format." });
  }

  const rawOptions = parseConversionOptions(req.body, target);
  const options = sanitizeOptionsForTarget(rawOptions, target);
  const optionError = validateOptions(options, target, entitlement);

  if (optionError) {
    cleanupFiles(...files.map((f) => f.path));
    return res.status(400).json({ error: optionError });
  }

  const convertedEntries = [];
  const failedEntries = [];

  for (const file of files) {
    const originalName = file.originalname || "";
    const inputExt = detectInputExt(originalName);
    const inputPath = file.path;
    const outputPath = `${inputPath}.${target}`;
    const downloadName = buildOutputName(originalName, target);

    if (inputExt && inputExt === target) {
      failedEntries.push({
        file: originalName,
        reason: "Input and output formats are the same.",
      });
      cleanupFiles(inputPath);
      continue;
    }

    try {
      console.log("Starting batch item:", {
        tier: entitlement.tier,
        from: inputExt || "unknown",
        to: target,
        file: originalName,
        sizeMB: Number((file.size / (1024 * 1024)).toFixed(2)),
      });

      await runFfmpegConversion(inputPath, target, outputPath, options);

      convertedEntries.push({
        inputPath,
        outputPath,
        downloadName,
        originalName,
      });
    } catch (error) {
      console.error("Batch item failed:", originalName, error);
      failedEntries.push({
        file: originalName,
        reason: error.message || "Conversion failed.",
      });
      cleanupFiles(inputPath, outputPath);
    }
  }

  if (!convertedEntries.length) {
    cleanupFiles(...files.map((f) => f.path));
    return res.status(500).json({
      error: "All batch conversions failed.",
      failed: failedEntries,
    });
  }

  const zipName = createBatchZipName(target);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

  const archive = archiver("zip", {
    zlib: { level: 9 },
  });

  archive.on("error", (error) => {
    console.error("ZIP creation failed:", error);
    cleanupFiles(
      ...convertedEntries.flatMap((e) => [e.inputPath, e.outputPath])
    );

    if (!res.headersSent) {
      res.status(500).json({ error: "ZIP creation failed." });
    } else {
      try { res.end(); } catch (_) {}
    }
  });

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.log("Batch conversion finished:", {
      tier: entitlement.tier,
      target,
      successCount: convertedEntries.length,
      failedCount: failedEntries.length,
      durationMs,
      durationSec: Number((durationMs / 1000).toFixed(2)),
    });

    cleanupFiles(
      ...convertedEntries.flatMap((e) => [e.inputPath, e.outputPath])
    );
  });

  res.on("close", () => {
    cleanupFiles(
      ...convertedEntries.flatMap((e) => [e.inputPath, e.outputPath])
    );
  });

  archive.pipe(res);

  for (const entry of convertedEntries) {
    archive.file(entry.outputPath, { name: entry.downloadName });
  }

  if (failedEntries.length) {
    archive.append(JSON.stringify(failedEntries, null, 2), {
      name: "failed.json",
    });
  }

  await archive.finalize();
}

// Frontend'in kullandığı path: POST /convert/batch
app.post("/convert/batch", upload.array("files", 25), handleBatchConvert);

// Geriye dönük uyumluluk için eski path de çalışır
app.post("/batch-convert", upload.array("files", 25), handleBatchConvert);

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (req?.file?.path) {
    cleanupFiles(req.file.path);
  }

  if (Array.isArray(req?.files)) {
    cleanupFiles(...req.files.map((f) => f.path));
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File is too large. Max 1000MB." });
    }

    return res.status(400).json({ error: err.message });
  }

  if (err) {
    console.error("Unhandled error:", err);
  }

  return res.status(500).json({
    error: "Unexpected server error.",
  });
});

app.listen(PORT, () => {
  console.log(`Converto server running on port ${PORT}`);
  console.log(`FFmpeg path: ${ffmpegInstaller.path}`);
});