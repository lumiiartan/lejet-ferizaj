const MONTH_SHORT = ["Jan", "Shk", "Mar", "Pri", "Maj", "Qer", "Kor", "Gsh", "Sht", "Tet", "Nën", "Dhj"];
const MONTH_LONG = ["janar", "shkurt", "mars", "prill", "maj", "qershor", "korrik", "gusht", "shtator", "tetor", "nëntor", "dhjetor"];

function group(intPart) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function formatMoney(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const sign = n < 0 ? "-" : "";
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${sign}${group(int)},${dec} €`;
}

export function formatMoneyShort(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${formatDecimal(n / 1_000_000, 2)} mln €`;
  if (Math.abs(n) >= 10_000) return `${group(String(Math.round(n / 1000)))}k €`;
  return formatMoney(n);
}

export function formatNumber(value) {
  const n = Math.round(Number(value) || 0);
  return (n < 0 ? "-" : "") + group(String(Math.abs(n)));
}

export function formatDecimal(value, digits = 2) {
  const [int, dec] = (Number(value) || 0).toFixed(digits).split(".");
  return dec ? `${group(int)},${dec}` : group(int);
}

export function formatArea(value) {
  return `${formatNumber(value)} m²`;
}

export function formatPercent(value, digits = 0) {
  return `${formatDecimal(value, digits)}%`;
}

export function parseAmount(text) {
  const raw = String(text ?? "").replace(/[€\s]/g, "");
  if (!raw) return NaN;
  if (raw.includes(",")) return Number(raw.replace(/\./g, "").replace(",", "."));
  return Number(raw);
}

export function parseDate(text) {
  const t = String(text ?? "").trim();
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso, months) {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function monthLabel(key) {
  const [y, m] = key.split("-");
  return `${MONTH_SHORT[Number(m) - 1]} ${y.slice(2)}`;
}

export function monthLong(key) {
  const [y, m] = key.split("-");
  return `${MONTH_LONG[Number(m) - 1]} ${y}`;
}

export function lastMonths(today, count) {
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) keys.push(monthKey(addMonths(`${today.slice(0, 7)}-01`, -i)));
  return keys;
}

export function nextMonths(today, count) {
  const keys = [];
  for (let i = 0; i < count; i += 1) keys.push(monthKey(addMonths(`${today.slice(0, 7)}-01`, i)));
  return keys;
}

export function startOfWeek(iso) {
  const d = new Date(`${iso}T12:00:00`);
  const shift = (d.getDay() + 6) % 7;
  return addDays(iso, -shift);
}

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(query));
  return { parts, params };
}

export function navigate(path) {
  location.hash = `#/${path.replace(/^\//, "")}`;
}

export function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff", text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows, sep = ";") {
  return rows
    .map((row) => row.map((cell) => {
      const value = String(cell ?? "");
      return value.includes(sep) || /["\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }).join(sep))
    .join("\n");
}

export function parseCsv(text) {
  const lines = String(text ?? "").replace(/^\ufeff/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const split = (line) => {
    const out = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = !quoted;
      } else if (ch === sep && !quoted) { out.push(cur.trim()); cur = ""; } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

export function toast(text) {
  document.querySelector(".toast")?.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.setAttribute("role", "status");
  node.textContent = text;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

export function openDialog(html, { wide = false } = {}) {
  document.querySelector("dialog.modal")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = `modal${wide ? " wide" : ""}`;
  dialog.innerHTML = `
    <div class="modal-body">${html}</div>
    <form method="dialog" class="modal-foot"><button class="btn secondary" value="close">Mbyll</button></form>`;
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  return dialog;
}
