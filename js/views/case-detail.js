import { CHECKLIST, INSPECTION_PHASES, PEOPLE, STAGES, TYPES } from "../../data/config.js";
import {
  INSPECTION_RESULT, INSPECTION_STATUS, INSTALMENT_STATUS, allocate, applicantNotice, buildSchedule, fee,
  inspectionPhase, isOpenDecision, missingDocs, params, reminderText, reminders, requiredDocs, stageIndex, stageInfo, zoneInfo,
} from "../rules.js";
import {
  approveDecision, backToReview, getCase, getRole, getState, inspectorName, markReady, officerName, recordPayment,
  requestInspection, savePlanDraft, sendCompletionRequest, setNationalNr, toggleDoc, today,
} from "../store.js";
import { addMonths, esc, formatArea, formatDate, formatDecimal, formatMoney, formatPercent, navigate, openDialog, parseAmount, toast } from "../utils.js";
import { canSeePayments, isReadOnly } from "./shell.js";
import { badge, deadlineMeter, notice, stageLabel, statusBadge, stepper } from "./components.js";

const TABS = [
  { id: "permbledhje", label: "Përmbledhje" },
  { id: "kronologjia", label: "Kronologjia" },
  { id: "dosja", label: "Dosja" },
  { id: "parametrat", label: "Parametrat" },
  { id: "taksa", label: "Taksa dhe pagesa" },
  { id: "inspektimet", label: "Inspektimet" },
];

export function floors(c) {
  return `${c.floorsBelow ? `${c.floorsBelow}B+` : ""}P${c.floorsAbove > 1 ? `+${c.floorsAbove - 1}` : ""}${c.penthouse ? "+Pnt" : ""}`;
}

function field(label, value) {
  return `<div class="kv"><dt>${label}</dt><dd>${value}</dd></div>`;
}

function headerActions(c, role) {
  const missing = missingDocs(c);
  const out = [];
  if (!isOpenDecision(c)) return "";
  if (role === "officer") {
    if (c.status === "ne_shqyrtim") {
      out.push(`<button class="btn" id="act-ready" ${missing.length ? "disabled aria-describedby=\"ready-help\"" : ""}>Shëno «Gati për vendim»</button>`);
      if (missing.length) {
        out.push(`<span class="help-inline" id="ready-help">Mungojnë ${missing.length} dokumente · <a href="#/lendet/${c.id}?tab=dosja">shiko dosjen</a></span>`);
        out.push('<button class="btn secondary" id="act-request">Përgatit kërkesën për plotësim</button>');
      }
    }
    if (c.status === "kerkon_plotesim") {
      out.push(`<button class="btn secondary" id="act-review" ${missing.length ? "disabled" : ""}>Dosja u plotësua – kthe në shqyrtim</button>`);
      if (missing.length) out.push(`<span class="help-inline">Në pritje të ${missing.length} dokumenteve nga aplikuesi</span>`);
    }
    if (c.status === "gati_per_vendim") out.push('<span class="help-inline">Lënda është te Drejtori për vendim.</span><button class="btn ghost sm" id="act-review">Kthe në shqyrtim</button>');
  }
  if (role === "director" && c.status === "gati_per_vendim") {
    out.push(`<button class="btn" id="act-approve">Miratoj dhe lësho: ${stageInfo(c.stage).decision}</button>`);
    out.push('<button class="btn ghost sm" id="act-review">Kthe për shqyrtim</button>');
  }
  return out.length ? `<div class="action-bar no-print">${out.join("")}</div>` : "";
}

