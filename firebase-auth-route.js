"use strict";

const express = require("express");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const router = express.Router();

router.get("/me", async (req, res) => {
  const authorization = req.get("authorization") || "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);

  res.setHeader("Cache-Control", "no-store");

  if (!match || match[1].length > 8192) {
    return res.status(401).json({
      code: "UNAUTHORIZED",
      error: "Firebase authentication required."
    });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    return res.status(503).json({
      code: "AUTH_NOT_CONFIGURED",
      error: "Authentication is not configured."
    });
  }

  try {
    if (!getApps().length) {
      initializeApp({ projectId });
    }

    const user = await getAuth().verifyIdToken(match[1]);

    return res.json({
      authenticated: true,
      uid: user.uid,
      tier: "free",
      entitlements: {
        platformDownload: false,
        advancedVideoSettings: false
      }
    });
  } catch {
    return res.status(401).json({
      code: "INVALID_TOKEN",
      error: "Invalid or expired authentication token."
    });
  }
});

module.exports = router;
