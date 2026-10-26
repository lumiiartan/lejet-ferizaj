import { LEGAL_DEADLINE, PEOPLE } from "../../data/config.js";
import { euroTick, makeChart, palette } from "../charts.js";
import { allocate, deadline, isOpenDecision, missingDocs } from "../rules.js";
import { monthlySeries, overview, workload } from "../stats.js";
import { getRole, getState, today } from "../store.js";
import { daysBetween, formatDate, formatDecimal, formatMoney, formatMoneyShort, formatNumber, formatPercent, monthLabel } from "../utils.js";
import { kpi, pageHead, tasksPanel } from "./components.js";

function officerTasks(db, t) {
  const mine = db.cases.filter((c) => c.officerId === "o1" && isOpenDecision(c));
  const tasks = [];
  mine.forEach((c) => {
    const d = deadline(c, t);
    const missing = missingDocs(c);
    if (d && d.level !== "ok") {
      tasks.push({ rank: 0 - d.elapsed, tone: d.level === "over" ? "danger" : "warn", href: `#/lendet/${c.id}`, title: `${c.nr} · ${c.applicant.name}`, text: `${d.text}. Prioritet për këtë javë.` });
    } else if (c.status === "ne_shqyrtim" && missing.length) {
      tasks.push({ rank: 10, href: `#/lendet/${c.id}?tab=dosja`, title: `${c.nr} · Mungojnë ${missing.length} dokumente`, text: "Përgatitni kërkesën për plotësim me një klik." });
    } else if (c.status === "ne_shqyrtim") {
      tasks.push({ rank: 20, tone: "ok", href: `#/lendet/${c.id}?tab=parametrat`, title: `${c.nr} · Dosja është e plotë`, text: "Verifikoni parametrat dhe shënojeni «Gati për vendim»." });
    }
    if (c.status === "kerkon_plotesim") {
      const rq = c.requests.at(-1);
      if (rq) tasks.push({ rank: 30, href: `#/lendet/${c.id}?tab=dosja`, title: `${c.nr} · Në pritje të plotësimit`, text: `Afati për aplikuesin: ${formatDate(rq.deadline)}.` });
    }
  });
  const noNational = db.cases.filter((c) => c.officerId === "o1" && !c.nationalNr).length;
  if (noNational) tasks.push({ rank: 40, href: "#/sinkronizimi", title: `${noNational} lëndë pa nr. në sistemin qendror`, text: "Importoni CSV-në nga sistemi qendror për t'i përputhur." });
  return tasks.sort((a, b) => a.rank - b.rank).slice(0, 7);
}

function directorTasks(db, t) {
  const tasks = db.cases.filter((c) => c.status === "gati_per_vendim").map((c) => ({
    tone: "ok", href: `#/lendet/${c.id}`, title: `${c.nr} · Gati për vendim`, text: `${c.applicant.name} · ${deadline(c, t)?.text ?? ""}`,
  }));
  const late = db.cases.filter((c) => (deadline(c, t)?.elapsed ?? 0) >= 40 && c.status !== "gati_per_vendim");
  late.forEach((c) => tasks.push({ tone: "warn", href: `#/lendet/${c.id}`, title: `${c.nr} · ${deadline(c, t).text}`, text: `Zyrtari: ${PEOPLE.officers.find((o) => o.id === c.officerId).name}` }));
  if (!db.rules.zoneCoefConfirmed || !db.rules.feesConfirmed) {
    tasks.push({ href: "#/rregullat", title: "Konfirmoni rregullat e komunës", text: "Koeficientët e zonave dhe tarifat janë ende «TO CONFIRM»." });
  }
  return tasks.slice(0, 8);
}

