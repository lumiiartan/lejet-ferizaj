import { INSPECTION_RESULT, INSPECTION_STATUS, inspectionPhase, params } from "../rules.js";
import { completeInspection, getCase, getRole, getState, inspectorName, scheduleInspection, today } from "../store.js";
import { addDays, daysBetween, esc, formatArea, formatDate, formatDecimal, navigate, startOfWeek, toast } from "../utils.js";
import { badge, notice, pageHead } from "./components.js";
import { floors } from "./case-detail.js";

const photoUrls = [];

function allInspections(db) {
  return db.cases.flatMap((c) => c.inspections.map((i) => ({ c, i, ph: inspectionPhase(i.phase) })));
}

function card(x, t, { showSchedule = false } = {}) {
  const { c, i, ph } = x;
  const st = INSPECTION_STATUS[i.status];
  const d = daysBetween(t, i.planned);
  const when = d === 0 ? "Sot" : d === 1 ? "Nesër" : d < 0 ? `${-d} ditë më parë` : `për ${d} ditë`;
  return `
    <li class="insp-card ${i.status}">
      <div class="insp-top">
        <strong>${ph.label}</strong>
        ${badge(st.label, st.tone)}
      </div>
      <p><a href="#/lendet/${c.id}?tab=inspektimet">${c.nr}</a> · ${esc(c.applicant.name)}</p>
      <p class="muted small">${esc(c.address)} · ${floors(c)}</p>
      <p class="small"><strong>${formatDate(i.planned)}</strong> <span class="muted">(${when}) · ${inspectorName(i.inspectorId)}</span></p>
      ${i.result ? `<p>${badge(INSPECTION_RESULT[i.result].label, INSPECTION_RESULT[i.result].tone)}</p>` : ""}
      <div class="insp-actions">
        ${i.status === "kryer"
          ? `<a class="btn ghost sm" href="#/print/procesverbal/${c.id}/${i.phase}">Procesverbali</a>`
          : `<a class="btn sm" href="#/inspektimi/${c.id}/${i.phase}">Fillo inspektimin</a>`}
        ${showSchedule && i.status === "kerkuar" ? `<label class="sched"><span class="sr-only">Data e inspektimit</span><input type="date" class="control sm sched-date" data-case="${c.id}" data-phase="${i.phase}" value="${i.planned}" min="${t}"/></label>` : ""}
      </div>
    </li>`;
}

