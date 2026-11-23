"use strict";

const express = require("express");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { downloadXMedia } = require("./media-downloader");

const router = express.Router();
let activeDownloads = 0;

function isAuthorized(expected, provided) {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);

  return (
    a.length >= 32 &&
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}

router.post("/download", async (req, res) => {
  if (process.env.CONVERTO_MEDIA_DOWNLOAD_ENABLED !== "true") {
    return res.status(403).json({
      code: "FEATURE_UNAVAILABLE",
      error: "Media download is disabled."
    });
  }

  const expected = process.env.CONVERTO_MEDIA_INSPECT_TOKEN || "";
  const provided = req.get("x-converto-test-key") || "";

  if (!isAuthorized(expected, provided)) {
    return res.status(401).json({
      code: "UNAUTHORIZED",
      error: "Test authorization required."
    });
  }

  const { url, formatId } = req.body || {};

  if (
    typeof url !== "string" ||
    typeof formatId !== "string" ||
    !/^http-\d{1,8}$/.test(formatId)
  ) {
    return res.status(400).json({
      code: "INVALID_REQUEST",
      error: "Valid URL and MP4 format are required."
    });
  }

  if (activeDownloads >= 1) {
    return res.status(429).json({
      code: "BUSY",
      error: "Another download is running."
    });
  }

  activeDownloads++;

  const controller = new AbortController();

  let tempDir = null;
  let released = false;

  const onDisconnect = () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };

  res.once("close", onDisconnect);

  async function release() {
    if (released) return;
    released = true;

    res.off("close", onDisconnect);
    activeDownloads--;

    if (tempDir) {
      await fs.rm(tempDir, {
        recursive: true,
        force: true
      }).catch(() => {});
    }
  }

  try {
    const result = await downloadXMedia(
      url,
      formatId,
      { signal: controller.signal }
    );

    tempDir = result.tempDir;

    if (controller.signal.aborted || res.destroyed) {
      await release();
      return;
    }

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "no-store");

    res.download(
      result.outputPath,
      "converto-video.mp4",
      (error) => {
        if (error) {
          console.warn(
            "Media transfer interrupted:",
            error.message
          );
        }

        void release();
      }
    );
  } catch (error) {
    console.error("Media download failed:", error.message);

    await release();

    if (
      !controller.signal.aborted &&
      !res.headersSent &&
      !res.destroyed
    ) {
      return res.status(422).json({
        code: "DOWNLOAD_FAILED",
        error: "MP4 download could not be completed."
      });
    }
  }
});

module.exports = router;
