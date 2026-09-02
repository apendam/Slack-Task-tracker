let tickets = [];
let sortKey = "lastSynced";
let sortDir = -1;

const rowsEl = document.getElementById("rows");
const statsEl = document.getElementById("stats");
const emptyEl = document.getElementById("empty");
const searchEl = document.getElementById("search");
const statusFilterEl = document.getElementById("statusFilter");
const assigneeFilterEl = document.getElementById("assigneeFilter");

function statusClass(status) {
  const s = (status || "").toLowerCase();
  if (/(done|closed|resolved)/.test(s)) return "done";
  if (/(progress|review|testing)/.test(s)) return "progress";
  return "todo";
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function populateFilterOptions(select, values, placeholder) {
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  [...new Set(values)].sort().forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
  select.value = current;
}

function renderStats() {
  const byStatus = {};
  tickets.forEach((t) => {
    const bucket = statusClass(t.status);
    byStatus[bucket] = (byStatus[bucket] || 0) + 1;
  });

  const cards = [
    { label: "Total", value: tickets.length },
    { label: "To Do", value: byStatus.todo || 0 },
    { label: "In Progress", value: byStatus.progress || 0 },
    { label: "Done", value: byStatus.done || 0 },
  ];

  statsEl.innerHTML = cards
    .map((c) => `<div class="stat"><div class="value">${c.value}</div><div class="label">${c.label}</div></div>`)
    .join("");
}

function applyFiltersAndSort() {
  const search = searchEl.value.trim().toLowerCase();
  const status = statusFilterEl.value;
  const assignee = assigneeFilterEl.value;

  let rows = tickets.filter((t) => {
    if (status && t.status !== status) return false;
    if (assignee && t.assignee !== assignee) return false;
    if (!search) return true;
    return [t.key, t.summary, t.assignee, t.reporter]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });

  rows.sort((a, b) => {
    const av = (a[sortKey] || "").toString();
    const bv = (b[sortKey] || "").toString();
    return av.localeCompare(bv) * sortDir;
  });

  return rows;
}

function render() {
  populateFilterOptions(statusFilterEl, tickets.map((t) => t.status).filter(Boolean), "All statuses");
  populateFilterOptions(assigneeFilterEl, tickets.map((t) => t.assignee).filter(Boolean), "All assignees");
  renderStats();

  const rows = applyFiltersAndSort();
  emptyEl.hidden = tickets.length > 0;

  rowsEl.innerHTML = rows
    .map(
      (t) => `
    <tr>
      <td><a href="${t.url}" target="_blank" rel="noopener">${t.key}</a></td>
      <td class="summary">${t.summary || ""}</td>
      <td><span class="badge ${statusClass(t.status)}">${t.status || "—"}</span></td>
      <td>${t.priority || "—"}</td>
      <td>${t.assignee || "Unassigned"}</td>
      <td>${t.reporter || "—"}</td>
      <td>${t.raisedDate || "—"}</td>
      <td>${t.slackLink ? `<a href="${t.slackLink}" target="_blank" rel="noopener">${t.postedBy || "—"}</a>` : t.postedBy || "—"}</td>
      <td>${fmtDate(t.lastSynced)}</td>
    </tr>`
    )
    .join("");
}

async function load() {
  const res = await fetch("/api/tickets");
  tickets = await res.json();
  render();
}

document.querySelectorAll("th[data-key]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.key;
    sortDir = sortKey === key ? -sortDir : 1;
    sortKey = key;
    render();
  });
});

[searchEl, statusFilterEl, assigneeFilterEl].forEach((el) => el.addEventListener("input", render));

load();
setInterval(load, 20000);
