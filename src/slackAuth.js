const fs = require("fs");
const path = require("path");
const axios = require("axios");

const TOKEN_STORE_PATH = path.join(__dirname, "..", "data", "slack-token.json");

// Slack "Token Rotation" (if enabled on the app) issues a bot access token
// that expires in ~12 hours plus a refresh token, instead of a permanent
// xoxb- token. Once enabled on a Slack app it can't be turned back off, so
// if SLACK_REFRESH_TOKEN is set we transparently keep the access token
// fresh; otherwise SLACK_BOT_TOKEN is used as-is (a permanent token).
const rotationConfigured = Boolean(
  process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET && process.env.SLACK_REFRESH_TOKEN
);

let cached = null; // { accessToken, refreshToken, expiresAt }

function loadStoredToken() {
  if (!fs.existsSync(TOKEN_STORE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveStoredToken(data) {
  fs.mkdirSync(path.dirname(TOKEN_STORE_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(data, null, 2));
}

async function refresh(refreshToken) {
  const { data } = await axios.post(
    "https://slack.com/api/oauth.v2.access",
    new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  if (!data.ok) throw new Error(`Slack token refresh failed: ${data.error}`);

  // Slack rotates the refresh token too - the old one stops working the
  // moment a new one is issued, so it must be persisted alongside the
  // access token, not just kept as the original seed value.
  const result = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  saveStoredToken(result);
  return result;
}

/**
 * Returns a valid bot token, refreshing it first if it's missing or close
 * to expiry. A no-op (just returns SLACK_BOT_TOKEN) when rotation isn't
 * configured.
 */
async function getBotToken(logger) {
  if (!rotationConfigured) return process.env.SLACK_BOT_TOKEN;

  if (!cached) cached = loadStoredToken();

  if (!cached || Date.now() >= cached.expiresAt) {
    const seedRefreshToken = cached?.refreshToken || process.env.SLACK_REFRESH_TOKEN;
    logger?.info("Refreshing rotated Slack bot token");
    cached = await refresh(seedRefreshToken);
  }

  return cached.accessToken;
}

module.exports = { getBotToken, rotationConfigured };
