import { createSeed } from "../data/seed.js";
import { INSPECTION_PHASES, PEOPLE } from "../data/config.js";
import { allocate, buildSchedule, fee, requiredDocs, stageInfo } from "./rules.js";
import { addDays, addMonths, todayIso, uid } from "./utils.js";

const KEY = "lejet-ferizaj-v1";
const ROLE_KEY = "lejet-ferizaj-role";
const THEME_KEY = "lejet-ferizaj-theme";

let state = null;
const listeners = new Set();

export function loadState() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      state = JSON.parse(raw);
      return state;
    }
  } catch {
    // Të dhëna të dëmtuara: rifillo nga seed.
  }
  state = createSeed();
  persist(false);
  return state;
}

export function getState() {
  return state ?? loadState();
}

export function subscribe(fn) {
  listeners.add(fn);
}

function persist(notify = true) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Memoria e shfletuesit plot: vazhdo në memorie.
  }
  if (notify) listeners.forEach((fn) => fn());
}

export function resetDemo() {
  state = createSeed();
  persist();
}

export const ROLES = [
  { id: "officer", label: "Zyrtari i lejeve", person: PEOPLE.officers[0].name },
  { id: "director", label: "Drejtori i Urbanizmit", person: PEOPLE.director.name },
  { id: "finance", label: "Zyrtari i Financave", person: PEOPLE.finance.name },
  { id: "inspector", label: "Inspektori i ndërtimit", person: PEOPLE.inspectors[0].name },
  { id: "mayor", label: "Kryetari", person: PEOPLE.mayor.name },
];

export function getRole() {
  const role = localStorage.getItem(ROLE_KEY);
  return ROLES.some((r) => r.id === role) ? role : "officer";
}

export function setRole(role) {
  localStorage.setItem(ROLE_KEY, role);
}

export function currentUser() {
  const role = getRole();
  return ROLES.find((r) => r.id === role);
}

export function getTheme() {
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
  listeners.forEach((fn) => fn());
}

export function today() {
  return todayIso();
}

export function getCase(id) {
  return getState().cases.find((c) => c.id === id);
}

export function officerName(id) {
  return PEOPLE.officers.find((o) => o.id === id)?.name ?? "—";
}

export function inspectorName(id) {
  return PEOPLE.inspectors.find((o) => o.id === id)?.name ?? "—";
}

function mutate(id, fn) {
  const c = getCase(id);
  if (!c) return null;
  const result = fn(c);
  persist();
  return result;
}

function log(c, kind, title, text) {
  c.timeline.push({ date: today(), kind, title, text, by: currentUser().person });
}

export function toggleDoc(id, docId) {
  mutate(id, (c) => {
    const present = !c.docs[docId]?.present;
    c.docs[docId] = present ? { present: true, date: today() } : { present: false };
  });
}

export function sendCompletionRequest(id, items, days) {
  return mutate(id, (c) => {
    const request = { id: uid("rq"), date: today(), stage: c.stage, items, deadline: addDays(today(), days) };
    c.requests.push(request);
    c.status = "kerkon_plotesim";
    log(c, "kerkese", "Kërkesë për plotësim", `U kërkuan ${items.length} dokumente me afat ${days} ditë.`);
    return request;
  });
}

export function markReady(id) {
  mutate(id, (c) => {
    c.status = "gati_per_vendim";
    log(c, "dokument", "Gati për vendim", "Dosja është e plotë dhe parametrat u verifikuan. Lënda iu dërgua Drejtorit.");
  });
}

export function backToReview(id) {
  mutate(id, (c) => {
    c.status = "ne_shqyrtim";
    log(c, "dokument", "Kthyer në shqyrtim", "Lënda u kthye për shqyrtim të mëtejshëm.");
  });
}

export function setNationalNr(id, value) {
  mutate(id, (c) => {
    c.nationalNr = value.trim() || null;
  });
}

export function savePlanDraft(id, draft) {
  mutate(id, (c) => {
    c.planDraft = draft;
  });
}

function createInspectionPlan(c) {
  c.inspections = INSPECTION_PHASES.map((phase, i) => ({
    phase: phase.id,
    planned: addDays(today(), phase.offset),
    status: "ne_pritje",
    inspectorId: i % 2 ? "i2" : "i1",
    result: null,
    checks: {},
    notes: "",
  }));
}

