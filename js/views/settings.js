import { ZONES } from "../../data/config.js";
import { isOpenDecision, params } from "../rules.js";
import { getRole, getState, updateRules } from "../store.js";
import { esc, formatDate, formatDecimal, formatMoney, toast } from "../utils.js";
import { badge, notice, pageHead } from "./components.js";

let draft = null;
let draftBase = "";

function impact(rules) {
  const open = getState().cases.filter((c) => isOpenDecision(c) && ["kushte", "leje"].includes(c.stage));
  const ok = open.filter((c) => params(c, rules).ok).length;
  return { total: open.length, ok, review: open.length - ok };
}

function radio(name, value, current, label, hint, disabled) {
  return `<label class="radio-card ${value === current ? "on" : ""}"><input type="radio" name="${name}" value="${value}" ${value === current ? "checked" : ""} ${disabled ? "disabled" : ""}/> <span><strong>${label}</strong><span class="muted small">${hint}</span></span></label>`;
}

function num(id, value, { step = 1, min = 0, disabled, suffix = "" } = {}) {
  return `<span class="num-input"><input class="control sm" type="number" id="${id}" value="${value}" step="${step}" min="${min}" ${disabled ? "disabled" : ""}/>${suffix ? `<span class="muted">${suffix}</span>` : ""}</span>`;
}

const ACCESS = [
  ["Lëndët dhe dosja", "✓", "✓", "✓", "✓ (në ndërtim)", "lexim"],
  ["Parametrat dhe fleta e llogaritjes", "✓", "✓", "lexim", "lexim", "lexim"],
  ["Gjendja e pagesave për lëndë", "lexim", "✓", "✓", "—", "lexim"],
  ["Regjistrim/import i pagesave", "—", "✓", "✓", "—", "—"],
  ["Inspektimet dhe procesverbalet", "lexim", "✓", "—", "✓", "lexim"],
  ["Lëshimi i vendimit", "—", "✓", "—", "—", "—"],
  ["Rregullat e komunës", "lexim", "✓ ndryshim", "lexim", "—", "—"],
  ["Raportet agregate", "—", "✓", "✓", "—", "✓"],
];

