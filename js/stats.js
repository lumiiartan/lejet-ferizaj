import { LEGAL_DEADLINE, PEOPLE } from "../data/config.js";
import { allocate, isOpenDecision } from "./rules.js";
import { addDays, daysBetween, lastMonths, monthKey, nextMonths, startOfWeek } from "./utils.js";

export function overview(db, today) {
  const cases = db.cases;
  const active = cases.filter((c) => c.status !== "perfunduar");
  const openDecisions = cases.filter(isOpenDecision);
  const month = monthKey(today);
  const decisions = cases.flatMap((c) => c.decisions.map((d) => ({ ...d, caseId: c.id })));
  const decisionsThisMonth = decisions.filter((d) => monthKey(d.date) === month);
  const recent = decisions.filter((d) => daysBetween(d.date, today) <= 90);
  const avgDays = recent.length ? recent.reduce((s, d) => s + d.days, 0) / recent.length : 0;
  const withinPct = recent.length ? (recent.filter((d) => d.days <= LEGAL_DEADLINE).length / recent.length) * 100 : 100;

  const year = today.slice(0, 4);
  let planned = 0;
  let collected = 0;
  let due30Count = 0;
  let due30Sum = 0;
  cases.filter((c) => c.plan).forEach((c) => {
    const a = allocate(c, today);
    a.instalments.forEach((i) => {
      if (i.due.startsWith(year)) planned += i.amount;
      const until = daysBetween(today, i.due);
      if (!i.paid && until >= 0 && until <= 30) {
        due30Count += 1;
        due30Sum += i.amount - i.paidAmount;
      }
    });
    c.payments.forEach((p) => { if (p.date.startsWith(year)) collected += p.amount; });
  });

  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const inspectionsWeek = cases.flatMap((c) => c.inspections.map((i) => ({ ...i, caseId: c.id })))
    .filter((i) => i.status !== "ne_pritje" && i.planned >= weekStart && i.planned <= weekEnd);

  return {
    active: active.length,
    openDecisions: openDecisions.length,
    inConstruction: cases.filter((c) => c.stage === "ndertim").length,
    decisionsThisMonth: decisionsThisMonth.length,
    avgDays,
    withinPct,
    planned,
    collected,
    pending: Math.max(0, planned - collected),
    due30Count,
    due30Sum,
    inspectionsWeek: inspectionsWeek.length,
    inspectionsWeekDone: inspectionsWeek.filter((i) => i.status === "kryer").length,
    readyForDecision: cases.filter((c) => c.status === "gati_per_vendim").length,
  };
}

export function monthlySeries(db, today, months = 12) {
  const keys = lastMonths(today, months);
  const empty = () => Object.fromEntries(keys.map((k) => [k, 0]));
  const received = empty();
  const decided = empty();
  const daysSum = empty();
  const planned = empty();
  const collected = empty();
  db.cases.forEach((c) => {
    const rk = monthKey(c.receivedDate);
    if (rk in received) received[rk] += 1;
    c.decisions.forEach((d) => {
      const k = monthKey(d.date);
      if (k in decided) { decided[k] += 1; daysSum[k] += d.days; }
    });
    if (c.plan) {
      c.plan.instalments.forEach((i) => { const k = monthKey(i.due); if (k in planned) planned[k] += i.amount; });
      c.payments.forEach((p) => { const k = monthKey(p.date); if (k in collected) collected[k] += p.amount; });
    }
  });
  return {
    keys,
    received: keys.map((k) => received[k]),
    decided: keys.map((k) => decided[k]),
    avgDays: keys.map((k) => (decided[k] ? Math.round((daysSum[k] / decided[k]) * 10) / 10 : null)),
    planned: keys.map((k) => Math.round(planned[k])),
    collected: keys.map((k) => Math.round(collected[k])),
  };
}

export function forecast(db, today, months = 12) {
  const keys = nextMonths(today, months);
  const expected = Object.fromEntries(keys.map((k) => [k, 0]));
  const pastDue = { sum: 0, count: 0 };
  db.cases.filter((c) => c.plan).forEach((c) => {
    allocate(c, today).instalments.forEach((i) => {
      if (i.paid) return;
      const open = i.amount - i.paidAmount;
      if (i.due < today) { pastDue.sum += open; pastDue.count += 1; return; }
      const k = monthKey(i.due);
      if (k in expected) expected[k] += open;
    });
  });
  return { keys, expected: keys.map((k) => Math.round(expected[k])), pastDue };
}

export function workload(db) {
  return PEOPLE.officers.map((o) => {
    const mine = db.cases.filter((c) => c.officerId === o.id && isOpenDecision(c));
    return {
      officer: o,
      kushte: mine.filter((c) => c.stage === "kushte").length,
      leje: mine.filter((c) => c.stage === "leje").length,
      tjera: mine.filter((c) => c.stage === "pranim" || c.stage === "certifikate").length,
      total: mine.length,
    };
  });
}

export function quarterRange(today, offset = 0) {
  const d = new Date(`${today}T12:00:00`);
  const q = Math.floor(d.getMonth() / 3) + offset;
  const year = d.getFullYear() + Math.floor(q / 4);
  const qi = ((q % 4) + 4) % 4;
  const start = `${year}-${String(qi * 3 + 1).padStart(2, "0")}-01`;
  const endMonth = new Date(year, qi * 3 + 3, 0);
  const end = `${year}-${String(qi * 3 + 3).padStart(2, "0")}-${String(endMonth.getDate()).padStart(2, "0")}`;
  return { start, end: end > today ? today : end, label: `TM${qi + 1} ${year}`, fullEnd: end };
}

export function periodReport(db, start, end) {
  const inRange = (iso) => iso >= start && iso <= end;
  const received = db.cases.filter((c) => inRange(c.receivedDate)).length;
  const decisions = db.cases.flatMap((c) => c.decisions).filter((d) => inRange(d.date));
  const byStage = (s) => decisions.filter((d) => d.stage === s).length;
  const avg = decisions.length ? decisions.reduce((s, d) => s + d.days, 0) / decisions.length : 0;
  const within = decisions.length ? (decisions.filter((d) => d.days <= LEGAL_DEADLINE).length / decisions.length) * 100 : 100;
  let planned = 0;
  let collected = 0;
  db.cases.filter((c) => c.plan).forEach((c) => {
    c.plan.instalments.forEach((i) => { if (inRange(i.due)) planned += i.amount; });
    c.payments.forEach((p) => { if (inRange(p.date)) collected += p.amount; });
  });
  const inspections = db.cases.flatMap((c) => c.inspections).filter((i) => i.status === "kryer" && i.doneDate && inRange(i.doneDate));
  const grossApproved = db.cases.filter((c) => c.decisions.some((d) => d.stage === "leje" && inRange(d.date))).reduce((s, c) => s + c.grossAbove + c.grossBelow, 0);
  const units = db.cases.filter((c) => c.decisions.some((d) => d.stage === "leje" && inRange(d.date))).reduce((s, c) => s + c.housingUnits, 0);
  return {
    received,
    decisions: decisions.length,
    kushte: byStage("kushte"),
    leje: byStage("leje"),
    pranim: byStage("pranim"),
    certifikate: byStage("certifikate"),
    avg,
    within,
    planned,
    collected,
    collectionPct: planned ? (collected / planned) * 100 : 100,
    inspections: inspections.length,
    inspectionsOk: inspections.filter((i) => i.result === "ne_rregull").length,
    grossApproved,
    units,
  };
}
