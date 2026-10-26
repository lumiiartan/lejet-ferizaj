import { AUDIT_RECOMMENDATIONS, LEGAL_DEADLINE } from "../../data/config.js";
import { periodReport, quarterRange } from "../stats.js";
import { getState, today } from "../store.js";
import { downloadText, formatArea, formatDate, formatDecimal, formatMoney, formatNumber, formatPercent, toCsv } from "../utils.js";
import { badge, kpi, pageHead } from "./components.js";

export function periods(t) {
  const cur = quarterRange(t, 0);
  const prev = quarterRange(t, -1);
  const year = t.slice(0, 4);
  return {
    tm: { ...cur, label: `${cur.label} (deri më sot)` },
    tmp: prev,
    viti: { start: `${year}-01-01`, end: t, label: `Viti ${year} (deri më sot)` },
  };
}

export function narrative(r, label) {
  return `Gjatë periudhës ${label}, Drejtoria e Urbanizmit pranoi <strong>${formatNumber(r.received)}</strong> aplikime të reja dhe lëshoi <strong>${formatNumber(r.decisions)}</strong> vendime
    (${r.kushte} kushte ndërtimore, ${r.leje} leje ndërtimore, ${r.pranim} pranime teknike dhe ${r.certifikate} certifikata përdorimi).
    Koha mesatare e trajtimit ishte <strong>${formatDecimal(r.avg, 1)} ditë</strong>, ndërsa <strong>${formatPercent(r.within)}</strong> e vendimeve u lëshuan brenda afatit ligjor prej ${LEGAL_DEADLINE} ditësh.
    Nga taksat e lejeve u arkëtuan <strong>${formatMoney(r.collected)}</strong> nga <strong>${formatMoney(r.planned)}</strong> të planifikuara për periudhën (${formatPercent(r.collectionPct)}).
    Inspektorati kreu <strong>${formatNumber(r.inspections)}</strong> inspektime sipas fazave, prej të cilave ${formatNumber(r.inspectionsOk)} në përputhje të plotë me lejen.
    Lejet e lëshuara mundësojnë <strong>${formatArea(r.grossApproved)}</strong> sipërfaqe ndërtimi dhe <strong>${formatNumber(r.units)}</strong> njësi banimi.`;
}

function assemblyTab(t, pid) {
  const db = getState();
  const ps = periods(t);
  const p = ps[pid] ?? ps.tm;
  const r = periodReport(db, p.start, p.end);
  return `
    <section class="card">
      <div class="card-head">
        <h2>Raporti për Kuvendin e Komunës</h2>
        <div class="seg-links" role="group" aria-label="Periudha">
          ${Object.entries(ps).map(([id, x]) => `<a class="chip-link ${x === p ? "active" : ""}" href="#/raportet?p=${id}">${x.label}</a>`).join("")}
        </div>
      </div>
      <p class="muted">${formatDate(p.start)} – ${formatDate(p.end)} · gjenerohet automatikisht nga të dhënat e sistemit, pa punë shtesë.</p>
    </section>
    <div class="kpi-grid">
      ${kpi({ label: "Aplikime të reja", value: formatNumber(r.received) })}
      ${kpi({ label: "Vendime të lëshuara", value: formatNumber(r.decisions), tone: "ok" })}
      ${kpi({ label: "Koha mesatare", value: `${formatDecimal(r.avg, 1)} ditë`, sub: `afati ${LEGAL_DEADLINE} ditë` })}
      ${kpi({ label: "Brenda afatit", value: formatPercent(r.within), tone: r.within >= 90 ? "ok" : "warn" })}
      ${kpi({ label: "Taksa të arkëtuara", value: formatMoney(r.collected), sub: `${formatPercent(r.collectionPct)} e planit` })}
      ${kpi({ label: "Inspektime", value: formatNumber(r.inspections), sub: `${r.inspectionsOk} në përputhje` })}
    </div>
    <section class="card">
      <h2>Përmbledhje narrative</h2>
      <p class="narrative">${narrative(r, p.label)}</p>
      <div class="action-bar"><a class="btn" href="#/print/raport?p=${pid || "tm"}">Shtyp / ruaj si PDF</a><button class="btn secondary" id="btn-report-csv">Eksporto tabelat (CSV)</button></div>
    </section>`;
}

function auditTab() {
  const done = AUDIT_RECOMMENDATIONS.filter((r) => r.status === "zbatuar").length;
  return `
    <section class="card">
      <div class="card-head"><h2>Rekomandimet e auditimit dhe si adresohen</h2>${badge(`${done} nga ${AUDIT_RECOMMENDATIONS.length} të adresuara`, "ok")}</div>
      <p class="muted">Pasqyrë e rekomandimeve tipike të auditimit për procesin e lejeve dhe e mënyrës si mjeti i mbështet ato. Rekomandimet janë shembuj për demo.</p>
      <ul class="audit-list">
        ${AUDIT_RECOMMENDATIONS.map((r) => `
          <li>
            <div class="audit-head"><strong>${r.title}</strong>${badge(r.status === "zbatuar" ? "Adresuar" : "Në proces", r.status === "zbatuar" ? "ok" : "warn")}</div>
            <p class="muted">${r.how}</p>
          </li>`).join("")}
      </ul>
    </section>`;
}

export function render(parts, params) {
  const t = today();
  const tab = params.tab === "auditimi" ? "auditimi" : "kuvendi";
  return `
    ${pageHead("Raportet", "Raportim i lehtë për Kuvendin dhe për auditimin")}
    <div class="tabs" role="tablist">
      <a role="tab" class="tab ${tab === "kuvendi" ? "active" : ""}" aria-selected="${tab === "kuvendi"}" href="#/raportet">Raporti për Kuvendin</a>
      <a role="tab" class="tab ${tab === "auditimi" ? "active" : ""}" aria-selected="${tab === "auditimi"}" href="#/raportet?tab=auditimi">Rekomandimet e auditimit</a>
    </div>
    <div class="tab-body stack">${tab === "kuvendi" ? assemblyTab(t, params.p) : auditTab()}</div>`;
}

export function bind(parts, params) {
  document.getElementById("btn-report-csv")?.addEventListener("click", () => {
    const t = today();
    const p = periods(t)[params.p] ?? periods(t).tm;
    const r = periodReport(getState(), p.start, p.end);
    const rows = [
      ["treguesi", "vlera"],
      ["periudha", `${formatDate(p.start)} - ${formatDate(p.end)}`],
      ["aplikime_te_reja", r.received],
      ["vendime_gjithsej", r.decisions],
      ["kushte_ndertimore", r.kushte],
      ["leje_ndertimore", r.leje],
      ["pranime_teknike", r.pranim],
      ["certifikata_perdorimi", r.certifikate],
      ["koha_mesatare_dite", r.avg.toFixed(1)],
      ["brenda_afatit_pct", r.within.toFixed(1)],
      ["taksa_planifikuar_eur", r.planned.toFixed(2)],
      ["taksa_arketuar_eur", r.collected.toFixed(2)],
      ["inspektime", r.inspections],
    ];
    downloadText(`raporti-lejet-${p.start}.csv`, toCsv(rows));
  });
}
