import { CHECKLIST, MUNICIPALITY, PEOPLE, PRODUCT, TYPES } from "../../data/config.js";
import { fee, inspectionPhase, params, stageInfo, zoneInfo, INSPECTION_RESULT } from "../rules.js";
import { periodReport } from "../stats.js";
import { getCase, getState, inspectorName, officerName, today } from "../store.js";
import { esc, formatArea, formatDate, formatMoney, formatNumber, formatDecimal, formatPercent } from "../utils.js";
import { floors, paramsBlock } from "./case-detail.js";
import { narrative, periods } from "./reports.js";

function sheet(title, back, body, ref = "") {
  return `
    <div class="print-toolbar no-print">
      <a class="btn ghost sm" href="${back}">‹ Kthehu</a>
      <button class="btn sm" onclick="window.print()">Shtyp / ruaj si PDF</button>
    </div>
    <article class="print-sheet">
      <header class="letterhead">
        <img src="./assets/logo.svg" alt="" width="54" height="54" />
        <div>
          <p class="lh-1">Republika e Kosovës · ${MUNICIPALITY}</p>
          <p class="lh-2">Drejtoria e Urbanizmit</p>
        </div>
        <div class="lh-ref">${ref}<br/>Data: ${formatDate(today())}</div>
      </header>
      <div class="accent-line"></div>
      <h1>${title}</h1>
      ${body}
      <footer class="sheet-foot">Gjeneruar nga ${PRODUCT} · Demo – të gjitha të dhënat janë fiktive</footer>
    </article>`;
}

function signRow(a, b) {
  return `<div class="sign-row"><div class="sign-line">${a}</div><div class="sign-line">${b}</div></div>`;
}

function caseBox(c) {
  return `
    <table class="meta-table">
      <tr><th>Nr. i lëndës</th><td>${c.nr}${c.nationalNr ? ` · sistemi qendror ${c.nationalNr}` : ""}</td></tr>
      <tr><th>Aplikuesi</th><td>${esc(c.applicant.name)} (${c.applicant.nui})</td></tr>
      <tr><th>Objekti</th><td>${TYPES[c.type]} · Kategoria ${c.category} · ${floors(c)}</td></tr>
      <tr><th>Lokacioni</th><td>${esc(c.address)} · parcela ${c.parcel} · ${zoneInfo(c.zone).name}</td></tr>
    </table>`;
}

function requestLetter(c, rqId) {
  const rq = c.requests.find((r) => r.id === rqId) ?? c.requests.at(-1);
  if (!rq) return "<p>Kërkesa nuk u gjet.</p>";
  const items = rq.items.map((id) => CHECKLIST.find((x) => x.id === id)?.label ?? id);
  const days = Math.round((new Date(rq.deadline) - new Date(rq.date)) / 86400000);
  return sheet("Kërkesë për plotësim të dosjes", `#/lendet/${c.id}?tab=dosja`, `
    <p class="addr"><strong>Për:</strong> ${esc(c.applicant.name)}<br/>Në vëmendje të: ${esc(c.applicant.contact)}</p>
    <p class="addr"><strong>Lënda:</strong> ${stageInfo(rq.stage).label} · ${c.nr}</p>
    <p>I nderuar / E nderuar ${esc(c.applicant.contact)},</p>
    <p>Ju falënderojmë për aplikimin për <strong>${stageInfo(rq.stage).label.toLowerCase()}</strong> për objektin në ${esc(c.address)}, parcela kadastrale ${c.parcel}.
    Gjatë shqyrtimit vërejtëm se, për ta përfunduar vendimin sa më shpejt, dosjes i nevojiten edhe dokumentet në vijim:</p>
    <ol class="letter-list">${items.map((i) => `<li>${i}</li>`).join("")}</ol>
    <p>Ju lutemi t'i dorëzoni brenda <strong>${days} ditëve</strong>, deri më <strong>${formatDate(rq.deadline)}</strong>, në sportelin e Drejtorisë së Urbanizmit ose përmes sistemit qendror të lejeve${c.nationalNr ? ` (lënda ${c.nationalNr})` : ""}.
    Sapo dokumentet të pranohen, shqyrtimi vazhdon menjëherë.</p>
    <p>Për çdo pyetje jemi në dispozicion: ${officerName(c.officerId)}, zyrtar/e për leje ndërtimore, tel. 0290 000 000.</p>
    <p>Me respekt,</p>
    ${signRow(`${officerName(c.officerId)}<br/>Zyrtar/e për leje`, `${PEOPLE.director.name}<br/>${PEOPLE.director.title}`)}`, `Nr. ref.: ${c.nr}/K${c.requests.indexOf(rq) + 1}`);
}

