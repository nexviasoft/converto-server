"use strict";

const { getDirectLinkInfo } = require("./source-url");

const PLATFORMS = {
  youtube: ["youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  x: ["x.com", "twitter.com"],
  tiktok: ["tiktok.com"],
  facebook: ["facebook.com"]
};

function matchesHost(host, domain) {
  return host === domain || host.endsWith("." + domain);
}

function detectProvider(host) {
  for (const [provider, domains] of Object.entries(PLATFORMS)) {
    if (domains.some(domain => matchesHost(host, domain))) {
      return provider;
    }
  }
  return "direct";
}

function describeMediaLink(input) {
  const info = getDirectLinkInfo(input);
  const provider = detectProvider(info.host);

  if (info.supported) {
    return {
      ...info,
      provider,
      mediaKind: "direct-file"
    };
  }

  const pathname = new URL(info.url).pathname.toLowerCase();

  let mediaKind = "platform-page";

  if (provider === "youtube") {
    if (pathname.startsWith("/shorts/")) mediaKind = "short";
    else if (pathname === "/watch") mediaKind = "video";
  }

  if (provider === "instagram") {
    if (pathname.startsWith("/reel/")) mediaKind = "reel";
    else if (pathname.startsWith("/p/")) mediaKind = "post";
    else if (pathname.startsWith("/stories/")) mediaKind = "story";
  }

  if (provider === "x" && pathname.includes("/status/")) {
    mediaKind = "post";
  }

  if (provider === "tiktok") {
    mediaKind = "video";
  }

  return {
    ...info,
    provider,
    mediaKind,
    integrationStatus: "not-enabled"
  };
}

module.exports = { describeMediaLink, detectProvider };