export function render() {
  const db = getState();
  const canEdit = getRole() === "director";
  if (draft && draftBase !== JSON.stringify(db.rules)) draft = null;
  if (!draft) {
    draftBase = JSON.stringify(db.rules);
    draft = JSON.parse(draftBase);
  }
  const r = draft;
  const dis = !canEdit;
  const im = impact(r);
  const cur = impact(db.rules);
  const changed = JSON.stringify(r) !== JSON.stringify(db.rules);
  return `
    ${pageHead("Rregullat e komunës", "Komuna vendos politikën një herë – mjeti e zbaton njësoj për të gjithë", canEdit ? `<button class="btn" id="btn-save" ${changed ? "" : "disabled"}>Ruaj ndryshimet</button>${changed ? '<button class="btn ghost" id="btn-discard">Anulo</button>' : ""}` : badge("Vetëm Drejtori mund t'i ndryshojë", ""))}
    ${changed ? notice(`Me këto rregulla: <strong>${im.ok}</strong> nga ${im.total} lëndë në shqyrtim janë brenda normës (tani ${cur.ok}), <strong>${im.review}</strong> kërkojnë shqyrtim (tani ${cur.review}).`, "info", "Ndikimi i ndryshimit") : ""}
    <div class="grid-2 settings">
      <section class="card">
        <div class="card-head"><h2>Koeficienti maksimal i ndërtimit sipas zonës</h2>${r.zoneCoefConfirmed ? badge("Konfirmuar", "ok") : '<span class="badge tc">TO CONFIRM</span>'}</div>
        <p class="muted small">Vlerat fillestare janë shembuj. Duhet të konfirmohen me planin rregullues / hartën zonale të komunës.</p>
        <table class="data compact"><thead><tr><th>Zona</th><th class="num">ISPN max</th></tr></thead><tbody>
          ${ZONES.map((z) => `<tr><td><label for="zc-${z.id}">${z.name}</label></td><td class="num">${num(`zc-${z.id}`, r.zoneCoef[z.id], { step: 0.1, disabled: dis })}</td></tr>`).join("")}
        </tbody></table>
        <label class="check-inline"><input type="checkbox" id="zc-confirm" ${r.zoneCoefConfirmed ? "checked" : ""} ${dis ? "disabled" : ""}/> Vlerat janë konfirmuar nga Drejtoria</label>
      </section>
      <div class="stack">
        <section class="card">
          <h2>Terracat e penthouse-it</h2>
          <p class="muted small">Një rregull i vetëm global, që çdo lëndë të trajtohet njësoj.</p>
          <div class="radio-group">
            ${radio("pent", "bruto", r.penthouseTerraces, "Llogariten si sipërfaqe bruto", "Hyjnë në koeficientin e ndërtimit dhe në taksë", dis)}
            ${radio("pent", "neto", r.penthouseTerraces, "Llogariten si neto", "Nuk hyjnë në koeficient", dis)}
          </div>
        </section>
        <section class="card">
          <h2>Toka e dhuruar për rrugë publike</h2>
          <div class="radio-group">
            ${radio("don", "perfshihet", r.donatedLand, "Përfshihet në sipërfaqen e parcelës", "Nxit dhurimin e tokës për rrugë", dis)}
            ${radio("don", "zbritet", r.donatedLand, "Zbritet nga sipërfaqja e parcelës", "Koeficienti llogaritet mbi parcelën e mbetur", dis)}
          </div>
        </section>
        <section class="card">
          <h2>Parkimi dhe gjelbërimi</h2>
          <dl class="kv-list">
            <div class="kv"><dt><label for="pk-unit">Vende parkimi për njësi banimi</label></dt><dd>${num("pk-unit", r.parkingPerUnit, { step: 0.1, disabled: dis })}</dd></div>
            <div class="kv"><dt><label for="pk-biz">Vende parkimi për njësi afariste</label></dt><dd>${num("pk-biz", r.parkingPerBusiness, { step: 0.1, disabled: dis })}</dd></div>
            <div class="kv"><dt><label for="green">Sipërfaqe e gjelbër minimale</label></dt><dd>${num("green", r.greenMinPct, { step: 1, disabled: dis, suffix: "%" })}</dd></div>
          </dl>
        </section>
      </div>
      <section class="card">
        <div class="card-head"><h2>Tarifat e taksës së lejes</h2>${r.feesConfirmed ? badge("Konfirmuar", "ok") : '<span class="badge tc">TO CONFIRM</span>'}</div>
        <p class="muted small">Sipas vendimit të Kuvendit për taksat komunale.</p>
        <table class="data compact"><thead><tr><th>Përbërësi</th><th class="num">Vlera</th></tr></thead><tbody>
          ${r.fees.map((f, i) => `<tr><td><label for="fee-${i}">${esc(f.label)}</label></td><td class="num">${num(`fee-${i}`, f.value, { step: 0.5, disabled: dis, suffix: f.basis === "fikse" ? "€" : "€/m²" })}</td></tr>`).join("")}
        </tbody></table>
        <label class="check-inline"><input type="checkbox" id="fee-confirm" ${r.feesConfirmed ? "checked" : ""} ${dis ? "disabled" : ""}/> Tarifat janë konfirmuar</label>
      </section>
      <section class="card">
        <h2>Planet e pagesës dhe kujtesat</h2>
        <dl class="kv-list">
          <div class="kv"><dt><label for="max-inst">Numri maksimal i kësteve</label></dt><dd>${num("max-inst", r.maxInstalments, { min: 1, disabled: dis })}</dd></div>
          <div class="kv"><dt><label for="min-down">Kësti i parë minimal</label></dt><dd>${num("min-down", r.minDownPct, { step: 5, disabled: dis, suffix: "%" })}</dd></div>
          <div class="kv"><dt><label for="rem-1">Kujtesa e parë</label></dt><dd>${num("rem-1", r.remindBefore[0], { disabled: dis, suffix: "ditë para" })}</dd></div>
          <div class="kv"><dt><label for="rem-2">Kujtesa e dytë</label></dt><dd>${num("rem-2", r.remindBefore[1], { disabled: dis, suffix: "ditë para" })}</dd></div>
          <div class="kv"><dt><label for="rem-after">Kujtesa e sjellshme</label></dt><dd>${num("rem-after", r.remindAfter, { disabled: dis, suffix: "ditë pas" })}</dd></div>
        </dl>
      </section>
      <section class="card">
        <h2>Kush sheh çka</h2>
        <p class="muted small">Gjendja e pagesave nuk publikohet; shihet vetëm nga rolet e autorizuara.</p>
        <div class="table-wrap"><table class="data compact access"><thead><tr><th></th><th>Zyrtari</th><th>Drejtori</th><th>Financat</th><th>Inspektori</th><th>Kryetari</th></tr></thead><tbody>
          ${ACCESS.map((row) => `<tr>${row.map((cell, i) => (i ? `<td>${cell}</td>` : `<th scope="row">${cell}</th>`)).join("")}</tr>`).join("")}
        </tbody></table></div>
      </section>
      <section class="card">
        <h2>Historiku i ndryshimeve</h2>
        <ul class="plain-list">${db.rulesLog.map((l) => `<li><strong>${formatDate(l.date)} · ${esc(l.by)}</strong><span class="muted">${esc(l.text)}</span></li>`).join("")}</ul>
      </section>
    </div>`;
}

