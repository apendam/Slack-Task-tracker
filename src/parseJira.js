const KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/gi;
const URL_PATTERN = /https?:\/\/[^\s|>]+\/browse\/([A-Z][A-Z0-9]+-\d+)/gi;

/**
 * Finds JIRA ticket keys in a Slack message, whether typed as a bare key
 * (ABC-123, case-insensitive since JIRA's own lookup is) or pasted as a full
 * /browse/ URL. Slack wraps links as <https://...|text>, so URLs are matched
 * before stripping angle brackets.
 */
function extractTicketKeys(text) {
  if (!text) return [];

  const keys = new Set();

  for (const match of text.matchAll(URL_PATTERN)) {
    keys.add(match[1].toUpperCase());
  }

  const withoutUrls = text.replace(URL_PATTERN, " ");
  for (const match of withoutUrls.matchAll(KEY_PATTERN)) {
    keys.add(match[1].toUpperCase());
  }

  return [...keys];
}

module.exports = { extractTicketKeys };
