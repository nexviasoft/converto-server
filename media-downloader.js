"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { inspectPlatformMedia } = require("./media-inspector");

const execFileAsync = promisify(execFile);

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_DURATION = 60;

async function downloadXMedia(inputUrl, formatId, options = {}) {
  if (typeof inputUrl !== "string" || inputUrl.length > 2048) {
    throw new Error("Invalid media URL.");
  }

  let url;

  try {
    url = new URL(inputUrl);
  } catch {
    throw new Error("Invalid media URL.");
  }

  const allowedHosts = new Set([
    "x.com", "www.x.com",
    "twitter.com", "www.twitter.com"
  ]);

  if (
    url.protocol !== "https:" ||
    !allowedHosts.has(url.hostname.toLowerCase()) ||
    url.port ||
    url.username ||
    url.password
  ) {
    throw new Error("Only HTTPS X post links are supported.");
  }

  const match =
    /^\/([a-z0-9_]{1,15})\/status\/(\d+)\/?$/i.exec(url.pathname);

  if (!match) {
    throw new Error("Invalid X post.");
  }

  const canonicalUrl =
    `https://x.com/${match[1]}/status/${match[2]}`;

  if (options.signal?.aborted) {
    throw new Error("Download cancelled.");
  }

  const metadata = await inspectPlatformMedia(canonicalUrl, { signal: options.signal });

  if (options.signal?.aborted) {
    throw new Error("Download cancelled.");
  }

  if (
    metadata.provider !== "x" ||
    !Number.isFinite(metadata.durationSeconds) ||
    metadata.durationSeconds <= 0 ||
    metadata.durationSeconds > MAX_DURATION
  ) {
    throw new Error("Video exceeds the duration limit.");
  }

  const selected = metadata.formats.find(f =>
    f.id === formatId &&
    /^http-\d{1,8}$/.test(f.id) &&
    f.ext === "mp4" &&
    f.kind === "combined"
  );

  if (!selected) {
    throw new Error("Requested MP4 quality is unavailable.");
  }

  const python = process.env.CONVERTO_YTDLP_PYTHON;

  if (!python) {
    throw new Error("Python extractor is not configured.");
  }

  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "converto-pro-")
  );

  const outputPath = path.join(tempDir, "video.mp4");
  const controller = new AbortController();

  let exceededLimit = false;
  let checkingSize = false;

  const cancel = () => controller.abort();

  if (options.signal?.aborted) cancel();

  options.signal?.addEventListener("abort", cancel, {
    once: true
  });

  const monitor = setInterval(async () => {
    if (checkingSize || controller.signal.aborted) return;

    checkingSize = true;

    try {
      const files = await fs.readdir(tempDir);
      let totalBytes = 0;

      for (const name of files) {
        const stat = await fs.stat(
          path.join(tempDir, name)
        ).catch(() => null);

        if (stat?.isFile()) {
          totalBytes += stat.size;
        }
      }

      if (totalBytes > MAX_BYTES) {
        exceededLimit = true;
        controller.abort();
      }
    } catch {
      // Temporary files may disappear during cleanup.
    } finally {
      checkingSize = false;
    }
  }, 100);

  try {
    await execFileAsync(python, [
      "-m", "yt_dlp",
      "--ignore-config",
      "--no-playlist",
      "--no-cache-dir",
      "--no-part",
      "--no-progress",
      "--js-runtimes", "node",
      "--max-filesize", "12M",
      "--match-filter", "duration <= 60",
      "--socket-timeout", "15",
      "--retries", "0",
      "-f", selected.id,
      "-o", outputPath,
      "--", canonicalUrl
    ], {
      signal: controller.signal,
      timeout: 60000,
      killSignal: "SIGKILL",
      maxBuffer: 512 * 1024,
      windowsHide: true
    });

    if (exceededLimit) {
      throw new Error("Download size limit exceeded.");
    }

    const stat = await fs.stat(outputPath);

    if (stat.size <= 0 || stat.size > MAX_BYTES) {
      throw new Error("Invalid downloaded file size.");
    }

    return {
      outputPath,
      tempDir,
      bytes: stat.size,
      formatId: selected.id
    };
  } catch (error) {
    await fs.rm(tempDir, {
      recursive: true,
      force: true
    }).catch(() => {});

    if (exceededLimit) {
      throw new Error("12 MB download limit exceeded.");
    }

    throw error;
  } finally {
    clearInterval(monitor);
    options.signal?.removeEventListener("abort", cancel);
  }
}

module.exports = { downloadXMedia };
