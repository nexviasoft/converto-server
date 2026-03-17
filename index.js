<<<<<<< HEAD
=======
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffmpegPath = ffmpegInstaller.path;
>>>>>>> 1ea03ce9b207b4a2ce44b1ed61563eca38700e34
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

<<<<<<< HEAD
app.use(cors());
app.use(express.json());

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
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
  fs.unlink(filePath, () => {});
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

function isSameCategory(inputExt, target) {
  if (AUDIO_FORMATS.has(inputExt) && AUDIO_FORMATS.has(target)) return true;
  if (VIDEO_FORMATS.has(inputExt) && VIDEO_FORMATS.has(target)) return true;
  if (IMAGE_FORMATS.has(inputExt) && IMAGE_FORMATS.has(target)) return true;
  return false;
}

function buildFfmpegArgs(inputPath, target, outputPath) {
  if (AUDIO_FORMATS.has(target)) {
    switch (target) {
      case "mp3":
        return ["-i", inputPath, "-vn", "-codec:a", "libmp3lame", "-q:a", "2", outputPath];
      case "wav":
        return ["-i", inputPath, "-vn", "-c:a", "pcm_s16le", outputPath];
      case "m4a":
        return ["-i", inputPath, "-vn", "-c:a", "aac", "-b:a", "192k", outputPath];
      case "aac":
        return ["-i", inputPath, "-vn", "-c:a", "aac", "-b:a", "192k", outputPath];
      case "ogg":
        return ["-i", inputPath, "-vn", "-c:a", "libvorbis", "-q:a", "5", outputPath];
      case "opus":
        return ["-i", inputPath, "-vn", "-c:a", "libopus", "-b:a", "160k", outputPath];
      case "flac":
        return ["-i", inputPath, "-vn", "-c:a", "flac", outputPath];
      case "aiff":
        return ["-i", inputPath, "-vn", "-c:a", "pcm_s16be", outputPath];
      case "wma":
        return ["-i", inputPath, "-vn", "-c:a", "wmav2", "-b:a", "192k", outputPath];
      case "amr":
        return ["-i", inputPath, "-vn", "-c:a", "libopencore_amrnb", "-ar", "8000", "-ac", "1", "-b:a", "12.2k", outputPath];
      default:
        return null;
    }
  }

  if (VIDEO_FORMATS.has(target)) {
    switch (target) {
      case "mp4":
        return ["-i", inputPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", outputPath];
      case "webm":
        return ["-i", inputPath, "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-c:a", "libopus", outputPath];
      case "mov":
        return ["-i", inputPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", outputPath];
      case "mkv":
        return ["-i", inputPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", outputPath];
      case "avi":
        return ["-i", inputPath, "-c:v", "mpeg4", "-q:v", "5", "-c:a", "mp3", outputPath];
      case "wmv":
        return ["-i", inputPath, "-c:v", "wmv2", "-c:a", "wmav2", outputPath];
      case "flv":
        return ["-i", inputPath, "-c:v", "flv", "-c:a", "libmp3lame", outputPath];
      case "m4v":
        return ["-i", inputPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", outputPath];
      case "mpg":
      case "mpeg":
        return ["-i", inputPath, "-c:v", "mpeg2video", "-q:v", "5", "-c:a", "mp2", outputPath];
      case "3gp":
        return ["-i", inputPath, "-c:v", "h263", "-c:a", "aac", "-ar", "8000", "-ac", "1", outputPath];
      default:
        return null;
    }
  }

  if (IMAGE_FORMATS.has(target)) {
    switch (target) {
      case "gif":
        return ["-i", inputPath, "-vf", "fps=12,scale=iw:-1:flags=lanczos", outputPath];
      case "png":
      case "jpg":
      case "webp":
      case "bmp":
      case "tiff":
      case "ico":
      case "avif":
        return ["-i", inputPath, "-frames:v", "1", outputPath];
      default:
        return null;
    }
  }

  return null;
}

app.get("/", (req, res) => {
  res.send("Converto API running");
});

app.post("/convert", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const target = normalizeTarget(req.body.target);
  const originalName = req.file.originalname || "";
  const inputExt = detectInputExt(originalName);
  const inputPath = req.file.path;
  const outputPath = `${inputPath}.${target}`;
  const downloadName = `${path.parse(originalName).name || "output"}_converto.${target}`;

  if (!isSupportedTarget(target)) {
    safeUnlink(inputPath);
    return res.status(400).json({ error: "Unsupported target format." });
  }

  if (inputExt && inputExt === target) {
    safeUnlink(inputPath);
    return res.status(400).json({ error: "Input and output formats are the same." });
  }

  // İstersen bunu kaldırabiliriz; şu an çapraz kategori dönüşümleri de ffmpeg'e bırakıyoruz.
  // if (inputExt && !isSameCategory(inputExt, target)) { ... }

  const ffmpegArgs = buildFfmpegArgs(inputPath, target, outputPath);

  if (!ffmpegArgs) {
    safeUnlink(inputPath);
    return res.status(400).json({ error: "This conversion path is not supported yet." });
  }

  console.log("Starting conversion:", {
    from: inputExt || "unknown",
    to: target,
    file: originalName,
  });

  const ffmpeg = spawn("ffmpeg", ["-y", ...ffmpegArgs]);

  let ffmpegErrorLog = "";

  ffmpeg.stderr.on("data", (data) => {
    const text = data.toString();
    ffmpegErrorLog += text;
    console.log(text);
  });

  ffmpeg.on("error", (error) => {
    console.error("FFmpeg spawn error:", error);
    safeUnlink(inputPath);
    safeUnlink(outputPath);
    return res.status(500).json({ error: "FFmpeg could not be started." });
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0) {
      console.error("FFmpeg exit code:", code);
      console.error(ffmpegErrorLog);
      safeUnlink(inputPath);
      safeUnlink(outputPath);
      return res.status(500).json({ error: "Conversion failed." });
    }

    const mimeType = MIME_MAP[target] || "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);

    stream.on("close", () => {
      safeUnlink(inputPath);
      safeUnlink(outputPath);
    });

    stream.on("error", (streamErr) => {
      console.error("Stream error:", streamErr);
      safeUnlink(inputPath);
      safeUnlink(outputPath);
      if (!res.headersSent) {
        return res.status(500).json({ error: "File streaming failed." });
      }
      res.end();
    });
  });
});

app.use((err, req, res, next) => {
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
=======
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

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

const ffprobePath = (() => {
  const dir = path.dirname(ffmpegPath);
  const bin = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const candidate = path.join(dir, bin);
  return fs.existsSync(candidate) ? candidate : "ffprobe";
})();

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

function runProcess(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(stderr || stdout || `${bin} exited with code ${code}`);
        err.code = code;
        reject(err);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function probeMedia(inputPath) {
  const args = [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_streams",
    inputPath,
  ];

  try {
    const { stdout } = await runProcess(ffprobePath, args);
    const data = JSON.parse(stdout || "{}");
    const streams = Array.isArray(data.streams) ? data.streams : [];

    return {
      hasAudio: streams.some((s) => s.codec_type === "audio"),
      hasVideo: streams.some((s) => s.codec_type === "video"),
      streams,
    };
  } catch {
    return {
      hasAudio: false,
      hasVideo: false,
      streams: [],
    };
  }
}

function buildFfmpegArgs({ inputPath, outputPath, target, inputType }) {
  switch (target) {
    /** AUDIO OUTPUTS */
    case "MP3":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "3",
        outputPath,
      ];

    case "WAV":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-c:a",
        "pcm_s16le",
        outputPath,
      ];

    case "M4A":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        outputPath,
      ];

    case "AAC":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        outputPath,
      ];

    case "OGG":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-c:a",
        "libvorbis",
        "-q:a",
        "5",
        outputPath,
      ];

    case "OPUS":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-c:a",
        "libopus",
        "-b:a",
        "128k",
        outputPath,
      ];

    case "FLAC":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-c:a",
        "flac",
        outputPath,
      ];

    case "AIFF":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-c:a",
        "pcm_s16be",
        outputPath,
      ];

    case "WMA":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
        "-c:a",
        "wmav2",
        "-b:a",
        "128k",
        outputPath,
      ];

    case "AMR":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:a:0",
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

    /** VIDEO OUTPUTS */
    case "MP4":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
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
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-vf",
        "fps=10,scale=480:-1:flags=lanczos",
        "-loop",
        "0",
        outputPath,
      ];

    case "PNG":
      return ["-y", "-i", inputPath, "-map", "0:v:0", "-frames:v", "1", outputPath];

    case "JPG":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outputPath,
      ];

    case "WEBP":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-c:v",
        "libwebp",
        outputPath,
      ];

    case "BMP":
      return ["-y", "-i", inputPath, "-map", "0:v:0", "-frames:v", "1", outputPath];

    case "TIFF":
      return ["-y", "-i", inputPath, "-map", "0:v:0", "-frames:v", "1", outputPath];

    case "ICO":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-vf",
        "scale=256:256:force_original_aspect_ratio=decrease",
        "-frames:v",
        "1",
        outputPath,
      ];

    case "AVIF":
      return [
        "-y",
        "-i",
        inputPath,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-c:v",
        "libaom-av1",
        "-still-picture",
        "1",
        outputPath,
      ];

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
    ffprobePath,
    targets: TARGETS,
  });
});