function listView(params) {
  const db = getState();
  const t = today();
  const role = getRole();
  const mineOnly = role === "inspector" && params.te !== "gjitha";
  const all = allInspections(db).filter((x) => (mineOnly ? x.i.inspectorId === "i1" : true));
  const weekStart = startOfWeek(t);
  const weekEnd = addDays(weekStart, 6);
  const requests = all.filter((x) => x.i.status === "kerkuar").sort((a, b) => a.i.planned.localeCompare(b.i.planned));
  const week = all.filter((x) => x.i.status === "planifikuar" && x.i.planned <= addDays(weekEnd, 7)).sort((a, b) => a.i.planned.localeCompare(b.i.planned));
  const done = all.filter((x) => x.i.status === "kryer" && daysBetween(x.i.doneDate, t) <= 30).sort((a, b) => b.i.doneDate.localeCompare(a.i.doneDate));
  const newPermits = db.cases.filter((c) => c.decisions.some((d) => d.stage === "leje" && daysBetween(d.date, t) <= 45));

  return `
    ${pageHead("Inspektimet", `${role === "inspector" ? "Fatmir Osmani · " : ""}Inspektime sipas fazave të ndërtimit`, role === "inspector" ? `<a class="btn secondary sm" href="#/inspektimet${mineOnly ? "?te=gjitha" : ""}">${mineOnly ? "Shfaq të gjitha" : "Vetëm të miat"}</a>` : "")}
    <div class="grid-2 insp-layout">
      <section class="card">
        <div class="card-head"><h2>Kërkesa nga investitorët</h2>${badge(String(requests.length), requests.length ? "warn" : "ok")}</div>
        <p class="muted small">Investitori kërkon inspektim kur përfundon një fazë. Konfirmoni datën ose filloni drejtpërdrejt.</p>
        ${requests.length ? `<ul class="insp-list">${requests.map((x) => card(x, t, { showSchedule: role !== "mayor" })).join("")}</ul>` : '<p class="empty">Asnjë kërkesë e re.</p>'}
      </section>
      <section class="card">
        <div class="card-head"><h2>Të planifikuara (dy javët e ardhshme)</h2>${badge(String(week.length), "info")}</div>
        ${week.length ? `<ul class="insp-list">${week.map((x) => card(x, t)).join("")}</ul>` : '<p class="empty">Asnjë inspektim i planifikuar.</p>'}
      </section>
      <section class="card">
        <div class="card-head"><h2>Leje të reja të ndara me Inspektoratin</h2>${badge(String(newPermits.length), "")}</div>
        <p class="muted small">Me lëshimin e lejes, Inspektorati e merr automatikisht bashkë me planin e 5 fazave.</p>
        <ul class="plain-list">${newPermits.map((c) => `<li><a href="#/lendet/${c.id}?tab=inspektimet"><strong>${c.nr}</strong></a><span class="muted">${esc(c.applicant.name)} · leja ${formatDate(c.decisions.find((d) => d.stage === "leje").date)}</span></li>`).join("") || '<li class="muted">Asnjë në 45 ditët e fundit.</li>'}</ul>
      </section>
      <section class="card">
        <div class="card-head"><h2>Të kryera (30 ditët e fundit)</h2>${badge(String(done.length), "ok")}</div>
        ${done.length ? `<ul class="insp-list compact">${done.slice(0, 8).map((x) => card(x, t)).join("")}</ul>` : '<p class="empty">Asnjë.</p>'}
      </section>
    </div>`;
}

function fieldView(c, phaseId) {
  const db = getState();
  const i = c.inspections.find((x) => x.phase === phaseId);
  const ph = inspectionPhase(phaseId);
  const p = params(c, db.rules);
  if (!i) return '<section class="card"><p>Inspektimi nuk u gjet.</p></section>';
  if (i.status === "kryer") {
    return `${pageHead(`Inspektimi: ${ph.label}`, c.nr)}<section class="card">${notice(`Ky inspektim është kryer më ${formatDate(i.doneDate)}.`, "ok")}<p style="margin-top:1rem"><a class="btn" href="#/print/procesverbal/${c.id}/${phaseId}">Hap procesverbalin</a></p></section>`;
  }
  return `
    <nav class="crumbs no-print"><a href="#/inspektimet">Inspektimet</a> <span aria-hidden="true">›</span> <span>${c.nr}</span></nav>
    <div class="field-screen">
      <section class="card">
        <p class="eyebrow">Inspektim në terren</p>
        <h1>${ph.label}</h1>
        <p><strong>${c.nr}</strong> · ${esc(c.applicant.name)}</p>
        <p class="muted">${esc(c.address)} · Parcela ${c.parcel}</p>
      </section>
      <section class="card">
        <h2>Çka lejon leja</h2>
        <dl class="permit-grid">
          <div><dt>Etazhiteti</dt><dd>${floors(c)}</dd></div>
          <div><dt>Bruto mbi tokë</dt><dd>${formatArea(c.grossAbove)}</dd></div>
          <div><dt>Bruto nën tokë</dt><dd>${formatArea(c.grossBelow)}</dd></div>
          <div><dt>Koeficienti</dt><dd>${formatDecimal(p.coef, 2)}</dd></div>
          <div><dt>Parkingje</dt><dd>${c.parkingSpaces}</dd></div>
          <div><dt>Gjelbërim</dt><dd>${formatArea(c.greenArea)}</dd></div>
        </dl>
      </section>
      <form class="card" id="field-form">
        <h2>Lista e kontrollit</h2>
        <ul class="field-checks">
          ${ph.checks.map((label, idx) => `
            <li>
              <span class="fc-label" id="fc-l-${idx}">${label}</span>
              <span class="seg" role="radiogroup" aria-labelledby="fc-l-${idx}">
                <input type="radio" name="fc-${idx}" id="fc-${idx}-y" value="1" checked /><label for="fc-${idx}-y">Në rregull</label>
                <input type="radio" name="fc-${idx}" id="fc-${idx}-n" value="0" /><label for="fc-${idx}-n">Vërejtje</label>
              </span>
            </li>`).join("")}
        </ul>
        <div class="field"><label for="fc-notes">Shënime</label><textarea class="control" id="fc-notes" rows="3" placeholder="Vërejtje, masa, afati për rishikim…"></textarea></div>
        <div class="field">
          <label for="fc-photos">Fotografi</label>
          <input class="control" type="file" id="fc-photos" accept="image/*" capture="environment" multiple />
          <div class="thumbs" id="thumbs"></div>
        </div>
        <div class="field">
          <span class="lbl">Lokacioni</span>
          <button type="button" class="btn secondary sm" id="fc-gps">Merr koordinatat</button>
          <span class="muted small" id="fc-gps-out"></span>
        </div>
        <div id="fc-result" class="fc-result"></div>
        <button class="btn block" type="submit">Përfundo dhe nënshkruaj</button>
        <p class="muted small center">Procesverbali krijohet automatikisht dhe ruhet në lëndë.</p>
      </form>
    </div>`;
}

