const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffmpegPath = ffmpegInstaller.path;
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const app = express();

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

app.use(cors());
app.use(express.json());

const AUDIO_TARGETS = [
  "MP3",
  "WAV",
  "M4A",
  "AAC",
  "OGG",
  "OPUS",
  "FLAC",
  "AIFF",
  "WMA",
  "AMR",
];

const VIDEO_TARGETS = [
  "MP4",
  "WEBM",
  "MOV",
  "MKV",
  "AVI",
  "WMV",
  "FLV",
  "M4V",
  "MPG",
  "MPEG",
  "3GP",
];

const IMAGE_TARGETS = [
  "GIF",
  "PNG",
  "JPG",
  "WEBP",
  "BMP",
  "TIFF",
  "ICO",
  "AVIF",
];

const TARGETS = [...AUDIO_TARGETS, ...VIDEO_TARGETS, ...IMAGE_TARGETS];

function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

function detectInputType(filename = "") {
  const n = filename.toLowerCase();

  if (
    [
      ".mp3",
      ".wav",
      ".m4a",
      ".aac",
      ".ogg",
      ".opus",
      ".flac",
      ".aiff",
      ".aif",
      ".wma",
      ".amr",
    ].some((e) => n.endsWith(e))
  ) {
    return "audio";
  }

  if (
    [
      ".mp4",
      ".mov",
      ".mkv",
      ".avi",
      ".wmv",
      ".flv",
      ".mpg",
      ".mpeg",
      ".m4v",
      ".3gp",
      ".ts",
      ".mts",
      ".m2ts",
      ".webm",
    ].some((e) => n.endsWith(e))
  ) {
    return "video";
  }

  if (
    [
      ".gif",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".bmp",
      ".tiff",
      ".tif",
      ".ico",
      ".avif",
    ].some((e) => n.endsWith(e))
  ) {
    return "image";
  }

  return "unknown";
}

function getOutputExt(target) {
  return {
    MP3: "mp3",
    WAV: "wav",
    M4A: "m4a",
    AAC: "aac",
    OGG: "ogg",
    OPUS: "opus",
    FLAC: "flac",
    AIFF: "aiff",
    WMA: "wma",
    AMR: "amr",

    MP4: "mp4",
    WEBM: "webm",
    MOV: "mov",
    MKV: "mkv",
    AVI: "avi",
    WMV: "wmv",
    FLV: "flv",
    M4V: "m4v",
    MPG: "mpg",
    MPEG: "mpeg",
    "3GP": "3gp",

    GIF: "gif",
    PNG: "png",
    JPG: "jpg",
    WEBP: "webp",
    BMP: "bmp",
    TIFF: "tiff",
    ICO: "ico",
    AVIF: "avif",
  }[target];
}

function getTargetCategory(target) {
  if (AUDIO_TARGETS.includes(target)) return "audio";
  if (VIDEO_TARGETS.includes(target)) return "video";
  if (IMAGE_TARGETS.includes(target)) return "image";
  return "unknown";
}

function isConversionAllowed(inputType, target) {
  const targetCategory = getTargetCategory(target);

  if (inputType === "audio" && targetCategory === "audio") return true;

  if (inputType === "video" && targetCategory === "audio") return true;
  if (inputType === "video" && targetCategory === "video") return true;
  if (inputType === "video" && targetCategory === "image") return true;

  if (inputType === "image" && targetCategory === "image") return true;

  return false;
}

