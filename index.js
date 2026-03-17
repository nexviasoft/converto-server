const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");

const app = express();

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json());

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 100 * 1024 * 1024,
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
  for (const p of paths) safeUnlink(p);
}

function normalizeTarget(value) {
  return String(value || "").trim().toLowerCase();
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

function buildFfmpegArgs(inputPath, target, outputPath) {
  if (AUDIO_FORMATS.has(target)) {
    switch (target) {
      case "mp3":
        return [
          "-i", inputPath,
          "-vn",
          "-codec:a", "libmp3lame",
          "-q:a", "3",
          outputPath,
        ];

      case "wav":
        return [
          "-i", inputPath,
          "-vn",
          "-c:a", "pcm_s16le",
          outputPath,
        ];

      case "m4a":
      case "aac":
        return [
          "-i", inputPath,
          "-vn",
          "-c:a", "aac",
          "-b:a", "160k",
          outputPath,
        ];

      case "ogg":
        return [
          "-i", inputPath,
          "-vn",
          "-c:a", "libvorbis",
          "-q:a", "4",
          outputPath,
        ];

      case "opus":
        return [
          "-i", inputPath,
          "-vn",
          "-c:a", "libopus",
          "-b:a", "128k",
          outputPath,
        ];

      case "flac":
        return [
          "-i", inputPath,
          "-vn",
          "-c:a", "flac",
          outputPath,
        ];

      case "aiff":
        return [
          "-i", inputPath,
          "-vn",
          "-c:a", "pcm_s16be",
          outputPath,
        ];

      case "wma":
        return [
          "-i", inputPath,
          "-vn",
          "-c:a", "wmav2",
          "-b:a", "160k",
          outputPath,
        ];

      case "amr":
        return [
          "-i", inputPath,
          "-vn",
          "-c:a", "libopencore_amrnb",
          "-ar", "8000",
          "-ac", "1",
          "-b:a", "12.2k",
          outputPath,
        ];

      default:
        return null;
    }
  }

  if (VIDEO_FORMATS.has(target)) {
    switch (target) {
      case "mp4":
      case "mov":
      case "mkv":
      case "m4v":
        return [
          "-i", inputPath,
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "26",
          "-c:a", "aac",
          "-b:a", "128k",
          ...(target === "mp4" ? ["-movflags", "+faststart"] : []),
          outputPath,
        ];

      case "webm":
        return [
          "-i", inputPath,
          "-c:v", "libvpx-vp9",
          "-crf", "36",
          "-b:v", "0",
          "-deadline", "realtime",
          "-cpu-used", "5",
          "-c:a", "libopus",
          "-b:a", "128k",
          outputPath,
        ];

      case "avi":
        return [
          "-i", inputPath,
          "-c:v", "mpeg4",
          "-q:v", "7",
          "-c:a", "libmp3lame",
          "-q:a", "4",
          outputPath,
        ];

      case "wmv":
        return [
          "-i", inputPath,
          "-c:v", "wmv2",
          "-c:a", "wmav2",
          outputPath,
        ];

      case "flv":
        return [
          "-i", inputPath,
          "-c:v", "flv",
          "-c:a", "libmp3lame",
          outputPath,
        ];

      case "mpg":
      case "mpeg":
        return [
          "-i", inputPath,
          "-c:v", "mpeg2video",
          "-q:v", "7",
          "-c:a", "mp2",
          outputPath,
        ];

      case "3gp":
        return [
          "-i", inputPath,
          "-c:v", "h263",
          "-c:a", "aac",
          "-ar", "8000",
          "-ac", "1",
          outputPath,
        ];

      default:
        return null;
    }
  }

  if (IMAGE_FORMATS.has(target)) {
    switch (target) {
      case "gif":
        return [
          "-i", inputPath,
          "-vf", "fps=10,scale=iw:-1:flags=lanczos",
          outputPath,
        ];

      case "png":
      case "jpg":
      case "webp":
      case "bmp":
      case "tiff":
      case "ico":
      case "avif":
        return [
          "-i", inputPath,
          "-frames:v", "1",
          outputPath,
        ];

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
  });
});

app.post("/convert", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const startedAt = Date.now();
  const target = normalizeTarget(req.body.target);
  const originalName = req.file.originalname || "";
  const inputExt = detectInputExt(originalName);
  const inputPath = req.file.path;
  const outputPath = `${inputPath}.${target}`;
  const downloadName = buildOutputName(originalName, target);

  if (!isSupportedTarget(target)) {
    cleanupFiles(inputPath);
    return res.status(400).json({ error: "Unsupported target format." });
  }

  if (inputExt && inputExt === target) {
    cleanupFiles(inputPath);
    return res.status(400).json({ error: "Input and output formats are the same." });
  }

  const ffmpegArgs = buildFfmpegArgs(inputPath, target, outputPath);

  if (!ffmpegArgs) {
    cleanupFiles(inputPath);
    return res.status(400).json({ error: "This conversion path is not supported yet." });
  }

  console.log("Starting conversion:", {
    from: inputExt || "unknown",
    to: target,
    file: originalName,
    sizeMB: Number((req.file.size / (1024 * 1024)).toFixed(2)),
  });

  const ffmpeg = spawn(ffmpegInstaller.path, ["-y", ...ffmpegArgs], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  let ffmpegErrorLog = "";
  let responseFinished = false;

  ffmpeg.stderr.on("data", (data) => {
    ffmpegErrorLog += data.toString();
  });

  ffmpeg.on("error", (error) => {
    console.error("FFmpeg spawn error:", error);
    cleanupFiles(inputPath, outputPath);

    if (!res.headersSent) {
      return res.status(500).json({ error: "FFmpeg could not be started." });
    }
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0) {
      console.error("FFmpeg exit code:", code);
      console.error(ffmpegErrorLog);
      cleanupFiles(inputPath, outputPath);

      if (!res.headersSent) {
        return res.status(500).json({ error: "Conversion failed." });
      }
      return;
    }

    const mimeType = MIME_MAP[target] || "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);

    const stream = fs.createReadStream(outputPath);

    const finalizeCleanup = () => {
      if (responseFinished) return;
      responseFinished = true;

      const durationMs = Date.now() - startedAt;
      console.log("Conversion finished:", {
        from: inputExt || "unknown",
        to: target,
        file: originalName,
        durationMs,
        durationSec: Number((durationMs / 1000).toFixed(2)),
      });

      cleanupFiles(inputPath, outputPath);
    };

    stream.on("error", (streamErr) => {
      console.error("Stream error:", streamErr);
      cleanupFiles(inputPath, outputPath);

      if (!res.headersSent) {
        return res.status(500).json({ error: "File streaming failed." });
      }

      res.end();
    });

    res.on("close", finalizeCleanup);
    res.on("finish", finalizeCleanup);

    stream.pipe(res);
  });
});

app.use((err, req, res, next) => {
  if (req?.file?.path) {
    cleanupFiles(req.file.path);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File is too large. Max 100MB." });
    }
    return res.status(400).json({ error: err.message });
  }

  console.error("Unexpected server error:", err);
  return res.status(500).json({ error: "Unexpected server error." });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});