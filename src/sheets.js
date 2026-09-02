const { google } = require("googleapis");

const COLUMNS = [
  "Ticket Key",
  "Link",
  "Summary",
  "Status",
  "Priority",
  "Assignee",
  "Reporter",
  "Raised Date",
  "Posted By",
  "Slack Link",
  "Last Synced",
];

let sheetsClient = null;

async function getSheets() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth: await auth.getClient() });
  return sheetsClient;
}

function sheetRange(suffix) {
  return `'${process.env.GOOGLE_SHEET_NAME}'!${suffix}`;
}

async function ensureHeader() {
  const sheets = await getSheets();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetRange("A1:K1"),
  });

  if (!data.values || data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: sheetRange("A1:K1"),
      valueInputOption: "RAW",
      requestBody: { values: [COLUMNS] },
    });
  }
}

/** Returns the 1-based sheet row number for a ticket key, or null. */
async function findRow(key) {
  const sheets = await getSheets();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetRange("A2:A"),
  });

  const rows = data.values || [];
  const index = rows.findIndex((row) => row[0] === key);
  return index === -1 ? null : index + 2;
}

async function updateStatusColumns(rowNumber, issue) {
  const sheets = await getSheets();
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: sheetRange(`C${rowNumber}:G${rowNumber}`),
          values: [[issue.summary, issue.status, issue.priority, issue.assignee, issue.reporter]],
        },
        {
          range: sheetRange(`K${rowNumber}:K${rowNumber}`),
          values: [[now]],
        },
      ],
    },
  });
}

/**
 * Called when a JIRA link is posted in Slack. Appends a new tracker row the
 * first time a ticket is seen; on a repeat mention it just refreshes the
 * live JIRA fields and leaves who-posted-it/when-raised alone.
 */
async function upsertFromSlack(issue, { postedBy, slackLink }) {
  await ensureHeader();
  const rowNumber = await findRow(issue.key);

  if (rowNumber) {
    await updateStatusColumns(rowNumber, issue);
    return { created: false, row: rowNumber };
  }

  const sheets = await getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetRange("A:K"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          issue.key,
          issue.url,
          issue.summary,
          issue.status,
          issue.priority,
          issue.assignee,
          issue.reporter,
          issue.created,
          postedBy,
          slackLink,
          now,
        ],
      ],
    },
  });

  return { created: true };
}

/** Returns every ticket key currently tracked, for the periodic status refresh. */
async function getAllTrackedKeys() {
  const sheets = await getSheets();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: sheetRange("A2:A"),
  });

  return (data.values || []).map((row) => row[0]).filter(Boolean);
}

async function refreshExisting(issue) {
  const rowNumber = await findRow(issue.key);
  if (rowNumber) await updateStatusColumns(rowNumber, issue);
}

module.exports = { upsertFromSlack, getAllTrackedKeys, refreshExisting, ensureHeader };