function calcSheet(c) {
  const db = getState();
  const rules = db.rules;
  const p = params(c, rules);
  const f = c.fee ?? fee(c, rules);
  return sheet("Fletë llogaritjeje e parametrave dhe taksës", `#/lendet/${c.id}?tab=parametrat`, `
    ${caseBox(c)}
    <h2>1. Parametrat urbanistikë</h2>
    ${paramsBlock(c, rules)}
    <p class="small">Vlerësimi i përgjithshëm: <strong>${p.ok ? "Të gjithë treguesit brenda normës" : `${p.reviewCount} tregues kërkojnë shqyrtim`}</strong>.</p>
    <h2>2. Taksa e lejes</h2>
    <table class="calc">
      <thead><tr><th>Përbërësi</th><th class="num">Baza</th><th class="num">Tarifa</th><th class="num">Shuma</th></tr></thead>
      <tbody>${f.lines.map((l) => `<tr><td>${l.label}</td><td class="num">${l.basis === "fikse" ? "—" : formatArea(l.qty)}</td><td class="num">${l.basis === "fikse" ? "fikse" : `${formatMoney(l.unit)}/m²`}</td><td class="num">${formatMoney(l.amount)}</td></tr>`).join("")}
      <tr class="total"><td colspan="3">Gjithsej</td><td class="num">${formatMoney(f.total)}</td></tr></tbody>
    </table>
    ${c.plan ? `<p class="small">Plan pagese: ${c.plan.count} këste${c.plan.count > 1 ? `, kësti i parë ${formatMoney(c.plan.instalments[0].amount)}` : ""}.</p>` : ""}
    <h2>3. Rregullat e zbatuara</h2>
    <ul class="small">
      <li>Koeficienti maksimal për ${zoneInfo(c.zone).name}: ${formatDecimal(p.maxCoef, 2)}${rules.zoneCoefConfirmed ? "" : " (TO CONFIRM)"}</li>
      <li>Terracat e penthouse-it: llogariten si ${rules.penthouseTerraces}</li>
      <li>Toka e dhuruar për rrugë publike: ${rules.donatedLand === "zbritet" ? "zbritet nga parcela" : "përfshihet në parcelë"}</li>
      <li>Parkimi: ${formatDecimal(rules.parkingPerUnit, 1)} vend për njësi banimi, ${formatDecimal(rules.parkingPerBusiness, 1)} për njësi afariste · Gjelbërimi minimal: ${rules.greenMinPct}%</li>
    </ul>
    ${signRow(`Përgatiti: ${officerName(c.officerId)}`, `Miratoi: ${PEOPLE.director.name}`)}`, `Nr. ref.: ${c.nr}/FL`);
}

