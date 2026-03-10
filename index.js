const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffmpegPath = ffmpegInstaller.path;
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const app = express();

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

app.use(cors());
app.use(express.json());

const TARGETS = [
  "MP3",
  "WAV",
  "M4A",
  "AAC",
  "OGG",
  "OPUS",
  "FLAC",
  "MP4",
  "WEBM",
  "MOV",
  "GIF",
];

function detectInputType(filename = "") {
  const n = filename.toLowerCase();

  if ([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".flac"].some((e) => n.endsWith(e))) {
    return "audio";
  }

  if (n.endsWith(".gif")) {
    return "gif";
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
    MP4: "mp4",
    WEBM: "webm",
    MOV: "mov",
    GIF: "gif",
  }[target];
}

function buildFfmpegCommand({ inputPath, outputPath, target, inputType }) {
  switch (target) {
    case "MP3":
      return `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a libmp3lame -q:a 3 "${outputPath}"`;

    case "WAV":
      return `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a pcm_s16le "${outputPath}"`;

    case "M4A":
    case "AAC":
      return `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a aac -b:a 128k "${outputPath}"`;

    case "OGG":
      return `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a libvorbis -q:a 5 "${outputPath}"`;

    case "OPUS":
      return `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a libopus -b:a 128k "${outputPath}"`;

    case "FLAC":
      return `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a flac "${outputPath}"`;

    case "MP4":
      if (inputType === "audio") {
        return `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`;
      }
      return `"${ffmpegPath}" -y -i "${inputPath}" -c:v libx264 -preset veryfast -crf 28 -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`;

    case "WEBM":
      if (inputType === "audio") {
        return `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a libopus -b:a 128k "${outputPath}"`;
      }
      return `"${ffmpegPath}" -y -i "${inputPath}" -c:v libvpx -crf 30 -b:v 0 -c:a libopus -b:a 128k "${outputPath}"`;

    case "MOV":
      if (inputType === "audio") {
        return `"${ffmpegPath}" -y -i "${inputPath}" -vn -c:a aac -b:a 128k "${outputPath}"`;
      }
      return `"${ffmpegPath}" -y -i "${inputPath}" -c:v libx264 -preset veryfast -crf 28 -c:a aac -b:a 128k "${outputPath}"`;

    case "GIF":
      if (inputType === "audio") {
        throw new Error("GIF needs video input.");
      }
      return `"${ffmpegPath}" -y -i "${inputPath}" -vf "fps=10,scale=480:-1:flags=lanczos" -loop 0 "${outputPath}"`;

    default:
      throw new Error("Unsupported target format.");
  }
}

function safeDelete(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

app.get("/", (req, res) => {
  res.send("Converto server running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "converto-server" });
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

  const outputExt = getOutputExt(target);
  const outputPath = `${inputFile.path}.${outputExt}`;
  const downloadName = `${path.parse(inputFile.originalname).name}_converto.${outputExt}`;

  let command;

  try {
    command = buildFfmpegCommand({
      inputPath: inputFile.path,
      outputPath,
      target,
      inputType,
    });
  } catch (err) {
    safeDelete(inputFile.path);
    return res.status(400).json({ error: err.message || "Invalid conversion request." });
  }

  console.log("Running ffmpeg command:", command);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      const detailedError = stderr || error.message || "Unknown FFmpeg error";
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
    safeDelete(inputFile?.path);
    safeDelete(outputPath);
  });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Converto server running on port ${PORT}`);
});