import { PEOPLE, STAGES, STATUSES, TYPES, ZONES } from "../../data/config.js";
import { deadline } from "../rules.js";
import { getRole, getState, officerName, today } from "../store.js";
import { downloadText, esc, formatArea, formatDate, toCsv } from "../utils.js";
import { deadlineBadge, pageHead, stageLabel, statusBadge } from "./components.js";

const DEADLINE_FILTERS = {
  ok: "Brenda 30 ditëve",
  soft: "Ditët 30–39",
  hard: "Ditët 40–45",
  over: "Mbi 45 ditë",
};

function filtered(params) {
  const db = getState();
  const t = today();
  const role = getRole();
  const q = (params.q || "").toLowerCase();
  return db.cases
    .filter((c) => (role === "inspector" ? ["ndertim", "pranim"].includes(c.stage) : true))
    .filter((c) => (params.status ? c.status === params.status : params.all ? true : c.status !== "perfunduar"))
    .filter((c) => (params.zona ? c.zone === Number(params.zona) : true))
    .filter((c) => (params.zyrtari ? c.officerId === params.zyrtari : true))
    .filter((c) => (params.faza ? c.stage === params.faza : true))
    .filter((c) => (params.afati ? deadline(c, t)?.level === params.afati : true))
    .filter((c) => !q || [c.nr, c.nationalNr, c.applicant.name, c.parcel, c.address].some((v) => String(v ?? "").toLowerCase().includes(q)))
    .sort((a, b) => {
      const da = deadline(a, t)?.elapsed ?? -1;
      const dbb = deadline(b, t)?.elapsed ?? -1;
      return dbb - da || b.receivedDate.localeCompare(a.receivedDate);
    });
}

function select(id, label, value, options) {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <select class="control" id="${id}" data-param="${id.replace("f-", "")}">
        <option value="">Të gjitha</option>
        ${options.map(([v, l]) => `<option value="${v}" ${String(value) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}
      </select>
    </div>`;
}

export function render(parts, params) {
  const t = today();
  const list = filtered(params);
  const role = getRole();
  const statusOptions = Object.entries(STATUSES).map(([k, v]) => [k, v.label]);
  return `
    ${pageHead("Lëndët", `${list.length} lëndë ${params.all || params.status === "perfunduar" ? "" : "aktive"} · një regjistër për gjithë ciklin: kushte → leje → inspektime → pranim → certifikatë`, `<button class="btn secondary sm" id="btn-export">Eksporto CSV</button>`)}
    <section class="card">
      <form class="filters" id="filters" role="search" onsubmit="return false">
        <div class="field grow">
          <label for="f-q">Kërko</label>
          <input class="control" id="f-q" data-param="q" type="search" placeholder="Nr. i lëndës, aplikuesi, parcela…" value="${esc(params.q || "")}" />
        </div>
        ${select("f-status", "Statusi", params.status, statusOptions)}
        ${select("f-faza", "Faza", params.faza, STAGES.map((s) => [s.id, s.short]))}
        ${select("f-zona", "Zona", params.zona, ZONES.map((z) => [z.id, `Zona ${z.id}`]))}
        ${role !== "inspector" ? select("f-zyrtari", "Zyrtari", params.zyrtari, PEOPLE.officers.map((o) => [o.id, o.name])) : ""}
        ${select("f-afati", "Afati", params.afati, Object.entries(DEADLINE_FILTERS))}
        <label class="check-inline"><input type="checkbox" id="f-all" ${params.all ? "checked" : ""}/> Përfshi të përfunduarat</label>
      </form>
      <div class="table-wrap">
        <table class="data cases-table">
          <thead><tr><th>Nr. i lëndës</th><th>Aplikuesi</th><th>Objekti</th><th>Zona</th><th>Faza</th><th>Statusi</th><th>Zyrtari</th><th>Afati</th><th>Pranuar</th></tr></thead>
          <tbody>
            ${list.map((c) => `
              <tr class="row-link" data-href="#/lendet/${c.id}">
                <td><a href="#/lendet/${c.id}"><strong>${c.nr}</strong></a><div class="muted small">${c.nationalNr ?? '<span class="badge warn sm">pa nr. qendror</span>'}</div></td>
                <td>${esc(c.applicant.name)}<div class="muted small">${esc(c.address)}</div></td>
                <td>${TYPES[c.type]}<div class="muted small">${formatArea(c.grossAbove + c.grossBelow)} · Kat. ${c.category}</div></td>
                <td>${c.zone}</td>
                <td>${stageLabel(c)}</td>
                <td>${statusBadge(c)}</td>
                <td>${officerName(c.officerId)}</td>
                <td>${deadlineBadge(c, t)}</td>
                <td>${formatDate(c.receivedDate)}</td>
              </tr>`).join("") || '<tr><td colspan="9" class="empty">Asnjë lëndë nuk përputhet me filtrat.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`;
}

export function bind(parts, params) {
  const update = (key, value) => {
    const next = { ...params, [key]: value };
    Object.keys(next).forEach((k) => { if (!next[k]) delete next[k]; });
    const qs = new URLSearchParams(next).toString();
    location.hash = `#/lendet${qs ? `?${qs}` : ""}`;
  };
  document.querySelectorAll("#filters select").forEach((el) => el.addEventListener("change", () => update(el.dataset.param, el.value)));
  let timer;
  document.getElementById("f-q").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => update("q", e.target.value), 350);
  });
  document.getElementById("f-all").addEventListener("change", (e) => update("all", e.target.checked ? "1" : ""));
  document.querySelectorAll(".row-link").forEach((row) => row.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    location.hash = row.dataset.href;
  }));
  document.getElementById("btn-export").addEventListener("click", () => {
    const t = today();
    const rows = [["nr_brendshem", "nr_sistemi_qendror", "aplikuesi", "zona", "parcela", "faza", "statusi", "zyrtari", "data_pranimit", "dite_ne_faze"]];
    filtered(params).forEach((c) => rows.push([c.nr, c.nationalNr ?? "", c.applicant.name, c.zone, c.parcel, stageLabel(c), STATUSES[c.status].label, officerName(c.officerId), formatDate(c.receivedDate), deadline(c, t)?.elapsed ?? ""]));
    downloadText(`lendet-ferizaj-${t}.csv`, toCsv(rows));
  });
}
