const express = require("express");
const multer = require("multer");
const { exec } = require("child_process");
const fs = require("fs");

const app = express();
const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.send("Converto API running");
});

app.post("/convert/mp3", upload.single("file"), (req, res) => {
  const input = req.file.path;
  const output = input + ".mp3";

  exec(`ffmpeg -i ${input} -vn -codec:a libmp3lame ${output}`, (err) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Conversion failed");
    }

    res.download(output, "output.mp3", () => {
      fs.unlinkSync(input);
      fs.unlinkSync(output);
    });
  });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