function protocol(c, phaseId) {
  const i = c.inspections.find((x) => x.phase === phaseId);
  const ph = inspectionPhase(phaseId);
  if (!i || i.status !== "kryer") return "<p>Inspektimi nuk është kryer ende.</p>";
  return sheet(`Procesverbal i inspektimit – ${ph.label}`, `#/lendet/${c.id}?tab=inspektimet`, `
    ${caseBox(c)}
    <table class="meta-table">
      <tr><th>Data e inspektimit</th><td>${formatDate(i.doneDate)}</td></tr>
      <tr><th>Inspektori</th><td>${inspectorName(i.inspectorId)}</td></tr>
      <tr><th>Faza</th><td>${ph.label}</td></tr>
    </table>
    <h2>Lista e kontrollit</h2>
    <table class="calc"><tbody>
      ${ph.checks.map((label, idx) => `<tr><td>${label}</td><td>${i.checks[idx] === false ? "Vërejtje" : "Në rregull"}</td></tr>`).join("")}
    </tbody></table>
    ${i.notes ? `<p><strong>Shënime:</strong> ${esc(i.notes)}</p>` : ""}
    ${i.photos ? `<p class="small">Fotografi të bashkëngjitura: ${i.photos}</p>` : ""}
    <p><strong>Përfundimi:</strong> ${INSPECTION_RESULT[i.result].label}.</p>
    ${signRow(`Inspektori: ${inspectorName(i.inspectorId)}`, `Përfaqësuesi i investitorit: ${esc(c.applicant.contact)}`)}`, `Nr. ref.: ${c.nr}/I-${phaseId}`);
}

function assemblyReport(pid) {
  const db = getState();
  const p = periods(today())[pid] ?? periods(today()).tm;
  const r = periodReport(db, p.start, p.end);
  return sheet(`Raport për Kuvendin e Komunës – lejet ndërtimore`, "#/raportet", `
    <p class="muted">Periudha: ${p.label} · ${formatDate(p.start)} – ${formatDate(p.end)}</p>
    <h2>Përmbledhje</h2>
    <p>${narrative(r, p.label)}</p>
    <h2>Treguesit</h2>
    <table class="calc"><tbody>
      <tr><td>Aplikime të reja</td><td class="num">${formatNumber(r.received)}</td></tr>
      <tr><td>Kushte ndërtimore të lëshuara</td><td class="num">${r.kushte}</td></tr>
      <tr><td>Leje ndërtimore të lëshuara</td><td class="num">${r.leje}</td></tr>
      <tr><td>Pranime teknike</td><td class="num">${r.pranim}</td></tr>
      <tr><td>Certifikata përdorimi</td><td class="num">${r.certifikate}</td></tr>
      <tr><td>Koha mesatare e trajtimit</td><td class="num">${formatDecimal(r.avg, 1)} ditë</td></tr>
      <tr><td>Vendime brenda afatit ligjor (45 ditë)</td><td class="num">${formatPercent(r.within)}</td></tr>
      <tr><td>Taksa të planifikuara</td><td class="num">${formatMoney(r.planned)}</td></tr>
      <tr><td>Taksa të arkëtuara</td><td class="num">${formatMoney(r.collected)}</td></tr>
      <tr><td>Inspektime të kryera</td><td class="num">${formatNumber(r.inspections)}</td></tr>
      <tr><td>Sipërfaqe ndërtimi e lejuar</td><td class="num">${formatArea(r.grossApproved)}</td></tr>
      <tr><td>Njësi banimi të lejuara</td><td class="num">${formatNumber(r.units)}</td></tr>
    </tbody></table>
    <p class="small muted">Raporti përmban vetëm të dhëna agregate; nuk përfshin të dhëna personale apo gjendje pagesash për investitorë individualë.</p>
    ${signRow(`${PEOPLE.director.name}<br/>${PEOPLE.director.title}`, "Kryetari i Komunës")}`, "Raport periodik");
}

export function render(parts, params) {
  const [, kind, id, extra] = parts;
  if (kind === "raport") return assemblyReport(params.p);
  const c = getCase(id);
  if (!c) return "<p>Lënda nuk u gjet.</p>";
  if (kind === "kerkese") return requestLetter(c, extra);
  if (kind === "flete") return calcSheet(c);
  if (kind === "procesverbal") return protocol(c, extra);
  return "<p>Dokumenti nuk u gjet.</p>";
}
