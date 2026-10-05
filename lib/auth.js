"use strict";

const crypto = require("crypto");

const COOKIE = "ft_session";

const TTL_SECONDS = 6 * 60 * 60; // 6 hours

const secret = () => process.env.SESSION_SECRET || "";

const sign = (v) =>
  crypto.createHmac("sha256", secret()).update(v).digest("base64url");

const sha = (v) => crypto.createHash("sha256").update(String(v)).digest();

function createToken() {
  const exp = String(Math.floor(Date.now() / 1000) + TTL_SECONDS);

  return exp + "." + sign(exp);
}

function verifyToken(token) {
  if (!token || !secret()) return false;

  const [exp, sig] = String(token).split(".");

  if (!exp || !sig) return false;

  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return false;
  }

  return Number(exp) > Date.now() / 1000;
}

function cookies(req) {
  const out = {};

  String(req.headers.cookie || "")
    .split(";")
    .forEach((p) => {
      const i = p.indexOf("=");

      if (i > 0) {
        out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
      }
    });

  return out;
}

const isAuthed = (req) => verifyToken(cookies(req)[COOKIE]);

function setSession(req, res, token, maxAge) {
  const local = /^(localhost|127\.0\.0\.1)/.test(
    String(req.headers.host || ""),
  );

  res.setHeader(
    "Set-Cookie",
    COOKIE +
      "=" +
      token +
      "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" +
      maxAge +
      (local ? "" : "; Secure"),
  );
}

/**
 * null = AUTH_USERNAME not configured
 * otherwise true/false.
 * Constant-time comparison.
 */
function checkUsername(input) {
  const stored = process.env.AUTH_USERNAME;

  if (!stored) return null;

  return crypto.timingSafeEqual(sha(input), sha(stored));
}

/**
 * null = AUTH_PASSWORD not configured
 * otherwise true/false.
 * Constant-time comparison.
 */
function checkPassword(input) {
  const stored = process.env.AUTH_PASSWORD;

  if (!stored) return null;

  return crypto.timingSafeEqual(sha(input), sha(stored));
}

module.exports = {
  createToken,
  isAuthed,
  setSession,
  checkUsername,
  checkPassword,
  TTL_SECONDS,
};
