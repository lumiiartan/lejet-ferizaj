import { euroTick, makeChart, palette } from "../charts.js";
import { INSTALMENT_STATUS, allocate, reminders } from "../rules.js";
import { forecast, overview } from "../stats.js";
import { getRole, getState, importPayments, today } from "../store.js";
import {
  addDays, daysBetween, downloadText, esc, formatDate, formatDecimal, formatMoney, formatMoneyShort, formatNumber,
  formatPercent, monthLabel, monthLong, openDialog, parseAmount, parseCsv, parseDate, toCsv, toast,
} from "../utils.js";
import { badge, kpi, notice, pageHead } from "./components.js";
import { reminderPreview } from "./case-detail.js";

let pending = null;

const TABS = [
  { id: "pasqyra", label: "Pasqyra" },
  { id: "parashikimi", label: "Parashikimi 12-mujor" },
  { id: "import", label: "Import nga banka" },
  { id: "kujtesat", label: "Kujtesat" },
];

function rowsUpcoming(db, t, from, to) {
  const out = [];
  db.cases.filter((c) => c.plan).forEach((c) => {
    allocate(c, t).instalments.forEach((i) => {
      if (i.paid) return;
      const d = daysBetween(t, i.due);
      if (d >= from && d <= to) out.push({ c, i });
    });
  });
  return out.sort((a, b) => a.i.due.localeCompare(b.i.due));
}