export function render(parts, params) {
  if (parts[0] === "inspektimi") {
    const c = getCase(parts[1]);
    if (!c) return '<section class="card"><p>Lënda nuk u gjet.</p></section>';
    return fieldView(c, parts[2]);
  }
  return listView(params);
}

export function bind(parts) {
  document.querySelectorAll(".sched-date").forEach((el) => el.addEventListener("change", () => {
    scheduleInspection(el.dataset.case, el.dataset.phase, el.value);
    toast(`Data u konfirmua: ${formatDate(el.value)} · investitori njoftohet.`);
  }));

  const form = document.getElementById("field-form");
  if (!form) return;
  const [, caseId, phaseId] = parts;
  photoUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  let coords = null;

  const readChecks = () => Object.fromEntries([...form.querySelectorAll(".field-checks li")].map((_, idx) => [idx, form.querySelector(`input[name="fc-${idx}"]:checked`).value === "1"]));
  const showResult = () => {
    const checks = readChecks();
    const ok = Object.values(checks).every(Boolean);
    document.getElementById("fc-result").innerHTML = ok
      ? badge(INSPECTION_RESULT.ne_rregull.label, "ok")
      : `${badge(INSPECTION_RESULT.verejtje.label, "warn")} <span class="muted small">Investitori njoftohet për rishikim.</span>`;
  };
  form.addEventListener("change", showResult);
  showResult();

  document.getElementById("fc-photos").addEventListener("change", (e) => {
    const box = document.getElementById("thumbs");
    [...e.target.files].forEach((f) => {
      const url = URL.createObjectURL(f);
      photoUrls.push(url);
      box.insertAdjacentHTML("beforeend", `<img src="${url}" alt="Foto nga terreni" />`);
    });
  });

  document.getElementById("fc-gps").addEventListener("click", () => {
    const out = document.getElementById("fc-gps-out");
    const fallback = () => {
      coords = "42.3702° V, 21.1553° L (simulim)";
      out.textContent = coords;
    };
    if (!navigator.geolocation) { fallback(); return; }
    out.textContent = "Duke kërkuar…";
    navigator.geolocation.getCurrentPosition(
      (pos) => { coords = `${pos.coords.latitude.toFixed(4)}° V, ${pos.coords.longitude.toFixed(4)}° L`; out.textContent = coords; },
      fallback,
      { timeout: 4000 },
    );
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const checks = readChecks();
    const result = Object.values(checks).every(Boolean) ? "ne_rregull" : "verejtje";
    const notes = [document.getElementById("fc-notes").value.trim(), coords ? `Koordinatat: ${coords}` : ""].filter(Boolean).join(" · ");
    completeInspection(caseId, phaseId, { checks, notes, result, photos: photoUrls.length });
    toast("Inspektimi u regjistrua. Procesverbali është gati.");
    navigate(`print/procesverbal/${caseId}/${phaseId}`);
  });
}