function summaryTab(c, db, t, role) {
  const p = params(c, db.rules);
  const req = requiredDocs(c);
  const missing = missingDocs(c);
  const a = allocate(c, t);
  const done = c.inspections.filter((i) => i.status === "kryer").length;
  const z = zoneInfo(c.zone);
  const nationalEditable = role === "officer";
  return `
    <div class="mini-grid">
      <a class="card mini" href="#/lendet/${c.id}?tab=dosja"><span class="muted">Dosja</span><strong>${req.length ? `${req.length - missing.length}/${req.length}` : "—"}</strong>${req.length ? badge(missing.length ? `Mungojnë ${missing.length}` : "E plotë", missing.length ? "warn" : "ok") : ""}</a>
      <a class="card mini" href="#/lendet/${c.id}?tab=parametrat"><span class="muted">Koeficienti i ndërtimit</span><strong>${formatDecimal(p.coef, 2)}</strong>${badge(p.ok ? "Brenda normës" : "Kërkon shqyrtim", p.ok ? "ok" : "warn")}</a>
      ${canSeePayments(role) ? `<a class="card mini" href="#/lendet/${c.id}?tab=taksa"><span class="muted">Taksa</span><strong>${formatMoney(c.fee?.total ?? fee(c, db.rules).total)}</strong>${a ? badge(a.active ? `Mbetur ${formatMoney(a.remaining)}` : "E shlyer", a.pastDue.length ? "warn" : a.active ? "info" : "ok") : badge("Parallogaritje", "")}</a>` : ""}
      <a class="card mini" href="#/lendet/${c.id}?tab=inspektimet"><span class="muted">Inspektimet</span><strong>${c.inspections.length ? `${done}/5` : "—"}</strong>${badge(c.inspections.length ? "faza të kryera" : "pas lëshimit të lejes", "")}</a>
    </div>
    <div class="grid-2">
      <section class="card">
        <h2>Identifikimi</h2>
        <dl class="kv-list">
          ${field("Nr. i lëndës (i brendshëm)", `<strong>${c.nr}</strong>`)}
          ${field("Nr. i lëndës në sistemin qendror", nationalEditable
            ? `<span class="inline-edit"><input class="control sm" id="national-nr" value="${esc(c.nationalNr ?? "")}" placeholder="p.sh. eP-2026-01234" aria-label="Nr. i lëndës në sistemin qendror"/><button class="btn secondary sm" id="save-national">Ruaj</button></span>`
            : c.nationalNr ?? badge("Në pritje të numrit", "warn"))}
          ${field("Data e pranimit", formatDate(c.receivedDate))}
          ${field("Faza aktuale", `${stageInfo(c.stage).label} · nga ${formatDate(c.stageStart)}`)}
          ${field("Zyrtari përgjegjës", officerName(c.officerId))}
        </dl>
      </section>
      <section class="card">
        <h2>Aplikuesi dhe projektuesi</h2>
        <dl class="kv-list">
          ${field("Aplikuesi", `${esc(c.applicant.name)} <span class="muted small">(${c.applicant.kind})</span>`)}
          ${field("NUI / Nr. personal", c.applicant.nui)}
          ${field("Personi kontaktues", esc(c.applicant.contact))}
          ${field("Projektuesi", esc(c.designer))}
        </dl>
      </section>
      <section class="card">
        <h2>Lokacioni</h2>
        <dl class="kv-list">
          ${field("Zona urbane", `${z.name}`)}
          ${field("Parcela kadastrale", c.parcel)}
          ${field("Adresa", esc(c.address))}
          ${field("Sipërfaqja e parcelës", formatArea(c.parcelArea))}
          ${field("Sipërfaqe e dhuruar për rrugë publike", c.donatedArea ? formatArea(c.donatedArea) : "—")}
          ${field("Pranë hekurudhës", c.nearRailway ? "Po" : "Jo")}
        </dl>
      </section>
      <section class="card">
        <h2>Objekti</h2>
        <dl class="kv-list cols">
          ${field("Kategoria", `Kategoria ${c.category} · ${TYPES[c.type]}`)}
          ${field("Etazhiteti", floors(c))}
          ${field("Bruto mbi tokë", formatArea(c.grossAbove))}
          ${field("Bruto nën tokë", formatArea(c.grossBelow))}
          ${c.penthouse ? field("Terraca të penthouse-it", formatArea(c.terraceArea)) : ""}
          ${field("Njësi banimi", c.housingUnits)}
          ${field("Njësi afariste", c.businessUnits)}
          ${field("Vende parkimi", c.parkingSpaces)}
          ${field("Sipërfaqe e gjelbër", formatArea(c.greenArea))}
        </dl>
      </section>
    </div>`;
}

const KIND_ICON = { pranim: "↘", kerkese: "✉", dokument: "✓", vendim: "★", pagese: "€", inspektim: "⌂", sync: "⇄" };

function timelineTab(c) {
  const items = [...c.timeline].sort((a, b) => b.date.localeCompare(a.date));
  return `
    <div class="grid-2 wide-left">
      <section class="card">
        <h2>Kronologjia e lëndës</h2>
        <ol class="timeline">
          ${items.map((e) => `
            <li class="tl-${e.kind}">
              <span class="tl-icon" aria-hidden="true">${KIND_ICON[e.kind] ?? "•"}</span>
              <div><strong>${esc(e.title)}</strong><p class="muted">${esc(e.text)}</p><p class="small muted">${formatDate(e.date)} · ${esc(e.by)}</p></div>
            </li>`).join("")}
        </ol>
      </section>
      <section class="card">
        <h2>Vendimet</h2>
        ${c.decisions.length ? `<ul class="plain-list">${c.decisions.map((d) => `<li><strong>${stageInfo(d.stage).decision}</strong><span class="muted">Nr. ${d.nr} · ${formatDate(d.date)} · ${d.days} ditë trajtim</span>${d.stage === "leje" ? `<a class="small" href="#/print/flete/${c.id}">Fleta e llogaritjes</a>` : ""}</li>`).join("")}</ul>` : '<p class="muted">Ende pa vendim.</p>'}
        <h2 style="margin-top:1.2rem">Kërkesat për plotësim</h2>
        ${c.requests.length ? `<ul class="plain-list">${c.requests.map((r) => `<li><strong>${formatDate(r.date)}</strong><span class="muted">${r.items.length} dokumente · afati ${formatDate(r.deadline)}</span><a class="small" href="#/print/kerkese/${c.id}/${r.id}">Hap letrën</a></li>`).join("")}</ul>` : '<p class="muted">Asnjë kërkesë.</p>'}
      </section>
    </div>`;
}

