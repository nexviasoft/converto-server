"use strict";

try {
  const sharp = require("sharp");
  const sharpVersion = sharp.versions?.sharp || "unknown";
  const vipsVersion = sharp.versions?.vips || "unknown";

  console.log(`Sharp ready: ${sharpVersion}`);
  console.log(`libvips ready: ${vipsVersion}`);
} catch (error) {
  console.error("Sharp verification failed. AVIF cannot work on this deployment.");
  console.error(error && (error.stack || error.message) ? error.stack || error.message : error);
  process.exit(1);
}
