"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { getDirectLinkInfo, isPublicAddress, sourceFileName } = require("../source-url");

test("direct public URL accepted and platform watch links classified as unsupported", () => {
  assert.equal(getDirectLinkInfo("https://cdn.example.org/a.mp4?token=one").supported, true);
  for (const url of ["https://youtu.be/123", "https://www.youtube.com/watch?v=a", "https://www.instagram.com/reel/abc", "https://x.com/user/status/2"]) {
    assert.equal(getDirectLinkInfo(url).supported, false);
  }
});

test("metadata/private hosts and nonstandard ports cannot be fetched", () => {
  for (const url of ["http://localhost/a.mp4", "http://127.0.0.1/a.mp4", "http://169.254.169.254/latest/meta-data", "http://192.168.1.2/a.mp4", "http://example.org:8080/a.mp4", "file:///etc/passwd", "https://user:pass@google.com/file.mp4"]) {
    assert.throws(() => getDirectLinkInfo(url));
  }
  assert(!isPublicAddress("10.0.1.2"));
  assert(!isPublicAddress("::1"));
  assert(isPublicAddress("8.8.8.8"));
});

test("HTML response rejected; media type used to validate filename", () => {
  assert.throws(() => sourceFileName("https://cdn.example.org/watch", "text/html"));
  assert.equal(sourceFileName("https://cdn.example.org/a.webm", "video/webm"), "a.webm");
  assert.equal(sourceFileName("https://cdn.example.org/watch", "video/mp4"), "linked_media.mp4");
});