function docsTab(c, role) {
  const editable = role === "officer" && isOpenDecision(c);
  const stages = STAGES.filter((s) => requiredDocs(c, s.id).length && stageIndex(s.id) <= stageIndex(c.stage));
  const missing = missingDocs(c);
  return `
    <section class="card">
      <div class="card-head">
        <h2>Lista e kontrollit · ${stageInfo(c.stage).label}</h2>
        ${isOpenDecision(c) ? badge(missing.length ? `Mungojnë ${missing.length} dokumente` : "Dosja e plotë", missing.length ? "warn" : "ok") : ""}
      </div>
      ${isOpenDecision(c) ? notice(missing.length
        ? "Lista ndihmon të shihet shpejt çka mungon. Kur dokumentet të jenë në dosje, lënda mund të shënohet «Gati për vendim»."
        : "Të gjitha dokumentet e kërkuara për këtë kategori janë në dosje.", missing.length ? "info" : "ok") : ""}
      ${stages.slice().reverse().map((s) => `
        <h3 class="sub-h">${s.label}${s.id !== c.stage ? ' <span class="muted small">· fazë e përfunduar</span>' : ""}</h3>
        <ul class="checklist">
          ${requiredDocs(c, s.id).map((item) => {
            const d = c.docs[item.id];
            const id = `doc-${item.id}`;
            const can = editable && s.id === c.stage;
            return `<li class="${d?.present ? "present" : "missing"}">
              <input type="checkbox" id="${id}" data-doc="${item.id}" ${d?.present ? "checked" : ""} ${can ? "" : "disabled"} />
              <label for="${id}"><span>${item.label}</span>${item.hint ? `<span class="muted small"> · ${item.hint}</span>` : ""}</label>
              <span class="small ${d?.present ? "muted" : "warn-text"}">${d?.present ? `Pranuar ${formatDate(d.date)}` : "Mungon"}</span>
            </li>`;
          }).join("")}
        </ul>`).join("")}
      <p class="muted small" style="margin-top:.8rem">Lista ndryshon sipas kategorisë: p.sh. elaborati i gropës kërkohet vetëm kur ka etazhe nën tokë, pëlqimi i Infrakos vetëm pranë hekurudhës.</p>
      ${editable && missing.length ? '<div class="action-bar"><button class="btn" id="act-request-2">Përgatit kërkesën për plotësim</button></div>' : ""}
    </section>`;
}

function indicator(ok) {
  return ok ? badge("Brenda normës", "ok") : badge("Kërkon shqyrtim", "warn");
}

export function paramsBlock(c, rules) {
  const p = params(c, rules);
  const z = zoneInfo(c.zone);
  return `
    <table class="calc">
      <thead><tr><th>Treguesi</th><th>Llogaritja</th><th class="num">Rezultati</th><th>Norma</th><th>Vlerësimi</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Sipërfaqja bazë e parcelës</strong></td>
          <td>${formatArea(c.parcelArea)}${c.donatedArea ? (rules.donatedLand === "zbritet" ? ` − ${formatArea(c.donatedArea)} (e dhuruar për rrugë)` : ` · ${formatArea(c.donatedArea)} e dhuruar llogaritet në parcelë`) : ""}</td>
          <td class="num">${formatArea(p.base)}</td><td class="muted small">Rregulli: ${rules.donatedLand === "zbritet" ? "toka e dhuruar zbritet" : "toka e dhuruar përfshihet"}</td><td></td>
        </tr>
        <tr>
          <td><strong>Sipërfaqja bruto mbi tokë</strong></td>
          <td>${formatArea(c.grossAbove)}${c.penthouse ? (rules.penthouseTerraces === "bruto" ? ` + ${formatArea(c.terraceArea)} terraca penthouse` : ` · terracat (${formatArea(c.terraceArea)}) si neto, nuk llogariten`) : ""}</td>
          <td class="num">${formatArea(p.gross)}</td><td class="muted small">Rregulli: terracat si ${rules.penthouseTerraces}</td><td></td>
        </tr>
        <tr class="key">
          <td><strong>Koeficienti i ndërtimit (ISPN)</strong></td>
          <td>${formatArea(p.gross)} ÷ ${formatArea(p.base)}</td>
          <td class="num"><strong>${formatDecimal(p.coef, 2)}</strong></td>
          <td>max ${formatDecimal(p.maxCoef, 2)} · ${z.name} ${rules.zoneCoefConfirmed ? "" : '<span class="badge sm tc">TO CONFIRM</span>'}</td>
          <td>${indicator(p.checks.coef)}</td>
        </tr>
        <tr class="key">
          <td><strong>Vende parkimi</strong></td>
          <td>${c.housingUnits} njësi banimi × ${formatDecimal(rules.parkingPerUnit, 1)} + ${c.businessUnits} njësi afariste × ${formatDecimal(rules.parkingPerBusiness, 1)}</td>
          <td class="num"><strong>${c.parkingSpaces}</strong> të projektuara</td>
          <td>min ${p.parkingReq}</td>
          <td>${indicator(p.checks.parking)}</td>
        </tr>
        <tr class="key">
          <td><strong>Sipërfaqja e gjelbër</strong></td>
          <td>${formatArea(c.greenArea)} ÷ ${formatArea(p.base)}</td>
          <td class="num"><strong>${formatPercent(p.greenPct, 1)}</strong></td>
          <td>min ${formatPercent(rules.greenMinPct)}</td>
          <td>${indicator(p.checks.green)}</td>
        </tr>
      </tbody>
    </table>`;
}

