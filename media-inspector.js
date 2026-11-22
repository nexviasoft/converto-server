"use strict";

const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { describeMediaLink } = require("./media-providers");

const execFileAsync = promisify(execFile);

function mediaError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sanitizeMetadata(raw, provider) {
  const formats = (Array.isArray(raw.formats) ? raw.formats : [])
    .filter(f => f && ["mp4", "webm", "m4a"].includes(f.ext))
    .slice(0, 80)
    .map(f => ({
      id: String(f.format_id || ""),
      ext: f.ext,
      width: Number(f.width) || null,
      height: Number(f.height) || null,
      fps: Number(f.fps) || null,
      bitrateKbps: Number(f.tbr) || null,
      kind: f.vcodec === "none"
        ? "audio"
        : f.acodec === "none"
          ? "video"
          : "combined"
    }));

  return {
    provider,
    title: String(raw.title || "Untitled").slice(0, 250),
    durationSeconds: Number.isFinite(raw.duration)
      ? raw.duration
      : null,
    formats,
    downloadReady: false
  };
}

async function inspectPlatformMedia(url) {
  if (typeof url !== "string" || url.length > 2048) {
    throw mediaError(400, "INVALID_URL", "Invalid media URL.");
  }

  const link = describeMediaLink(url);

  const allowed =
    (link.provider === "youtube" &&
      ["video", "short"].includes(link.mediaKind)) ||
    (link.provider === "x" && link.mediaKind === "post");

  if (!allowed) {
    throw mediaError(
      422,
      "PROVIDER_NOT_ENABLED",
      "This provider or link type is not enabled yet."
    );
  }

  const python = process.env.CONVERTO_YTDLP_PYTHON;

  if (!python) {
    throw mediaError(
      503,
      "EXTRACTOR_NOT_CONFIGURED",
      "Media inspection is not configured."
    );
  }

  let stdout;

  try {
    const result = await execFileAsync(
      python,
      [
        "-m", "yt_dlp",
        "--ignore-config",
        "--no-playlist",
        "--skip-download",
        "--dump-single-json",
        "--js-runtimes", "node",
        "--socket-timeout", "10",
        "--retries", "0",
        link.url
      ],
      {
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true
      }
    );

    stdout = result.stdout;
  } catch {
    throw mediaError(
      502,
      "EXTRACTION_FAILED",
      "Media information could not be retrieved."
    );
  }

  try {
    return sanitizeMetadata(JSON.parse(stdout), link.provider);
  } catch {
    throw mediaError(
      502,
      "INVALID_MEDIA_METADATA",
      "Invalid media information returned."
    );
  }
}

module.exports = {
  inspectPlatformMedia,
  sanitizeMetadata
};