export function approveDecision(id) {
  return mutate(id, (c) => {
    const db = getState();
    const stage = c.stage;
    const started = c.stageStart;
    const days = Math.max(1, Math.round((new Date(`${today()}T12:00:00`) - new Date(`${started}T12:00:00`)) / 86400000));
    const prefix = { kushte: "KN", leje: "LN", pranim: "PT", certifikate: "CP" }[stage];
    const nr = `${prefix}-${today().slice(0, 4)}-${String(500 + db.cases.reduce((n, x) => n + x.decisions.length, 0)).slice(-3)}`;
    c.decisions.push({ stage, date: today(), days, nr });
    log(c, "vendim", `Vendimi: ${stageInfo(stage).decision}`, `Vendimi nr. ${nr} · ${days} ditë trajtim`);

    if (stage === "kushte") {
      c.stage = "leje";
      c.status = "ne_shqyrtim";
      c.stageStart = today();
      requiredDocs(c, "leje").forEach((d) => { if (!c.docs[d.id]) c.docs[d.id] = { present: false }; });
    } else if (stage === "leje") {
      c.fee = { ...fee(c, db.rules), date: today() };
      const draft = c.planDraft ?? { count: 1, downPct: 100, stepMonths: 1 };
      c.plan = {
        agreedDate: today(),
        count: draft.count,
        stepMonths: draft.stepMonths,
        downPct: draft.downPct,
        instalments: buildSchedule(c.fee.total, { ...draft, firstDue: today() }, addMonths),
      };
      c.payments = [{ id: uid("p"), date: today(), amount: c.plan.instalments[0].amount, source: "manual", note: "Pagesa para lëshimit të lejes" }];
      c.timeline.push({ date: today(), kind: "pagese", title: draft.count > 1 ? `Plan pagese me ${draft.count} këste` : "Taksa u pagua në tërësi", text: "Pagesa e parë u evidentua para lëshimit të lejes.", by: PEOPLE.finance.name });
      createInspectionPlan(c);
      c.timeline.push({ date: today(), kind: "inspektim", title: "Leja u nda me Inspektoratin", text: "U krijua plani i inspektimeve: themeli, konstruksioni, kati i fundit, instalimet, inspektimi final.", by: "Sistemi" });
      c.stage = "ndertim";
      c.status = "ne_zbatim";
      c.stageStart = today();
    } else if (stage === "pranim") {
      c.stage = "certifikate";
      c.status = "ne_shqyrtim";
      c.stageStart = today();
      requiredDocs(c, "certifikate").forEach((d) => { c.docs[d.id] = { present: true, date: today() }; });
    } else if (stage === "certifikate") {
      c.status = "perfunduar";
    }
    return nr;
  });
}

export function recordPayment(id, { date, amount, source = "manual", note = "" }) {
  mutate(id, (c) => {
    c.payments.push({ id: uid("p"), date, amount, source, note });
    log(c, "pagese", "Pagesë e regjistruar", `${amount.toFixed(2).replace(".", ",")} € · ${source === "csv" ? "nga importi bankar" : "regjistrim manual"}`);
  });
}

export function importPayments(rows) {
  const db = getState();
  let count = 0;
  let sum = 0;
  rows.forEach((row) => {
    const c = db.cases.find((x) => x.nr === row.ref);
    if (!c || !c.plan) return;
    c.payments.push({ id: uid("p"), date: row.date, amount: row.amount, source: "csv", note: `Ekstrakti bankar · ${row.payer || ""}`.trim() });
    c.timeline.push({ date: today(), kind: "pagese", title: "Pagesë nga importi bankar", text: `${row.amount.toFixed(2).replace(".", ",")} € me datë ${row.date.split("-").reverse().join(".")}`, by: currentUser().person });
    count += 1;
    sum += row.amount;
  });
  db.importLog.unshift({ date: today(), by: currentUser().person, count, sum });
  persist();
  return { count, sum };
}

export function requestInspection(id, phaseId) {
  mutate(id, (c) => {
    const ins = c.inspections.find((i) => i.phase === phaseId);
    ins.status = "kerkuar";
    ins.requestedDate = today();
    ins.planned = addDays(today(), 2);
    c.timeline.push({ date: today(), kind: "inspektim", title: `Kërkesë për inspektim: ${INSPECTION_PHASES.find((p) => p.id === phaseId).label}`, text: "Investitori kërkoi inspektimin (simulim).", by: c.applicant.contact });
  });
}

export function scheduleInspection(id, phaseId, date) {
  mutate(id, (c) => {
    const ins = c.inspections.find((i) => i.phase === phaseId);
    ins.planned = date;
    if (ins.status === "ne_pritje") ins.status = "planifikuar";
  });
}

export function completeInspection(id, phaseId, { checks, notes, result, photos }) {
  mutate(id, (c) => {
    const ins = c.inspections.find((i) => i.phase === phaseId);
    Object.assign(ins, { status: "kryer", doneDate: today(), checks, notes, result, photos, inspectorId: ins.inspectorId || "i1" });
    const label = INSPECTION_PHASES.find((p) => p.id === phaseId).label;
    log(c, "inspektim", `Inspektimi: ${label}`, result === "ne_rregull" ? "Në përputhje me lejen." : "Me vërejtje; investitori u njoftua për rishikim.");
    if (c.inspections.every((i) => i.status === "kryer")) {
      c.stage = "pranim";
      c.status = "ne_shqyrtim";
      c.stageStart = today();
      requiredDocs(c, "pranim").forEach((d) => { c.docs[d.id] = { present: false }; });
      log(c, "pranim", "Gati për pranim teknik", "Të gjitha fazat u inspektuan; lënda kaloi te pranimi teknik.");
    }
  });
}

export function updateRules(patch, text) {
  const db = getState();
  Object.assign(db.rules, patch);
  db.rulesLog.unshift({ date: today(), by: currentUser().person, text });
  persist();
}

export function applyCentralImport(rows) {
  const db = getState();
  let count = 0;
  rows.forEach((row) => {
    const c = db.cases.find((x) => x.nr === row.nr);
    if (!c || !row.national || c.nationalNr === row.national) return;
    c.nationalNr = row.national;
    c.timeline.push({ date: today(), kind: "sync", title: "Sinkronizim me sistemin qendror", text: `Nr. në sistemin qendror: ${row.national}`, by: currentUser().person });
    count += 1;
  });
  db.syncLog.unshift({ date: today(), by: currentUser().person, kind: "import", count });
  persist();
  return count;
}

export function logExport(count) {
  const db = getState();
  db.syncLog.unshift({ date: today(), by: currentUser().person, kind: "export", count });
  persist();
}

export function paymentOverview(t = today()) {
  return getState().cases.filter((c) => c.plan).map((c) => ({ c, a: allocate(c, t) }));
}
