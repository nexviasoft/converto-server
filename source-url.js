"use strict";

// Direct, publicly accessible media files only. No page scraping, credential
// replay, DRM bypass, or automatic downloading of platform watch pages.
const dns = require("node:dns").promises;
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");

class PublicMediaError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "PublicMediaError";
    this.code = code;
    this.status = status;
  }
}

const DENY4 = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) DENY4.addSubnet(address, prefix, "ipv4");
const DENY6 = new net.BlockList();
for (const [address, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96],
  ["100::", 64], ["2001::", 32], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
]) DENY6.addSubnet(address, prefix, "ipv6");

function isPublicAddress(address) {
  const type = net.isIP(address);
  if (type === 4) return !DENY4.check(address, "ipv4");
  if (type === 6) return address.toLowerCase().startsWith("2") && !DENY6.check(address, "ipv6");
  return false;
}

function getDirectLinkInfo(input) {
  if (typeof input !== "string" || input.length > 2048) {
    throw new PublicMediaError("INVALID_URL", "Please provide a valid media link.");
  }
  let url;
  try { url = new URL(input.trim()); } catch {
    throw new PublicMediaError("INVALID_URL", "Please provide a valid media link.");
  }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new PublicMediaError("INVALID_URL", "Only public HTTP(S) media links without embedded credentials are supported.");
  }
  if ((url.protocol === "https:" && url.port && url.port !== "443") ||
      (url.protocol === "http:" && url.port && url.port !== "80")) {
    throw new PublicMediaError("UNSAFE_URL", "Links using custom ports are not supported.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid") ||
      host.endsWith(".example") || host === "metadata.google.internal" ||
      (net.isIP(host) && !isPublicAddress(host))) {
    throw new PublicMediaError("UNSAFE_URL", "This link cannot be fetched by the conversion server.", 422);
  }
  const platformPage = /(^|\.)(youtube\.com|youtu\.be|instagram\.com|x\.com|twitter\.com|tiktok\.com|facebook\.com)$/i.test(host);
  if (platformPage) {
    return {
      supported: false,
      kind: "platform-page",
      host,
      url: url.toString(),
      message: "This platform page is not a direct media file. Platform-specific authorized access is not enabled yet.",
    };
  }
  return { supported: true, kind: "direct-media", host, url: url.toString() };
}

async function publicLookup(hostname) {
  if (net.isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new PublicMediaError("UNSAFE_URL", "Private addresses are not allowed.", 422);
    return { address: hostname, family: net.isIP(hostname) };
  }
  let addresses;
  try { addresses = await dns.lookup(hostname, { all: true, verbatim: true }); } catch {
    throw new PublicMediaError("DNS_FAILED", "Could not resolve media link host.", 422);
  }
  if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address))) {
    throw new PublicMediaError("UNSAFE_URL", "Private or reserved network targets are not allowed.", 422);
  }
  return addresses[0];
}

function doRequest(url, address, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    let done = false;
    const finish = (err, response) => {
      if (done) return;
      done = true;
      if (err) reject(err);
      else resolve(response);
    };
    const request = transport.get(parsed, {
      lookup: (_name, options, callback) => {
        if (options?.all) {
          callback(null, [{ address: address.address, family: address.family }]);
        } else {
          callback(null, address.address, address.family);
        }
      },
      timeout: timeoutMs,
      headers: {
        "User-Agent": "ConvertoMediaImporter/1.0",
        Accept: "video/*, audio/*, image/*, application/octet-stream",
        "Accept-Encoding": "identity",
      },
    }, (response) => finish(null, response));
    request.on("timeout", () => request.destroy(new PublicMediaError("SOURCE_TIMEOUT", "The media source took too long to respond.", 504)));
    request.on("error", (err) => finish(err));
  });
}

const MIMES = {
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "video/x-matroska": "mkv", "video/x-msvideo": "avi", "video/mpeg": "mpeg",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg",
  "audio/flac": "flac", "image/jpeg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/gif": "gif", "image/bmp": "bmp",
  "image/tiff": "tiff", "image/avif": "avif",
};
const EXTENSIONS = new Set(["mp4", "m4v", "mov", "mkv", "avi", "webm", "wmv", "mpg", "mpeg", "flv", "mp3", "m4a", "aac", "ogg", "opus", "wav", "flac", "aiff", "wma", "amr", "png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif", "avif"]);

