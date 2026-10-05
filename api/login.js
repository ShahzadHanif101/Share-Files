"use strict";

const {
  createToken,
  setSession,
  checkUsername,
  checkPassword,
  TTL_SECONDS,
} = require("../lib/auth");

// Best-effort brute-force brake (per warm serverless instance):
// 5 misses / 15 min / IP.

const misses = new Map();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_MISSES = 5;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  const ip =
    String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() || "unknown";

  const now = Date.now();

  const recent = (misses.get(ip) || []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_MISSES) {
    return res.status(200).json({
      result: {
        success: false,
        message: "Too many attempts. Please wait a few minutes.",
      },
    });
  }

  const username = String((req.body && req.body.username) || "").trim();

  const password = String((req.body && req.body.password) || "");

  const usernameOk = checkUsername(username);
  const passwordOk = checkPassword(password);

  if (
    usernameOk === null ||
    passwordOk === null ||
    !process.env.SESSION_SECRET
  ) {
    return res.status(200).json({
      result: {
        success: false,
        message:
          "Login is not configured. Set AUTH_USERNAME, AUTH_PASSWORD and SESSION_SECRET in Vercel.",
      },
    });
  }

  if (!usernameOk || !passwordOk) {
    recent.push(now);
    misses.set(ip, recent);

    await new Promise((r) => setTimeout(r, 800));

    return res.status(200).json({
      result: {
        success: false,
        message: "Incorrect username or password.",
      },
    });
  }

  misses.delete(ip);

  setSession(req, res, createToken(), TTL_SECONDS);

  return res.status(200).json({
    result: {
      success: true,
    },
  });
};
