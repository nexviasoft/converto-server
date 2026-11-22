"use strict";
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { buildFfmpegArgs, parseConversionOptions, sanitizeOptionsForTarget } = require("../index");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "converto-smoke-"));
const source = path.join(root, "source.mp4");
execFileSync(ffmpeg,["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=320x180:rate=25","-f","lavfi","-i","sine=frequency=440:sample_rate=44100","-t","1.2","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",source],{timeout:20000});
let passed = 0;
try {
  for (const target of ["mp4", "webm", "avi", "gif", "mp3", "m4a", "jpg", "webp"]) {
    for (const profile of ["small", "balanced", "high"]) {
      const options = sanitizeOptionsForTarget(parseConversionOptions({ videoQuality: profile }, target), target);
      const destination = path.join(root, `${profile}.${target}`);
      const args = buildFfmpegArgs(source, target, destination, options);
      assert(!args.some(Array.isArray), `nested arguments in ${target}/${profile}`);
      try {
        execFileSync(ffmpeg,["-hide_banner","-loglevel","error","-y",...args],{timeout:20000,stdio:"pipe"});
        assert(fs.statSync(destination).size > 0, "empty output");
        passed++;
      } catch(e) {
        console.error(`${target}/${profile} FAILED`,e.stderr?.toString()?.slice(-1000)||e.message);
        throw e;
      }
    }
    console.log(target, "small/balanced/high OK");
  }
  console.log("PASS",passed,"real FFmpeg conversions");
} finally { fs.rmSync(root,{recursive:true,force:true}); }