function financeTasks(db, t) {
  const tasks = [];
  db.cases.filter((c) => c.plan).forEach((c) => {
    allocate(c, t).instalments.forEach((i) => {
      if (i.paid) return;
      const until = daysBetween(t, i.due);
      if (until >= 0 && until <= 7) tasks.push({ rank: until, href: `#/lendet/${c.id}?tab=taksa`, title: `${c.nr} · Kësti ${i.n} skadon më ${formatDate(i.due)}`, text: `${formatMoney(i.amount - i.paidAmount)} · kujtesa dërgohet automatikisht` });
      if (until < 0) tasks.push({ rank: -100, tone: "warn", href: `#/lendet/${c.id}?tab=taksa`, title: `${c.nr} · Kësti ${i.n} pas afatit`, text: `${formatMoney(i.amount - i.paidAmount)} · kujtesë e sjellshme` });
    });
  });
  tasks.sort((a, b) => a.rank - b.rank);
  tasks.unshift({ rank: -200, href: "#/pagesat?tab=import", title: "Importoni ekstraktin bankar të javës", text: "Pagesat përputhen automatikisht sipas referencës." });
  return tasks.slice(0, 8);
}

function mayorTasks(db, t, s) {
  return [
    { tone: "ok", href: "#/raportet", title: "Raporti tremujor për Kuvendin", text: "Gati për shtyp – gjenerohet nga të dhënat e sistemit." },
    { href: "#/raportet?tab=auditimi", title: "Rekomandimet e auditimit", text: "5 nga 6 rekomandime të adresuara përmes mjetit." },
    { href: "#/lendet?status=gati_per_vendim", title: `${s.readyForDecision} lëndë gati për vendim`, text: "Në pritje të nënshkrimit të Drejtorit." },
  ];
}

export function render() {
  const db = getState();
  const role = getRole();
  const t = today();
  const s = overview(db, t);
  const tasks = role === "officer" ? officerTasks(db, t) : role === "director" ? directorTasks(db, t) : role === "finance" ? financeTasks(db, t) : mayorTasks(db, t, s);
  const title = { officer: "Mirë se erdhët, Arbëresha", director: "Paneli i Drejtorit", finance: "Paneli financiar", mayor: "Pasqyra e Kryetarit" }[role];
  const sub = `${formatDate(t)} · Lejet ndërtimore në Komunën e Ferizajt`;
  const avgTone = s.avgDays <= 30 ? "ok" : s.avgDays <= LEGAL_DEADLINE ? "warn" : "danger";
  const collectedPct = s.planned ? (s.collected / s.planned) * 100 : 0;

  const kpis = `
    <div class="kpi-grid">
      ${kpi({ label: "Lëndë aktive", value: formatNumber(s.active), sub: `${s.openDecisions} në shqyrtim · ${s.inConstruction} në ndërtim`, href: "#/lendet" })}
      ${kpi({ label: "Lëndë të përfunduara këtë muaj", value: formatNumber(s.decisionsThisMonth), sub: "vendime të lëshuara", tone: "ok" })}
      ${kpi({ label: "Koha mesatare e trajtimit", value: `${formatDecimal(s.avgDays, 1)} ditë`, sub: `afati ligjor ${LEGAL_DEADLINE} ditë · ${formatPercent(s.withinPct)} brenda afatit`, tone: avgTone })}
      ${kpi({ label: "Të hyrat nga taksat e lejeve", value: formatMoneyShort(s.collected), sub: `${formatPercent(collectedPct)} e planit vjetor ${formatMoneyShort(s.planned)} · në pritje ${formatMoneyShort(s.pending)}`, href: role === "mayor" ? "" : "#/pagesat" })}
      ${kpi({ label: "Këste në 30 ditët e ardhshme", value: formatNumber(s.due30Count), sub: formatMoney(s.due30Sum), href: role === "mayor" ? "" : "#/pagesat" })}
      ${kpi({ label: "Inspektime këtë javë", value: formatNumber(s.inspectionsWeek), sub: `${s.inspectionsWeekDone} të kryera`, href: role === "director" ? "#/inspektimet" : "" })}
    </div>`;

  const charts = `
    <div class="grid-2 charts">
      <section class="card"><div class="card-head"><h2>Lëndë sipas muajve</h2></div><div class="chart-box"><canvas id="ch-cases" aria-label="Aplikime të reja dhe vendime sipas muajve" role="img"></canvas></div></section>
      <section class="card"><div class="card-head"><h2>Koha mesatare e trajtimit</h2><span class="muted small">ditë, krahasuar me afatin 45</span></div><div class="chart-box"><canvas id="ch-time" aria-label="Trendi i kohës mesatare të trajtimit" role="img"></canvas></div></section>
      <section class="card"><div class="card-head"><h2>Arkëtimi i taksave</h2><span class="muted small">e planifikuar / e arkëtuar</span></div><div class="chart-box"><canvas id="ch-fees" aria-label="Taksat e planifikuara dhe të arkëtuara sipas muajve" role="img"></canvas></div></section>
      <section class="card"><div class="card-head"><h2>Ngarkesa sipas zyrtarit</h2><span class="muted small">lëndë në shqyrtim</span></div><div class="chart-box"><canvas id="ch-load" aria-label="Ngarkesa e punës sipas zyrtarit" role="img"></canvas></div></section>
    </div>`;

  return `
    ${pageHead(title, sub)}
    ${role === "mayor" ? kpis : ""}
    <div class="dash-top ${role === "mayor" ? "mayor" : ""}">
      ${tasksPanel(tasks, role === "mayor" ? "Për vëmendjen tuaj" : "Detyrat e mia")}
      ${role === "mayor" ? highlights(s) : ""}
    </div>
    ${role !== "mayor" ? kpis : ""}
    ${charts}`;
}