function buildFfmpegArgs({ inputPath, outputPath, target, inputType }) {
  switch (target) {
    /** AUDIO OUTPUTS */
    case "MP3":
      return ["-y", "-i", inputPath, "-vn", "-c:a", "libmp3lame", "-q:a", "3", outputPath];

    case "WAV":
      return ["-y", "-i", inputPath, "-vn", "-c:a", "pcm_s16le", outputPath];

    case "M4A":
      return ["-y", "-i", inputPath, "-vn", "-c:a", "aac", "-b:a", "128k", outputPath];

    case "AAC":
      return ["-y", "-i", inputPath, "-vn", "-c:a", "aac", "-b:a", "128k", outputPath];

    case "OGG":
      return ["-y", "-i", inputPath, "-vn", "-c:a", "libvorbis", "-q:a", "5", outputPath];

    case "OPUS":
      return ["-y", "-i", inputPath, "-vn", "-c:a", "libopus", "-b:a", "128k", outputPath];

    case "FLAC":
      return ["-y", "-i", inputPath, "-vn", "-c:a", "flac", outputPath];

    case "AIFF":
      return ["-y", "-i", inputPath, "-vn", "-c:a", "pcm_s16be", outputPath];

    case "WMA":
      return ["-y", "-i", inputPath, "-vn", "-c:a", "wmav2", "-b:a", "128k", outputPath];

    case "AMR":
      return ["-y", "-i", inputPath, "-vn", "-c:a", "libopencore_amrnb", "-ar", "8000", "-ac", "1", "-b:a", "12.2k", outputPath];

    /** VIDEO OUTPUTS */
    case "MP4":
      return [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outputPath,
      ];

    case "WEBM":
      return [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "32",
        "-b:v",
        "0",
        "-c:a",
        "libopus",
        "-b:a",
        "128k",
        outputPath,
      ];

    case "MOV":
      return [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        outputPath,
      ];

    case "MKV":
      return [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        outputPath,
      ];

    case "AVI":
      return [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "mpeg4",
        "-q:v",
        "5",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "4",
        outputPath,
      ];

    case "WMV":
      return [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "wmv2",
        "-b:v",
        "1500k",
        "-c:a",
        "wmav2",
        "-b:a",
        "128k",
        outputPath,
      ];

    case "FLV":
      return [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "flv",
        "-b:v",
        "1500k",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "128k",
        outputPath,
      ];

    case "M4V":
      return [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        outputPath,
      ];

    case "MPG":
    case "MPEG":
      return [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "mpeg2video",
        "-q:v",
        "5",
        "-c:a",
        "mp2",
        "-b:a",
        "192k",
        outputPath,
      ];

    case "3GP":
      return [
        "-y",
        "-i",
        inputPath,
        "-c:v",
        "h263",
        "-c:a",
        "aac",
        "-ar",
        "8000",
        "-ac",
        "1",
        "-b:a",
        "24k",
        outputPath,
      ];

    /** IMAGE OUTPUTS */
    case "GIF":
      if (inputType !== "video") {
        throw new Error("GIF output currently needs video input.");
      }
      return [
        "-y",
        "-i",
        inputPath,
        "-vf",
        "fps=10,scale=480:-1:flags=lanczos",
        "-loop",
        "0",
        outputPath,
      ];

    case "PNG":
      return ["-y", "-i", inputPath, "-frames:v", "1", outputPath];

    case "JPG":
      return ["-y", "-i", inputPath, "-frames:v", "1", "-q:v", "2", outputPath];

    case "WEBP":
      return ["-y", "-i", inputPath, "-frames:v", "1", outputPath];

    case "BMP":
      return ["-y", "-i", inputPath, "-frames:v", "1", outputPath];

    case "TIFF":
      return ["-y", "-i", inputPath, "-frames:v", "1", outputPath];

    case "ICO":
      return ["-y", "-i", inputPath, "-vf", "scale=256:256:force_original_aspect_ratio=decrease", "-frames:v", "1", outputPath];

    case "AVIF":
      return ["-y", "-i", inputPath, "-frames:v", "1", outputPath];

    default:
      throw new Error("Unsupported target format.");
  }
}

app.get("/", (req, res) => {
  res.send("Converto server running");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "converto-server",
    ffmpegPath,
    targets: TARGETS,
  });
});

app.post("/convert", upload.single("file"), (req, res) => {
  console.log("POST /convert received", {
    file: req.file?.originalname,
    target: req.body?.target,
  });

  const inputFile = req.file;
  const target = String(req.body?.target || "").toUpperCase();

  if (!inputFile) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  if (!TARGETS.includes(target)) {
    safeDelete(inputFile.path);
    return res.status(400).json({ error: "Unsupported target format." });
  }

  const inputType = detectInputType(inputFile.originalname);

  if (inputType === "unknown") {
    safeDelete(inputFile.path);
    return res.status(400).json({ error: "Unsupported input format." });
  }

  if (!isConversionAllowed(inputType, target)) {
    safeDelete(inputFile.path);
    return res.status(400).json({
      error: `Conversion from ${inputType} input to ${target} is not allowed.`,
    });
  }

  const outputExt = getOutputExt(target);
  const outputPath = `${inputFile.path}.${outputExt}`;
  const downloadName = `${path.parse(inputFile.originalname).name}_converto.${outputExt}`;

  let ffmpegArgs;

  try {
    ffmpegArgs = buildFfmpegArgs({
      inputPath: inputFile.path,
      outputPath,
      target,
      inputType,
    });
  } catch (err) {
    safeDelete(inputFile.path);
    return res.status(400).json({
      error: err.message || "Invalid conversion request.",
    });
  }

  console.log("Running ffmpeg:", ffmpegPath, ffmpegArgs.join(" "));

  const ff = spawn(ffmpegPath, ffmpegArgs, {
    windowsHide: true,
  });

  let stderr = "";
  let stdout = "";

  ff.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  ff.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  ff.on("error", (error) => {
    console.error("FFmpeg spawn error:", error);
    safeDelete(inputFile.path);
    safeDelete(outputPath);
    return res.status(500).json({
      error: error.message || "Failed to start FFmpeg.",
    });
  });

  ff.on("close", (code) => {
    if (code !== 0) {
      const detailedError = stderr || stdout || `FFmpeg exited with code ${code}`;
      console.error("FFmpeg error:", detailedError);

      safeDelete(inputFile.path);
      safeDelete(outputPath);

      return res.status(500).json({
        error: detailedError.slice(0, 1200),
      });
    }

    res.download(outputPath, downloadName, (downloadErr) => {
      safeDelete(inputFile.path);
      safeDelete(outputPath);

      if (downloadErr) {
        console.error("Download error:", downloadErr.message);

        if (!res.headersSent) {
          return res.status(500).json({ error: downloadErr.message });
        }
      }
    });
  });

  req.on("aborted", () => {
    console.warn("Client aborted request during /convert");
    try {
      ff.kill("SIGKILL");
    } catch {}
    safeDelete(inputFile?.path);
    safeDelete(outputPath);
  });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Converto server running on port ${PORT}`);
});