function paramsTab(c, db) {
  const p = params(c, db.rules);
  return `
    <section class="card">
      <div class="card-head">
        <h2>Kalkulatori i parametrave</h2>
        <a class="btn secondary sm no-print" href="#/print/flete/${c.id}">Fleta e llogaritjes (shtyp)</a>
      </div>
      ${notice(p.ok
        ? "Të gjithë treguesit janë brenda normave të përcaktuara nga komuna."
        : `${p.reviewCount === 1 ? "Një tregues kërkon" : `${p.reviewCount} tregues kërkojnë`} shqyrtim nga zyrtari dhe Drejtori. Llogaritja tregon saktë pse.`, p.ok ? "ok" : "warn")}
      <div class="table-wrap">${paramsBlock(c, db.rules)}</div>
      <p class="muted small" style="margin-top:.8rem">Rregullat vendosen një herë nga Drejtori te <a href="#/rregullat">Rregullat</a> dhe zbatohen njësoj për çdo lëndë. Çdo numër këtu del edhe në fletën e llogaritjes që i bashkëngjitet vendimit.</p>
    </section>`;
}

function feeLines(f) {
  return `
    <table class="data">
      <thead><tr><th>Përbërësi</th><th class="num">Baza</th><th class="num">Tarifa</th><th class="num">Shuma</th></tr></thead>
      <tbody>
        ${f.lines.map((l) => `<tr><td>${l.label}</td><td class="num">${l.basis === "fikse" ? "—" : formatArea(l.qty)}</td><td class="num">${l.basis === "fikse" ? "fikse" : `${formatMoney(l.unit)}/m²`}</td><td class="num">${formatMoney(l.amount)}</td></tr>`).join("")}
        <tr class="total"><td colspan="3">Gjithsej</td><td class="num">${formatMoney(f.total)}</td></tr>
      </tbody>
    </table>`;
}

function scheduleTable(instalments, withStatus) {
  return `
    <table class="data">
      <thead><tr><th>Kësti</th><th>Afati</th><th class="num">Shuma</th>${withStatus ? '<th class="num">Paguar</th><th>Statusi</th>' : ""}</tr></thead>
      <tbody>${instalments.map((i) => `<tr><td>${i.n}</td><td>${formatDate(i.due)}</td><td class="num">${formatMoney(i.amount)}</td>${withStatus ? `<td class="num">${formatMoney(i.paidAmount)}${i.paidDate ? `<div class="muted small">${formatDate(i.paidDate)}</div>` : ""}</td><td>${badge(INSTALMENT_STATUS[i.status].label, INSTALMENT_STATUS[i.status].tone)}</td>` : ""}</tr>`).join("")}</tbody>
    </table>`;
}

