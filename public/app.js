let tickets = [];
let activeBucket = "";
let sortKey = "lastSynced";

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const searchEl = document.getElementById("search");
const assigneeFilterEl = document.getElementById("assigneeFilter");
const sortSelectEl = document.getElementById("sortSelect");
const lastRefreshedEl = document.getElementById("lastRefreshed");
const refreshBtn = document.getElementById("refreshBtn");
const tabsEl = document.getElementById("tabs");

function statusClass(status) {
  const s = (status || "").toLowerCase();
  if (/(done|closed|resolved)/.test(s)) return "done";
  if (/(progress|review|testing)/.test(s)) return "progress";
  return "todo";
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function populateAssigneeOptions() {
  const current = assigneeFilterEl.value;
  const names = [...new Set(tickets.map((t) => t.assignee).filter(Boolean))].sort();
  assigneeFilterEl.innerHTML = `<option value="">All assignees</option>`;
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    assigneeFilterEl.appendChild(opt);
  });
  assigneeFilterEl.value = current;
}

function updateTabCounts() {
  const counts = { "": tickets.length, todo: 0, progress: 0, done: 0 };
  tickets.forEach((t) => counts[statusClass(t.status)]++);
  Object.entries(counts).forEach(([bucket, count]) => {
    const el = document.getElementById(`count-${bucket}`);
    if (el) el.textContent = `(${count})`;
  });
}

function applyFiltersAndSort() {
  const search = searchEl.value.trim().toLowerCase();
  const assignee = assigneeFilterEl.value;

  let rows = tickets.filter((t) => {
    if (activeBucket && statusClass(t.status) !== activeBucket) return false;
    if (assignee && t.assignee !== assignee) return false;
    if (!search) return true;
    return [t.key, t.summary, t.assignee, t.reporter].join(" ").toLowerCase().includes(search);
  });

  rows.sort((a, b) => (b[sortKey] || "").toString().localeCompare((a[sortKey] || "").toString()));
  return rows;
}

function cardHtml(t) {
  const postedByLink = t.slackLink
    ? `<a href="${t.slackLink}" target="_blank" rel="noopener">${t.postedBy || "someone"}</a>`
    : t.postedBy || "someone";

  return `
    <div class="card">
      <div class="card-main">
        <div class="card-title">
          <span class="key">${t.key}</span>
          <span class="summary">${t.summary || "(no summary)"}</span>
        </div>
        <div class="card-meta">
          ${t.assignee || "Unassigned"} · raised ${t.raisedDate || "—"} by ${t.reporter || "—"} · posted by ${postedByLink} · synced ${timeAgo(t.lastSynced)}
        </div>
      </div>
      <div class="card-side">
        ${t.priority ? `<span class="badge todo">${t.priority}</span>` : ""}
        <span class="badge ${statusClass(t.status)}">${t.status || "—"}</span>
        <a href="${t.url}" target="_blank" rel="noopener">Open →</a>
      </div>
    </div>`;
}

function render() {
  populateAssigneeOptions();
  updateTabCounts();

  const rows = applyFiltersAndSort();
  emptyEl.hidden = tickets.length > 0;
  listEl.innerHTML = rows.map(cardHtml).join("");
  lastRefreshedEl.textContent = `Updated ${timeAgo(new Date().toISOString())}`;
}

async function load() {
  const res = await fetch("/api/tickets");
  tickets = await res.json();
  render();
}

tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  activeBucket = btn.dataset.bucket;
  tabsEl.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  render();
});

[searchEl, assigneeFilterEl].forEach((el) => el.addEventListener("input", render));
sortSelectEl.addEventListener("change", () => {
  sortKey = sortSelectEl.value;
  render();
});
refreshBtn.addEventListener("click", load);

load();
setInterval(load, 20000);
