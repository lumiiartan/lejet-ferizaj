import { STATUSES } from "../../data/config.js";
import { applyCentralImport, getRole, getState, logExport, today } from "../store.js";
import { downloadText, esc, formatDate, parseCsv, toCsv, toast } from "../utils.js";
import { badge, notice, pageHead, stageLabel } from "./components.js";

let pending = null;

function exportRows(db) {
  return [
    ["nr_brendshem", "nr_sistemi_qendror", "aplikuesi", "nui", "parcela", "faza", "statusi", "data_pranimit", "data_vendimit_te_fundit"],
    ...db.cases.map((c) => [c.nr, c.nationalNr ?? "", c.applicant.name, c.applicant.nui, c.parcel, stageLabel(c), STATUSES[c.status].label, formatDate(c.receivedDate), formatDate(c.decisions.at(-1)?.date)]),
  ];
}

function sample(db) {
  const rows = [["nr_brendshem", "nr_sistemi_qendror", "statusi_qendror"]];
  db.cases.filter((c) => !c.nationalNr).forEach((c, i) => rows.push([c.nr, `eP-${c.receivedDate.slice(0, 4)}-${String(7100 + i * 13).padStart(5, "0")}`, "Regjistruar"]));
  db.cases.filter((c) => c.nationalNr).slice(-2).forEach((c) => rows.push([c.nr, c.nationalNr, "Regjistruar"]));
  return toCsv(rows);
}

function preview(db, rows) {
  return rows.map((r) => {
    const nr = (r.nr_brendshem || r.nr || "").trim();
    const national = (r.nr_sistemi_qendror || r.national || "").trim();
    const c = db.cases.find((x) => x.nr === nr);
    let status = "update";
    if (!c) status = "nomatch";
    else if (c.nationalNr === national) status = "same";
    else if (c.nationalNr && c.nationalNr !== national) status = "conflict";
    return { nr, national, c, status };
  });
}

export function render() {
  const db = getState();
  const missing = db.cases.filter((c) => !c.nationalNr);
  const canEdit = getRole() === "officer" || getRole() === "director";
  const labels = { update: ["Do të përditësohet", "ok"], same: ["Njësoj – pa ndryshim", ""], conflict: ["Numër i ndryshëm – kontrollo", "warn"], nomatch: ["Lënda nuk u gjet", "warn"] };
  const updates = pending?.filter((r) => r.status === "update") ?? [];
  return `
    ${pageHead("Sinkronizimi me sistemin qendror", "Mjeti plotëson sistemin qendror të lejeve elektronike – nuk e zëvendëson")}
    ${notice("Çdo lëndë ka fushën «Nr. i lëndës në sistemin qendror». Me eksport/import CSV të dhënat mbahen të njëjta në të dy anët, pa dyfishim pune. Lidhja automatike (API) mund të shtohet kur të ketë marrëveshje me ministrinë.", "info")}
    <div class="grid-2">
      <section class="card">
        <h2>Eksport drejt sistemit qendror</h2>
        <p class="muted">Lista e lëndëve me numrin e brendshëm, numrin qendror, fazën dhe statusin.</p>
        <div class="action-bar"><button class="btn" id="btn-exp">Shkarko CSV (${db.cases.length} lëndë)</button></div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Lëndë pa nr. në sistemin qendror</h2>${badge(String(missing.length), missing.length ? "warn" : "ok")}</div>
        <ul class="plain-list">${missing.map((c) => `<li><a href="#/lendet/${c.id}"><strong>${c.nr}</strong></a><span class="muted">${esc(c.applicant.name)} · pranuar ${formatDate(c.receivedDate)}</span></li>`).join("") || '<li class="muted">Të gjitha lëndët janë të përputhura.</li>'}</ul>
      </section>
    </div>
    <section class="card">
      <h2>Import nga sistemi qendror</h2>
      <p class="muted">Kolonat: <code>nr_brendshem;nr_sistemi_qendror;statusi_qendror</code>. Përputhja bëhet sipas numrit të brendshëm.</p>
      ${canEdit ? `
      <div class="import-box">
        <div class="field"><label for="sy-file">Skedari CSV</label><input class="control" type="file" id="sy-file" accept=".csv,text/csv" /></div>
        <div class="field grow"><label for="sy-text">Ose ngjitni përmbajtjen</label><textarea class="control mono" id="sy-text" rows="5"></textarea></div>
        <div class="action-bar"><button class="btn secondary" id="sy-sample">Gjenero shembull</button><button class="btn" id="sy-parse">Kontrollo</button></div>
      </div>` : ""}
      ${pending ? `
        <div class="table-wrap" style="margin-top:1rem"><table class="data"><thead><tr><th>Nr. i brendshëm</th><th>Nr. qendror (i ri)</th><th>Aktualisht</th><th>Rezultati</th></tr></thead><tbody>
          ${pending.map((r) => `<tr><td>${esc(r.nr)}</td><td>${esc(r.national)}</td><td>${r.c?.nationalNr ?? "—"}</td><td>${badge(...labels[r.status])}</td></tr>`).join("")}
        </tbody></table></div>
        <div class="action-bar"><button class="btn" id="sy-apply" ${updates.length ? "" : "disabled"}>Përditëso ${updates.length} lëndë</button><button class="btn ghost" id="sy-cancel">Anulo</button></div>` : ""}
    </section>
    <section class="card">
      <h2>Historiku i sinkronizimit</h2>
      ${db.syncLog.length ? `<ul class="plain-list">${db.syncLog.map((l) => `<li><strong>${formatDate(l.date)} · ${l.kind === "import" ? "Import" : "Eksport"}</strong><span class="muted">${l.count} lëndë · ${esc(l.by)}</span></li>`).join("")}</ul>` : '<p class="muted">Ende pa sinkronizim në këtë demo.</p>'}
    </section>`;
}

export function bind() {
  const db = getState();
  document.getElementById("btn-exp").addEventListener("click", () => {
    downloadText(`lendet-per-sistemin-qendror-${today()}.csv`, toCsv(exportRows(db)));
    logExport(db.cases.length);
  });
  const text = document.getElementById("sy-text");
  document.getElementById("sy-sample")?.addEventListener("click", () => { text.value = sample(db); });
  document.getElementById("sy-file")?.addEventListener("change", async (e) => { if (e.target.files[0]) text.value = await e.target.files[0].text(); });
  document.getElementById("sy-parse")?.addEventListener("click", () => {
    const rows = parseCsv(text.value);
    if (!rows.length) { toast("Nuk u gjet asnjë rresht."); return; }
    pending = preview(db, rows);
    location.hash = "#/sinkronizimi?p=1";
  });
  document.getElementById("sy-cancel")?.addEventListener("click", () => { pending = null; location.hash = "#/sinkronizimi"; });
  document.getElementById("sy-apply")?.addEventListener("click", () => {
    const rows = pending.filter((r) => r.status === "update").map((r) => ({ nr: r.nr, national: r.national }));
    pending = null;
    const n = applyCentralImport(rows);
    toast(`${n} lëndë u përputhën me sistemin qendror.`);
    location.hash = "#/sinkronizimi";
  });
}