function instalmentTable(rows, t) {
  if (!rows.length) return '<p class="empty">Asnjë këst në këtë periudhë.</p>';
  return `<div class="table-wrap"><table class="data">
    <thead><tr><th>Referenca</th><th>Aplikuesi</th><th>Kësti</th><th>Afati</th><th class="num">Shuma e mbetur</th><th>Statusi</th></tr></thead>
    <tbody>${rows.map(({ c, i }) => `<tr><td><a href="#/lendet/${c.id}?tab=taksa">${c.nr}</a></td><td>${esc(c.applicant.name)}</td><td>${i.n} / ${c.plan.count}</td><td>${formatDate(i.due)}${i.due < t ? `<div class="muted small">${daysBetween(i.due, t)} ditë më parë</div>` : ""}</td><td class="num">${formatMoney(i.amount - i.paidAmount)}</td><td>${badge(INSTALMENT_STATUS[i.status].label, INSTALMENT_STATUS[i.status].tone)}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

function overviewTab(db, t) {
  const s = overview(db, t);
  const f = forecast(db, t);
  const next12 = f.expected.reduce((a, b) => a + b, 0);
  const upcoming = rowsUpcoming(db, t, 0, 30);
  const past = rowsUpcoming(db, t, -3650, -1);
  return `
    <div class="kpi-grid four">
      ${kpi({ label: "E planifikuar këtë vit", value: formatMoneyShort(s.planned), sub: "këste me afat në vitin aktual" })}
      ${kpi({ label: "E arkëtuar", value: formatMoneyShort(s.collected), sub: `${formatPercent(s.planned ? (s.collected / s.planned) * 100 : 0)} e planit`, tone: "ok" })}
      ${kpi({ label: "Në pritje", value: formatMoneyShort(s.pending), sub: "deri në fund të vitit" })}
      ${kpi({ label: "Të pritura në 12 muajt e ardhshëm", value: formatMoneyShort(next12), sub: "për planifikimin e buxhetit", href: "#/pagesat?tab=parashikimi" })}
    </div>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Këste në 30 ditët e ardhshme</h2>${badge(`${upcoming.length} · ${formatMoney(upcoming.reduce((a, r) => a + r.i.amount - r.i.paidAmount, 0))}`, "info")}</div>
        ${instalmentTable(upcoming, t)}
      </section>
      <section class="card">
        <div class="card-head"><h2>Këste pas afatit</h2>${badge(`${past.length}`, past.length ? "warn" : "ok")}</div>
        <p class="muted small">Për këto është dërguar automatikisht një kujtesë e sjellshme. Shumica rregullohen brenda pak ditësh.</p>
        ${instalmentTable(past, t)}
      </section>
    </div>`;
}

function forecastTab(db, t) {
  const f = forecast(db, t);
  const total = f.expected.reduce((a, b) => a + b, 0);
  return `
    <section class="card">
      <div class="card-head"><h2>Të hyrat e pritura nga këstet – 12 muajt e ardhshëm</h2>${badge(formatMoney(total), "info")}</div>
      <p class="muted">Bazuar në planet aktive të pagesës. I dobishëm për planifikimin e buxhetit dhe të projekteve kapitale.</p>
      <div class="chart-box tall"><canvas id="ch-forecast" role="img" aria-label="Parashikimi i të hyrave sipas muajve"></canvas></div>
    </section>
    <section class="card">
      <h2>Sipas muajve</h2>
      <div class="table-wrap"><table class="data"><thead><tr><th>Muaji</th><th class="num">Të pritura</th><th class="num">Kumulative</th></tr></thead><tbody>
        ${f.keys.map((k, i) => `<tr><td>${monthLong(k)}</td><td class="num">${formatMoney(f.expected[i])}</td><td class="num">${formatMoney(f.expected.slice(0, i + 1).reduce((a, b) => a + b, 0))}</td></tr>`).join("")}
      </tbody></table></div>
      ${f.pastDue.count ? `<p class="muted small" style="margin-top:.6rem">Pa përfshirë ${f.pastDue.count} këste pas afatit (${formatMoney(f.pastDue.sum)}), të cilat përcillen veçmas me kujtesa.</p>` : ""}
      <p style="margin-top:.8rem"><button class="btn secondary sm" id="btn-forecast-csv">Eksporto për buxhetin (CSV)</button></p>
    </section>`;
}

function sampleCsv(db, t) {
  const rows = [["data", "referenca", "shuma", "paguesi"]];
  const candidates = rowsUpcoming(db, t, -12, 9).slice(0, 5);
  candidates.forEach(({ c, i }) => rows.push([formatDate(addDays(t, -1)), c.nr, formatDecimal(i.amount - i.paidAmount, 2), c.applicant.name]));
  rows.push([formatDate(addDays(t, -1)), "FER-2026-99X", "150,00", "Pagues i panjohur"]);
  return toCsv(rows);
}

function matchRows(db, rows) {
  return rows.map((r) => {
    const date = parseDate(r.data || r.date);
    const ref = (r.referenca || r.ref || "").trim().toUpperCase();
    const amount = parseAmount(r.shuma || r.amount);
    const c = db.cases.find((x) => x.nr === ref && x.plan);
    const dup = c?.payments.some((p) => p.date === date && Math.abs(p.amount - amount) < 0.01);
    let status = "ok";
    if (!c) status = "nomatch";
    else if (dup) status = "dup";
    else if (!date || !(amount > 0)) status = "invalid";
    return { date, ref, amount, payer: r.paguesi || r.payer || "", c, status };
  });
}

function importTab(db) {
  const log = db.importLog;
  const canImport = ["finance", "director"].includes(getRole());
  return `
    <section class="card">
      <h2>Import i ekstraktit bankar / financiar</h2>
      <p class="muted">Ngarkoni CSV-në nga banka ose nga sistemi financiar. Pagesat përputhen automatikisht me lëndën sipas <strong>referencës</strong> (nr. i lëndës). Rreshtat pa përputhje mbeten për kontroll manual.</p>
      ${canImport ? `
      <div class="import-box">
        <div class="field"><label for="csv-file">Skedari CSV</label><input class="control" type="file" id="csv-file" accept=".csv,text/csv" /></div>
        <div class="field grow"><label for="csv-text">Ose ngjitni përmbajtjen</label><textarea class="control mono" id="csv-text" rows="6" placeholder="data;referenca;shuma;paguesi">${esc(pending?.text ?? "")}</textarea></div>
        <div class="action-bar"><button class="btn secondary" id="btn-sample">Gjenero shembull nga banka</button><button class="btn" id="btn-parse">Kontrollo përputhjen</button></div>
      </div>` : notice("Importi bëhet nga Zyrtari i Financave.", "info")}
    </section>
    ${pending ? previewBlock(pending.rows) : ""}
    <section class="card">
      <h2>Importet e mëparshme</h2>
      ${log.length ? `<ul class="plain-list">${log.map((l) => `<li><strong>${formatDate(l.date)}</strong><span class="muted">${l.count} pagesa · ${formatMoney(l.sum)} · ${esc(l.by)}</span></li>`).join("")}</ul>` : '<p class="muted">Ende asnjë import në këtë demo.</p>'}
    </section>`;
}

function previewBlock(rows) {
  const ok = rows.filter((r) => r.status === "ok");
  const label = { ok: ["Përputhet", "ok"], nomatch: ["Pa përputhje – kontroll manual", "warn"], dup: ["Duket e regjistruar", ""], invalid: ["Rresht i pavlefshëm", "warn"] };
  return `
    <section class="card">
      <div class="card-head"><h2>Parapamja e importit</h2>${badge(`${ok.length} nga ${rows.length} përputhen`, ok.length ? "ok" : "warn")}</div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Data</th><th>Referenca</th><th>Paguesi</th><th class="num">Shuma</th><th>Lënda</th><th>Rezultati</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${formatDate(r.date)}</td><td>${esc(r.ref)}</td><td>${esc(r.payer)}</td><td class="num">${Number.isFinite(r.amount) ? formatMoney(r.amount) : "—"}</td><td>${r.c ? `<a href="#/lendet/${r.c.id}?tab=taksa">${r.c.nr}</a>` : "—"}</td><td>${badge(...label[r.status])}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="action-bar"><button class="btn" id="btn-import" ${ok.length ? "" : "disabled"}>Regjistro ${ok.length} pagesa</button><button class="btn ghost" id="btn-cancel">Anulo</button></div>
    </section>`;
}

function remindersTab(db, t) {
  const list = db.cases.filter((c) => c.plan)
    .flatMap((c) => reminders(c, db.rules, t).map((r) => ({ ...r, c })))
    .filter((r) => daysBetween(r.date, t) <= 10 && daysBetween(t, r.date) <= 14)
    .sort((a, b) => a.date.localeCompare(b.date));
  const sent = list.filter((r) => r.sent);
  const planned = list.filter((r) => !r.sent);
  const table = (rows) => rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Data</th><th>Lënda</th><th>Kësti</th><th>Lloji</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${formatDate(r.date)}</td><td><a href="#/lendet/${r.c.id}?tab=taksa">${r.c.nr}</a><div class="muted small">${esc(r.c.applicant.name)}</div></td><td>${r.inst.n} · ${formatMoney(r.inst.amount - r.inst.paidAmount)}</td><td>${r.kind === "pas" ? badge("Kujtesë e sjellshme", "warn") : badge(r.label, "info")}</td><td><button class="btn ghost sm rem-open" data-key="${r.c.id}|${r.inst.n}|${r.kind}">Shiko</button></td></tr>`).join("")}
  </tbody></table></div>` : '<p class="empty">Asnjë kujtesë.</p>';
  return `
    ${notice(`Kujtesat dërgohen automatikisht me email dhe SMS: ${db.rules.remindBefore.join(" dhe ")} ditë para afatit, dhe një kujtesë e sjellshme ${db.rules.remindAfter} ditë pas afatit nëse pagesa nuk është evidentuar. Në demo dërgimi është i simuluar.`, "info")}
    <div class="grid-2">
      <section class="card"><div class="card-head"><h2>Dërguar (10 ditët e fundit)</h2>${badge(String(sent.length), "ok")}</div>${table(sent)}</section>
      <section class="card"><div class="card-head"><h2>Planifikuar (14 ditët e ardhshme)</h2>${badge(String(planned.length), "info")}</div>${table(planned)}</section>
    </div>`;
}

export function render(parts, params) {
  const db = getState();
  const t = today();
  const tab = TABS.some((x) => x.id === params.tab) ? params.tab : "pasqyra";
  const body = { pasqyra: overviewTab, parashikimi: forecastTab, import: importTab, kujtesat: remindersTab }[tab](db, t);
  return `
    ${pageHead("Taksat dhe pagesat", "Gjendja e pagesave · e dukshme vetëm për rolet e autorizuara të brendshme")}
    <div class="tabs" role="tablist">${TABS.map((x) => `<a role="tab" class="tab ${x.id === tab ? "active" : ""}" aria-selected="${x.id === tab}" href="#/pagesat?tab=${x.id}">${x.label}</a>`).join("")}</div>
    <div class="tab-body stack">${body}</div>`;
}

export function bind(parts, params) {
  const db = getState();
  const t = today();
  const tab = params.tab || "pasqyra";

  if (tab === "parashikimi") {
    const f = forecast(db, t);
    const p = palette();
    let cum = 0;
    makeChart("ch-forecast", {
      type: "bar",
      data: {
        labels: f.keys.map(monthLabel),
        datasets: [
          { type: "bar", label: "Të pritura në muaj", data: f.expected, backgroundColor: p.primary, borderRadius: 4, yAxisID: "y" },
          { type: "line", label: "Kumulative", data: f.expected.map((v) => (cum += v)), borderColor: p.ok, backgroundColor: p.ok, tension: 0.3, yAxisID: "y2", pointRadius: 2 },
        ],
      },
      options: {
        scales: { y: { beginAtZero: true, ticks: { callback: euroTick } }, y2: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: euroTick } } },
        plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatMoney(ctx.raw)}` } } },
      },
    });
    document.getElementById("btn-forecast-csv")?.addEventListener("click", () => {
      const rows = [["muaji", "te_pritura_eur"], ...f.keys.map((k, i) => [k, f.expected[i].toFixed(2)])];
      downloadText(`parashikimi-taksave-${t}.csv`, toCsv(rows));
    });
  }

  if (tab === "import") {
    const text = document.getElementById("csv-text");
    document.getElementById("btn-sample")?.addEventListener("click", () => {
      const csv = sampleCsv(db, t);
      text.value = csv;
      downloadText(`ekstrakt-bankar-${t}.csv`, csv);
      toast("U krijua një ekstrakt shembull (dhe u shkarkua si CSV).");
    });
    document.getElementById("csv-file")?.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) text.value = await file.text();
    });
    document.getElementById("btn-parse")?.addEventListener("click", () => {
      const rows = matchRows(db, parseCsv(text.value));
      if (!rows.length) { toast("Nuk u gjet asnjë rresht. Kontrolloni kokën: data;referenca;shuma;paguesi"); return; }
      pending = { text: text.value, rows };
      location.hash = "#/pagesat?tab=import&p=1";
    });
    document.getElementById("btn-cancel")?.addEventListener("click", () => { pending = null; location.hash = "#/pagesat?tab=import"; });
    document.getElementById("btn-import")?.addEventListener("click", () => {
      const ok = pending.rows.filter((r) => r.status === "ok").map((r) => ({ date: r.date, ref: r.ref, amount: r.amount, payer: r.payer }));
      pending = null;
      const res = importPayments(ok);
      toast(`U regjistruan ${formatNumber(res.count)} pagesa · ${formatMoney(res.sum)}`);
      location.hash = "#/pagesat?tab=import";
    });
  }

  if (tab === "kujtesat") {
    document.querySelectorAll(".rem-open").forEach((btn) => btn.addEventListener("click", () => {
      const [id, n, kind] = btn.dataset.key.split("|");
      const c = db.cases.find((x) => x.id === id);
      const r = reminders(c, db.rules, t).find((x) => x.inst.n === Number(n) && x.kind === kind);
      openDialog(reminderPreview(c, r), { wide: true });
    }));
  }
}