function describe(before, after) {
  const out = [];
  ZONES.forEach((z) => {
    if (Number(before.zoneCoef[z.id]) !== Number(after.zoneCoef[z.id])) out.push(`Zona ${z.id}: ${formatDecimal(before.zoneCoef[z.id], 1)} → ${formatDecimal(after.zoneCoef[z.id], 1)}`);
  });
  if (before.penthouseTerraces !== after.penthouseTerraces) out.push(`Terracat: ${after.penthouseTerraces}`);
  if (before.donatedLand !== after.donatedLand) out.push(`Toka e dhuruar: ${after.donatedLand}`);
  if (before.parkingPerUnit !== after.parkingPerUnit || before.parkingPerBusiness !== after.parkingPerBusiness) out.push(`Parkimi: ${after.parkingPerUnit} / ${after.parkingPerBusiness}`);
  if (before.greenMinPct !== after.greenMinPct) out.push(`Gjelbërimi: ${after.greenMinPct}%`);
  after.fees.forEach((f, i) => { if (f.value !== before.fees[i].value) out.push(`${f.label}: ${formatMoney(f.value)}`); });
  if (!before.zoneCoefConfirmed && after.zoneCoefConfirmed) out.push("Koeficientët u konfirmuan");
  if (!before.feesConfirmed && after.feesConfirmed) out.push("Tarifat u konfirmuan");
  if (before.maxInstalments !== after.maxInstalments || before.minDownPct !== after.minDownPct) out.push(`Këste: max ${after.maxInstalments}, min ${after.minDownPct}%`);
  if (JSON.stringify(before.remindBefore) !== JSON.stringify(after.remindBefore) || before.remindAfter !== after.remindAfter) out.push(`Kujtesat: ${after.remindBefore.join("/")} para, ${after.remindAfter} pas`);
  return out.join(" · ") || "Pa ndryshime";
}

export function bind() {
  if (getRole() !== "director") { draft = null; return; }
  const read = () => {
    const v = (id) => Number(document.getElementById(id).value);
    ZONES.forEach((z) => { draft.zoneCoef[z.id] = v(`zc-${z.id}`); });
    draft.zoneCoefConfirmed = document.getElementById("zc-confirm").checked;
    draft.penthouseTerraces = document.querySelector('input[name="pent"]:checked').value;
    draft.donatedLand = document.querySelector('input[name="don"]:checked').value;
    draft.parkingPerUnit = v("pk-unit");
    draft.parkingPerBusiness = v("pk-biz");
    draft.greenMinPct = v("green");
    draft.fees.forEach((f, i) => { f.value = v(`fee-${i}`); });
    draft.feesConfirmed = document.getElementById("fee-confirm").checked;
    draft.maxInstalments = Math.max(1, v("max-inst"));
    draft.minDownPct = v("min-down");
    draft.remindBefore = [v("rem-1"), v("rem-2")];
    draft.remindAfter = v("rem-after");
  };
  document.querySelector(".settings").addEventListener("change", () => {
    read();
    window.dispatchEvent(new Event("hashchange"));
  });
  document.getElementById("btn-save")?.addEventListener("click", () => {
    const text = describe(getState().rules, draft);
    const next = draft;
    draft = null;
    updateRules(JSON.parse(JSON.stringify(next)), text);
    toast("Rregullat u ruajtën dhe zbatohen menjëherë në të gjitha lëndët.");
  });
  document.getElementById("btn-discard")?.addEventListener("click", () => {
    draft = null;
    window.dispatchEvent(new Event("hashchange"));
  });
}
