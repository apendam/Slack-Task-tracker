// One-time helper to install this Slack app to your workspace and print the
// resulting bot token(s) - a local Express server that stands in for a
// redirect URL, since the app has no public server of its own (Socket Mode
// doesn't need one for normal operation).
//
// Usage:
//   1. Fill SLACK_CLIENT_ID and SLACK_CLIENT_SECRET into .env
//      (Basic Information -> App Credentials).
//   2. In OAuth & Permissions -> Redirect URLs, set the redirect URL to
//      http://localhost:3001/slack/oauth_redirect (replace any old one) and
//      click Save URLs.
//   3. Run: npm run slack:install
//   4. Open the printed URL, pick the BlackBuck workspace, click Allow.
//   5. Copy the token this script prints into .env, then Ctrl+C.
require("dotenv").config();
const express = require("express");
const axios = require("axios");

const PORT = process.env.SLACK_INSTALL_PORT || 3001;
const REDIRECT_URI = `http://localhost:${PORT}/slack/oauth_redirect`;
const SCOPES = ["channels:history", "groups:history", "chat:write", "users:read"].join(",");

const { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } = process.env;

if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
  console.error(
    "Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in .env first (Basic Information -> App Credentials)."
  );
  process.exit(1);
}

const authorizeUrl =
  `https://slack.com/oauth/v2/authorize?client_id=${SLACK_CLIENT_ID}` +
  `&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

const app = express();

app.get("/slack/oauth_redirect", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    res.send(`Slack returned an error: ${error}`);
    return;
  }

  try {
    const { data } = await axios.post(
      "https://slack.com/api/oauth.v2.access",
      new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    if (!data.ok) {
      console.error("Slack error:", data);
      res.send(`Slack error: ${data.error}`);
      return;
    }

    console.log("\nInstall succeeded.\n");
    if (data.refresh_token) {
      console.log("This app has Token Rotation enabled. Copy this into .env:\n");
      console.log(`SLACK_REFRESH_TOKEN=${data.refresh_token}`);
      console.log(`\n(The access_token below is short-lived and can be ignored: ${data.access_token})`);
    } else {
      console.log("No refresh_token returned - this app does NOT have rotation. Copy this into .env:\n");
      console.log(`SLACK_BOT_TOKEN=${data.access_token}`);
    }

    res.send("Success! Check your terminal for the token to copy into .env, then you can close this tab.");
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Something went wrong - check the terminal.");
  }
});

app.listen(PORT, () => {
  console.log(`\nOpen this URL, choose the BlackBuck workspace, and click Allow:\n\n${authorizeUrl}\n`);
});