function planDraftForm(c, db, t, role) {
  const f = fee(c, db.rules);
  const d = c.planDraft ?? { count: 1, downPct: db.rules.minDownPct, stepMonths: 1 };
  const preview = buildSchedule(f.total, { ...d, firstDue: t }, addMonths);
  const editable = ["officer", "finance", "director"].includes(role);
  return `
    <section class="card">
      <div class="card-head"><h2>Plani i pagesës (propozim)</h2>${badge(d.count > 1 ? `${d.count} këste` : "Pagesë e njëhershme", "info")}</div>
      <p class="muted">Aplikuesi mund të paguajë në tërësi ose me këste. Plani fiksohet kur lëshohet leja; kësti i parë paguhet para lëshimit.</p>
      ${editable ? `
      <form class="plan-form" id="plan-form">
        <div class="field"><label for="pl-count">Numri i kësteve</label>
          <select class="control" id="pl-count">${Array.from({ length: db.rules.maxInstalments }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === d.count ? "selected" : ""}>${n === 1 ? "1 (në tërësi)" : n}</option>`).join("")}</select></div>
        <div class="field"><label for="pl-down">Kësti i parë (%)</label>
          <input class="control" id="pl-down" type="number" min="${db.rules.minDownPct}" max="100" step="5" value="${d.downPct}" /></div>
        <div class="field"><label for="pl-step">Shpeshtësia</label>
          <select class="control" id="pl-step"><option value="1" ${d.stepMonths === 1 ? "selected" : ""}>Mujore</option><option value="3" ${d.stepMonths === 3 ? "selected" : ""}>Tremujore</option></select></div>
        <button class="btn secondary" type="submit">Ruaj propozimin</button>
      </form>` : ""}
      <div class="table-wrap" style="margin-top:.8rem">${scheduleTable(preview, false)}</div>
      <p class="muted small">Datat llogariten nga dita e lëshimit të lejes. Rregullat: maksimumi ${db.rules.maxInstalments} këste, kësti i parë së paku ${db.rules.minDownPct}%.</p>
    </section>`;
}

function feeTab(c, db, t, role) {
  const a = allocate(c, t);
  const f = c.fee ?? fee(c, db.rules);
  const others = applicantNotice(c, db.cases, t);
  const parts = [];
  if (others) parts.push(noticeForApplicant(others));
  parts.push(`
    <section class="card">
      <div class="card-head"><h2>Llogaritja e taksës</h2>${c.fee ? badge(`Fiksuar më ${formatDate(c.fee.date)}`, "ok") : badge("Parallogaritje", "")}</div>
      <p class="muted">${c.fee ? "Taksa u fiksua me lëshimin e lejes sipas tarifave në fuqi." : "Llogaritet automatikisht nga sipërfaqja bruto dhe tarifat e konfiguruara; fiksohet me lëshimin e lejes."}</p>
      <div class="table-wrap">${feeLines(f)}</div>
    </section>`);
  if (!a) {
    if (c.stage === "kushte" || c.stage === "leje") parts.push(planDraftForm(c, db, t, role));
    return `<div class="stack">${parts.join("")}</div>`;
  }
  const rem = reminders(c, db.rules, t);
  const canRecord = ["finance", "director"].includes(role);
  parts.push(`
    <div class="mini-grid">
      <div class="card mini"><span class="muted">Shuma totale</span><strong>${formatMoney(a.total)}</strong></div>
      <div class="card mini"><span class="muted">Paguar</span><strong>${formatMoney(a.paid)}</strong>${badge(formatPercent((a.paid / a.total) * 100), "ok")}</div>
      <div class="card mini"><span class="muted">Mbetur</span><strong>${formatMoney(a.remaining)}</strong></div>
      <div class="card mini"><span class="muted">Kësti i radhës</span><strong>${a.next ? formatMoney(a.next.amount - a.next.paidAmount) : "—"}</strong>${a.next ? badge(formatDate(a.next.due), INSTALMENT_STATUS[a.next.status].tone) : badge("I shlyer", "ok")}</div>
    </div>
    <div class="grid-2 wide-left">
      <section class="card">
        <div class="card-head"><h2>Plani i pagesës</h2>${badge(c.plan.count > 1 ? `${c.plan.count} këste · ${c.plan.stepMonths === 3 ? "tremujore" : "mujore"}` : "Pagesë e njëhershme", "info")}</div>
        <div class="table-wrap">${scheduleTable(a.instalments, true)}</div>
      </section>
      <div class="stack">
        ${canRecord ? `
        <section class="card">
          <h2>Regjistro pagesë</h2>
          <form class="stack-form" id="pay-form">
            <div class="field"><label for="pay-date">Data</label><input class="control" id="pay-date" type="date" value="${t}" max="${t}" required /></div>
            <div class="field"><label for="pay-amount">Shuma (€)</label><input class="control" id="pay-amount" inputmode="decimal" value="${a.next ? formatDecimal(a.next.amount - a.next.paidAmount, 2) : ""}" required /></div>
            <div class="field"><label for="pay-note">Shënim</label><input class="control" id="pay-note" placeholder="p.sh. nr. i fletëpagesës" /></div>
            <button class="btn" type="submit">Regjistro</button>
          </form>
          <p class="muted small">Ose importoni ekstraktin bankar te <a href="#/pagesat?tab=import">Taksat dhe pagesat</a>.</p>
        </section>` : ""}
        <section class="card">
          <h2>Pagesat e evidentuara</h2>
          <ul class="plain-list">${[...c.payments].sort((x, y) => y.date.localeCompare(x.date)).map((p) => `<li><strong>${formatMoney(p.amount)}</strong><span class="muted">${formatDate(p.date)} · ${p.source === "csv" ? "import bankar" : p.source === "manual" ? "manual" : "bankë"}${p.note ? ` · ${esc(p.note)}` : ""}</span></li>`).join("")}</ul>
        </section>
      </div>
    </div>
    <section class="card">
      <div class="card-head"><h2>Kujtesat automatike</h2><span class="muted small">${db.rules.remindBefore.join(" dhe ")} ditë para afatit · ${db.rules.remindAfter} ditë pas afatit</span></div>
      ${rem.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Data</th><th>Kësti</th><th>Lloji</th><th>Kanali</th><th>Statusi</th><th></th></tr></thead><tbody>
        ${rem.sort((x, y) => x.date.localeCompare(y.date)).slice(-8).map((r, i) => `<tr><td>${formatDate(r.date)}</td><td>${r.inst.n} · ${formatDate(r.inst.due)}</td><td>${r.label}</td><td>Email + SMS</td><td>${badge(r.sent ? "Dërguar" : "Planifikuar", r.sent ? "ok" : "info")}</td><td><button class="btn ghost sm rem-preview" data-i="${i}">Shiko</button></td></tr>`).join("")}
      </tbody></table></div>` : '<p class="muted">Nuk ka kujtesa të nevojshme: këstet janë paguar para afatit.</p>'}
    </section>`);
  return `<div class="stack">${parts.join("")}</div>`;
}