app.post("/convert", upload.single("file"), async (req, res) => {
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

  const mediaInfo = await probeMedia(inputFile.path);
  const targetCategory = getTargetCategory(target);

  if (targetCategory === "audio" && !mediaInfo.hasAudio) {
    safeDelete(inputFile.path);
    return res.status(400).json({
      error: "This file does not contain an audio stream.",
    });
  }

  if ((targetCategory === "video" || targetCategory === "image") && !mediaInfo.hasVideo) {
    safeDelete(inputFile.path);
    return res.status(400).json({
      error: "This file does not contain a video/image stream.",
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

  let ff;
  try {
    ff = spawn(ffmpegPath, ffmpegArgs, {
      windowsHide: true,
    });
  } catch (error) {
    safeDelete(inputFile.path);
    safeDelete(outputPath);
    return res.status(500).json({
      error: error.message || "Failed to start FFmpeg.",
    });
  }

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

    if (!res.headersSent) {
      return res.status(500).json({
        error: error.message || "Failed to start FFmpeg.",
      });
    }
  });

  ff.on("close", (code) => {
    if (code !== 0) {
      const detailedError = stderr || stdout || `FFmpeg exited with code ${code}`;
      console.error("FFmpeg error:", detailedError);

      safeDelete(inputFile.path);
      safeDelete(outputPath);

      if (!res.headersSent) {
        return res.status(500).json({
          error: detailedError.slice(0, 1200),
        });
      }
      return;
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

app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "File is too large. Max 50MB." });
  }

  console.error("Unhandled server error:", err);
  return res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Converto server running on port ${PORT}`);
>>>>>>> 1ea03ce9b207b4a2ce44b1ed61563eca38700e34
});