function highlights(s) {
  return `
    <section class="card highlight">
      <h2>Në një fjali</h2>
      <p class="big-sentence">Këtë muaj u lëshuan <strong>${s.decisionsThisMonth}</strong> vendime, mesatarisht për <strong>${formatDecimal(s.avgDays, 1)} ditë</strong>
      (afati ligjor 45), dhe u arkëtuan <strong>${formatMoneyShort(s.collected)}</strong> nga taksat e lejeve këtë vit.</p>
      <p class="muted small">Pamje vetëm për lexim. Gjendja e pagesave tregohet vetëm në total, pa emra investitorësh.</p>
    </section>`;
}

export function bind() {
  const db = getState();
  const t = today();
  const m = monthlySeries(db, t);
  const p = palette();
  const labels = m.keys.map(monthLabel);

  makeChart("ch-cases", {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Aplikime të reja", data: m.received, backgroundColor: p.primary, borderRadius: 4 },
        { label: "Vendime të lëshuara", data: m.decided, backgroundColor: p.soft, borderRadius: 4 },
      ],
    },
    options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });

  makeChart("ch-time", {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Ditë mesatarisht", data: m.avgDays, borderColor: p.primary, backgroundColor: p.primary, tension: 0.35, spanGaps: true, pointRadius: 3 },
        { label: "Afati ligjor (45)", data: labels.map(() => LEGAL_DEADLINE), borderColor: p.warn, borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
      ],
    },
    options: { scales: { y: { beginAtZero: true, suggestedMax: 50 } } },
  });

  makeChart("ch-fees", {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "E planifikuar", data: m.planned, backgroundColor: p.soft, borderRadius: 4 },
        { label: "E arkëtuar", data: m.collected, backgroundColor: p.ok, borderRadius: 4 },
      ],
    },
    options: { scales: { y: { beginAtZero: true, ticks: { callback: euroTick } } }, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatMoney(ctx.raw)}` } } } },
  });

  const w = workload(db);
  makeChart("ch-load", {
    type: "bar",
    data: {
      labels: w.map((x) => x.officer.name),
      datasets: [
        { label: "Kushte", data: w.map((x) => x.kushte), backgroundColor: p.primary },
        { label: "Leje", data: w.map((x) => x.leje), backgroundColor: p.soft },
        { label: "Pranim / certifikatë", data: w.map((x) => x.tjera), backgroundColor: p.ok },
      ],
    },
    options: { indexAxis: "y", scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true } } },
  });
}