function noticeForApplicant(others) {
  return notice(
    `Aplikuesi ka një plan pagese aktiv me këste të pashlyera; verifikoni para lëshimit të vendimit të ri. <span class="muted">(${others.map((o) => `<a href="#/lendet/${o.id}?tab=taksa">${o.nr}</a>`).join(", ")})</span><br/><span class="small muted">Ky është njoftim, jo refuzim automatik – vendimin e merr Drejtori.</span>`,
    "warn",
    "Për informim",
  );
}

function inspectionsTab(c, role) {
  if (!c.inspections.length) {
    return `<section class="card">${notice("Plani i inspektimeve krijohet automatikisht kur lëshohet leja ndërtimore, dhe leja ndahet menjëherë me Inspektoratin.", "info")}
      <ol class="phase-plan muted">${INSPECTION_PHASES.map((p) => `<li>${p.label}</li>`).join("")}</ol></section>`;
  }
  const next = c.inspections.find((i) => i.status !== "kryer");
  const canSimulate = !isReadOnly(role) && next && next.status === "ne_pritje";
  return `
    <section class="card">
      <div class="card-head"><h2>Inspektimet sipas fazave</h2>${canSimulate ? `<button class="btn secondary sm" id="sim-request" data-phase="${next.phase}">Simulo: investitori kërkon inspektim (${inspectionPhase(next.phase).label})</button>` : ""}</div>
      <ol class="phases">
        ${c.inspections.map((i) => {
          const ph = inspectionPhase(i.phase);
          const st = INSPECTION_STATUS[i.status];
          return `<li class="phase ${i.status}">
            <div class="phase-head"><strong>${ph.label}</strong>${badge(st.label, st.tone)}${i.result ? badge(INSPECTION_RESULT[i.result].label, INSPECTION_RESULT[i.result].tone) : ""}</div>
            <p class="muted small">${i.status === "kryer" ? `Kryer më ${formatDate(i.doneDate)}` : `Planifikuar: ${formatDate(i.planned)}`} · ${inspectorName(i.inspectorId)}${i.requestedDate && i.status === "kerkuar" ? ` · kërkuar më ${formatDate(i.requestedDate)}` : ""}</p>
            ${i.notes ? `<p class="small">${esc(i.notes)}</p>` : ""}
            <div class="phase-actions">
              ${i.status === "kryer" ? `<a class="btn ghost sm" href="#/print/procesverbal/${c.id}/${i.phase}">Procesverbali</a>` : ""}
              ${role === "inspector" && i.status !== "kryer" && i.status !== "ne_pritje" ? `<a class="btn sm" href="#/inspektimi/${c.id}/${i.phase}">Hap formularin në terren</a>` : ""}
            </div>
          </li>`;
        }).join("")}
      </ol>
    </section>`;
}

