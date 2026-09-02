const axios = require("axios");

function client() {
  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64");

  return axios.create({
    baseURL: process.env.JIRA_BASE_URL,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
}

/**
 * Fetches the fields we mirror into the sheet for a single ticket key.
 * Returns null if the ticket doesn't exist or isn't visible to this account.
 */
async function getIssue(key) {
  try {
    const { data } = await client().get(`/rest/api/3/issue/${key}`, {
      params: { fields: "summary,status,assignee,reporter,priority,created" },
    });

    return {
      key: data.key,
      url: `${process.env.JIRA_BASE_URL}/browse/${data.key}`,
      summary: data.fields.summary || "",
      status: data.fields.status?.name || "",
      priority: data.fields.priority?.name || "",
      assignee: data.fields.assignee?.displayName || "Unassigned",
      reporter: data.fields.reporter?.displayName || "",
      created: data.fields.created ? data.fields.created.slice(0, 10) : "",
    };
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

module.exports = { getIssue };
