const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizeMetadata,
  inspectPlatformMedia
} = require("../media-inspector");

test("media metadata excludes source URLs", () => {
  const result = sanitizeMetadata({
    title: "Test video",
    duration: 9.333,
    formats: [
      {
        format_id: "http-2176",
        ext: "mp4",
        width: 1022,
        height: 576,
        tbr: 2176,
        vcodec: "avc1",
        acodec: "aac",
        url: "https://example.com/private-token"
      }
    ]
  }, "x");

  assert.equal(result.provider, "x");
  assert.equal(result.durationSeconds, 9.333);
  assert.equal(result.formats[0].height, 576);
  assert.equal(result.downloadReady, false);
  assert.equal(JSON.stringify(result).includes("private-token"), false);
});

test("disabled providers are rejected before extraction", async () => {
  await assert.rejects(
    inspectPlatformMedia("https://www.instagram.com/reel/ABC123/"),
    error =>
      error.status === 422 &&
      error.code === "PROVIDER_NOT_ENABLED"
  );
});