export function render(parts, params) {
  const c = getCase(parts[1]);
  if (!c) return '<section class="card"><h1>Lënda nuk u gjet</h1><p><a href="#/lendet">Kthehu te lëndët</a></p></section>';
  const db = getState();
  const t = today();
  const role = getRole();
  const tabs = TABS.filter((x) => x.id !== "taksa" || canSeePayments(role));
  const tab = tabs.some((x) => x.id === params.tab) ? params.tab : "permbledhje";
  const others = canSeePayments(role) ? applicantNotice(c, db.cases, t) : null;
  const body = {
    permbledhje: () => summaryTab(c, db, t, role),
    kronologjia: () => timelineTab(c),
    dosja: () => docsTab(c, role),
    parametrat: () => paramsTab(c, db),
    taksa: () => feeTab(c, db, t, role),
    inspektimet: () => inspectionsTab(c, role),
  }[tab]();

  return `
    <nav class="crumbs no-print" aria-label="Rruga"><a href="#/lendet">Lëndët</a> <span aria-hidden="true">›</span> <span>${c.nr}</span></nav>
    <section class="card case-head">
      <div class="case-title">
        <div>
          <h1>${c.nr} <span class="muted thin">· ${esc(c.applicant.name)}</span></h1>
          <p class="muted">${TYPES[c.type]} · ${floors(c)} · ${esc(c.address)} · Zona ${c.zone} · ${c.nationalNr ? `Sistemi qendror: ${c.nationalNr}` : "Pa nr. në sistemin qendror"}</p>
        </div>
        <div class="chips">${statusBadge(c)}${badge(stageLabel(c), "")}${isReadOnly(role) ? badge("Vetëm lexim", "") : ""}</div>
      </div>
      ${stepper(c)}
      ${deadlineMeter(c, t)}
      ${others && tab !== "taksa" && role !== "mayor" ? noticeForApplicant(others) : ""}
      ${isReadOnly(role) ? "" : headerActions(c, role)}
    </section>
    <div class="tabs no-print" role="tablist" aria-label="Seksionet e lëndës">
      ${tabs.map((x) => `<a role="tab" class="tab ${x.id === tab ? "active" : ""}" aria-selected="${x.id === tab}" href="#/lendet/${c.id}?tab=${x.id}">${x.label}${x.id === "dosja" && isOpenDecision(c) && missingDocs(c).length ? ` <span class="count">${missingDocs(c).length}</span>` : ""}</a>`).join("")}
    </div>
    <div class="tab-body" role="tabpanel">${body}</div>`;
}

function openRequestDialog(c) {
  const missing = missingDocs(c);
  const dialog = openDialog(`
    <h2>Kërkesë për plotësim të dosjes</h2>
    <p class="muted">Lënda ${c.nr} · ${esc(c.applicant.name)}</p>
    <form id="rq-form" class="stack-form">
      <fieldset><legend>Dokumentet që kërkohen</legend>
        ${missing.map((m) => `<label class="check-row"><input type="checkbox" name="item" value="${m.id}" checked /> ${m.label}</label>`).join("")}
      </fieldset>
      <div class="field"><label for="rq-days">Afati për dorëzim</label>
        <select class="control" id="rq-days"><option value="8">8 ditë</option><option value="15" selected>15 ditë</option><option value="30">30 ditë</option></select></div>
      <p class="muted small">Letra është e sjellshme dhe standarde. Ruhet në kronologjinë e lëndës dhe mund të shtypet ose t'i dërgohet aplikuesit me email.</p>
      <button class="btn" type="submit">Krijo letrën</button>
    </form>`);
  dialog.querySelector("#rq-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const items = [...dialog.querySelectorAll('input[name="item"]:checked')].map((x) => x.value);
    if (!items.length) return;
    const rq = sendCompletionRequest(c.id, items, Number(dialog.querySelector("#rq-days").value));
    dialog.close();
    navigate(`print/kerkese/${c.id}/${rq.id}`);
  });
}

