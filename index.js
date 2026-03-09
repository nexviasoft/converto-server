const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());

app.get("/", (req, res) => {
  res.send("Converto server is running");
});

app.post("/convert/mp3", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    return res.json({
      ok: true,
      message: "Upload received",
      originalName: req.file.originalname,
      savedAs: req.file.filename,
    });
  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Converto server listening on port ${PORT}`);
});