function sourceFileName(responseUrl, contentType) {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (mime.startsWith("text/") || mime.includes("html") || mime.includes("json") || mime.includes("xml")) {
    throw new PublicMediaError("NOT_MEDIA", "This address points to a webpage, not a downloadable media file.", 422);
  }
  let last = "";
  try { last = decodeURIComponent(new URL(responseUrl).pathname.split("/").pop() || ""); } catch { /* ignore */ }
  const base = path.basename(last).replace(/[^a-z0-9._-]/gi, "_").slice(0, 90);
  const candidate = path.extname(base).toLowerCase().replace(".", "");
  const extension = MIMES[mime] || (EXTENSIONS.has(candidate) ? candidate : null);
  if (!extension || (mime && mime !== "application/octet-stream" && !MIMES[mime] && !mime.startsWith("video/") && !mime.startsWith("audio/") && !mime.startsWith("image/"))) {
    throw new PublicMediaError("NOT_MEDIA", "The source did not return a supported media type.", 422);
  }
  return base && EXTENSIONS.has(candidate) && candidate === extension ? base : `linked_media.${extension}`;
}

async function downloadPublicMedia(input, destinationPath, { maxBytes = 40 * 1024 * 1024, timeoutMs = 20000, maxRedirects = 3 } = {}) {
  let info = getDirectLinkInfo(input);
  if (!info.supported) throw new PublicMediaError("PLATFORM_NOT_SUPPORTED", info.message, 422);
  let currentUrl = info.url;
  let response;
  for (let i = 0; i <= maxRedirects; i += 1) {
    info = getDirectLinkInfo(currentUrl);
    if (!info.supported) throw new PublicMediaError("PLATFORM_NOT_SUPPORTED", info.message, 422);
    const parsed = new URL(currentUrl);
    const address = await publicLookup(parsed.hostname);
    response = await doRequest(currentUrl, address, timeoutMs);
    if (![301, 302, 303, 307, 308].includes(response.statusCode)) break;
    const location = response.headers.location;
    response.resume();
    if (!location || i === maxRedirects) throw new PublicMediaError("REDIRECT_LIMIT", "Too many media link redirects.", 422);
    const next = new URL(location, currentUrl).toString();
    if (parsed.protocol === "https:" && new URL(next).protocol !== "https:") {
      throw new PublicMediaError("UNSAFE_URL", "An HTTPS source cannot redirect to insecure HTTP.", 422);
    }
    currentUrl = next;
  }
  if (response.statusCode !== 200) {
    response.resume();
    throw new PublicMediaError("SOURCE_ERROR", `The media source returned HTTP ${response.statusCode}.`, 422);
  }
  let name;
  try { name = sourceFileName(currentUrl, response.headers["content-type"]); } catch (err) { response.destroy(); throw err; }
  const size = Number(response.headers["content-length"] || 0);
  if (size > maxBytes) {
    response.destroy();
    throw new PublicMediaError("SOURCE_TOO_LARGE", "This direct media file exceeds the link import size limit.", 413);
  }
  let transferred = 0;
  const limiter = new Transform({
    transform(chunk, _enc, callback) {
      transferred += chunk.length;
      if (transferred > maxBytes) callback(new PublicMediaError("SOURCE_TOO_LARGE", "This direct media file exceeds the link import size limit.", 413));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(response, limiter, fs.createWriteStream(destinationPath, { flags: "wx" }));
    if (transferred === 0) throw new PublicMediaError("EMPTY_SOURCE", "This media file is empty.", 422);
    return { name, bytes: transferred };
  } catch (err) {
    await fs.promises.rm(destinationPath, { force: true }).catch(() => {});
    throw err;
  }
}
module.exports = { PublicMediaError, getDirectLinkInfo, downloadPublicMedia, isPublicAddress, sourceFileName };