function openApproveDialog(c) {
  const db = getState();
  const t = today();
  const p = params(c, db.rules);
  const f = fee(c, db.rules);
  const others = applicantNotice(c, db.cases, t);
  const draft = c.planDraft ?? { count: 1 };
  const dialog = openDialog(`
    <h2>${stageInfo(c.stage).decision}</h2>
    <p class="muted">${c.nr} · ${esc(c.applicant.name)} · ${officerName(c.officerId)}</p>
    <ul class="plain-list">
      <li><strong>Dosja</strong><span>${missingDocs(c).length ? `Mungojnë ${missingDocs(c).length} dokumente` : "E plotë"}</span></li>
      ${["kushte", "leje"].includes(c.stage) ? `<li><strong>Parametrat</strong><span>ISPN ${formatDecimal(p.coef, 2)} (max ${formatDecimal(p.maxCoef, 2)}) · ${p.ok ? "brenda normës" : `${p.reviewCount} tregues kërkojnë shqyrtim`}</span></li>` : ""}
      ${c.stage === "leje" ? `<li><strong>Taksa</strong><span>${formatMoney(f.total)} · ${draft.count > 1 ? `plan me ${draft.count} këste` : "pagesë e njëhershme"}</span></li>` : ""}
      ${c.stage === "leje" ? "<li><strong>Pas lëshimit</strong><span>Leja ndahet me Inspektoratin dhe krijohet plani i 5 inspektimeve.</span></li>" : ""}
    </ul>
    ${others ? noticeForApplicant(others) : ""}
    ${!p.ok && ["kushte", "leje"].includes(c.stage) ? notice("Disa tregues kërkojnë shqyrtim. Mund të vazhdoni nëse arsyetimi është në dosje, ose ta ktheni lëndën te zyrtari.", "warn") : ""}
    <div class="action-bar"><button class="btn" id="confirm-approve">Nënshkruaj dhe lësho</button></div>`);
  dialog.querySelector("#confirm-approve").addEventListener("click", () => {
    const stageBefore = c.stage;
    const nr = approveDecision(c.id);
    dialog.close();
    toast(`U lëshua vendimi ${nr}${stageBefore === "leje" ? " · leja u nda me Inspektoratin" : ""}`);
  });
}

export function bind(parts) {
  const c = getCase(parts[1]);
  if (!c) return;
  const db = getState();
  const t = today();
  document.getElementById("act-ready")?.addEventListener("click", () => { markReady(c.id); toast("Lënda u dërgua te Drejtori për vendim."); });
  document.getElementById("act-review")?.addEventListener("click", () => backToReview(c.id));
  document.getElementById("act-request")?.addEventListener("click", () => openRequestDialog(c));
  document.getElementById("act-request-2")?.addEventListener("click", () => openRequestDialog(c));
  document.getElementById("act-approve")?.addEventListener("click", () => openApproveDialog(c));
  document.getElementById("save-national")?.addEventListener("click", () => {
    setNationalNr(c.id, document.getElementById("national-nr").value);
    toast("Nr. në sistemin qendror u ruajt.");
  });
  document.querySelectorAll("[data-doc]").forEach((el) => el.addEventListener("change", () => toggleDoc(c.id, el.dataset.doc)));

  const planForm = document.getElementById("plan-form");
  if (planForm) {
    const read = () => ({
      count: Number(document.getElementById("pl-count").value),
      downPct: Math.max(db.rules.minDownPct, Math.min(100, Number(document.getElementById("pl-down").value) || db.rules.minDownPct)),
      stepMonths: Number(document.getElementById("pl-step").value),
    });
    planForm.addEventListener("change", () => savePlanDraft(c.id, read()));
    planForm.addEventListener("submit", (e) => { e.preventDefault(); savePlanDraft(c.id, read()); toast("Propozimi i planit u ruajt."); });
  }

  document.getElementById("pay-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseAmount(document.getElementById("pay-amount").value);
    if (!(amount > 0)) { toast("Shkruani një shumë të vlefshme."); return; }
    recordPayment(c.id, { date: document.getElementById("pay-date").value, amount, note: document.getElementById("pay-note").value });
    toast(`Pagesa ${formatMoney(amount)} u regjistrua.`);
  });

  const rem = reminders(c, db.rules, t).sort((x, y) => x.date.localeCompare(y.date)).slice(-8);
  document.querySelectorAll(".rem-preview").forEach((btn) => btn.addEventListener("click", () => {
    const r = rem[Number(btn.dataset.i)];
    openDialog(reminderPreview(c, r), { wide: true });
  }));

  document.getElementById("sim-request")?.addEventListener("click", (e) => {
    requestInspection(c.id, e.target.dataset.phase);
    toast("Kërkesa e investitorit u regjistrua dhe iu shfaq inspektorit.");
  });
}

export function reminderPreview(c, r) {
  const msg = reminderText(c, r);
  return `
    <h2>Parapamje e kujtesës</h2>
    <p class="muted">${r.label} · ${r.sent ? `dërguar më ${formatDate(r.date)}` : `planifikuar për ${formatDate(r.date)}`} · simulim</p>
    <div class="preview-grid">
      <div class="mail"><div class="mail-head"><span class="muted small">Për:</span> ${esc(c.applicant.contact)} &lt;info@${c.applicant.name.toLowerCase().split(" ")[0].normalize("NFD").replace(/[^a-z]/g, "")}.example&gt;<br/><span class="muted small">Tema:</span> <strong>${esc(msg.subject)}</strong></div><pre>${esc(msg.email)}</pre></div>
      <div class="sms"><div class="phone"><div class="bubble">${esc(msg.sms)}</div></div></div>
    </div>`;
}
