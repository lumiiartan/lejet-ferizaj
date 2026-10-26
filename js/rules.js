import { CHECKLIST, DEADLINE_HARD, DEADLINE_SOFT, INSPECTION_PHASES, LEGAL_DEADLINE, STAGES, ZONES } from "../data/config.js";
import { addDays, daysBetween } from "./utils.js";

export const DECISION_STAGES = ["kushte", "leje", "pranim", "certifikate"];

export function stageInfo(id) {
  return STAGES.find((s) => s.id === id);
}

export function stageIndex(id) {
  return STAGES.findIndex((s) => s.id === id);
}

export function zoneInfo(id) {
  return ZONES.find((z) => z.id === Number(id));
}

export function requiredDocs(c, stage = c.stage) {
  return CHECKLIST.filter((item) => item.stages.includes(stage) && (!item.when || item.when(c)));
}

export function missingDocs(c, stage = c.stage) {
  return requiredDocs(c, stage).filter((item) => !c.docs[item.id]?.present);
}

export function isOpenDecision(c) {
  return DECISION_STAGES.includes(c.stage) && c.status !== "perfunduar";
}

export function deadline(c, today) {
  if (!isOpenDecision(c)) return null;
  const elapsed = daysBetween(c.stageStart, today);
  const remaining = LEGAL_DEADLINE - elapsed;
  let level = "ok";
  if (elapsed > LEGAL_DEADLINE) level = "over";
  else if (elapsed >= DEADLINE_HARD) level = "hard";
  else if (elapsed >= DEADLINE_SOFT) level = "soft";
  const text = {
    ok: `Dita ${elapsed} nga ${LEGAL_DEADLINE}`,
    soft: `Dita ${elapsed} nga ${LEGAL_DEADLINE} · ${remaining} ditë të mbetura`,
    hard: `Dita ${elapsed} nga ${LEGAL_DEADLINE} · afati afrohet`,
    over: `Dita ${elapsed} · afati ligjor ka kaluar`,
  }[level];
  return { elapsed, remaining, level, text, due: addDays(c.stageStart, LEGAL_DEADLINE) };
}

export function deadlineTone(level) {
  return { ok: "ok", soft: "warn", hard: "warn", over: "danger" }[level] ?? "info";
}

export function params(c, rules) {
  const donated = c.donatedArea || 0;
  const base = rules.donatedLand === "zbritet" ? c.parcelArea - donated : c.parcelArea;
  const terraces = c.penthouse ? c.terraceArea || 0 : 0;
  const gross = c.grossAbove + (rules.penthouseTerraces === "bruto" ? terraces : 0);
  const coef = base > 0 ? gross / base : 0;
  const maxCoef = Number(rules.zoneCoef[c.zone]);
  const parkingReq = Math.ceil(c.housingUnits * rules.parkingPerUnit + c.businessUnits * rules.parkingPerBusiness);
  const greenPct = base > 0 ? (c.greenArea / base) * 100 : 0;
  const checks = {
    coef: coef <= maxCoef + 1e-9,
    parking: c.parkingSpaces >= parkingReq,
    green: greenPct >= rules.greenMinPct - 1e-9,
  };
  return {
    base,
    donated,
    terraces,
    gross,
    coef,
    maxCoef,
    parkingReq,
    greenPct,
    checks,
    ok: checks.coef && checks.parking && checks.green,
    reviewCount: Object.values(checks).filter((v) => !v).length,
  };
}

export function fee(c, rules) {
  const p = params(c, rules);
  const lines = rules.fees.map((f) => {
    let qty = 1;
    if (f.basis === "m2_mbi") qty = p.gross;
    if (f.basis === "m2_nen") qty = c.grossBelow;
    return { id: f.id, label: f.label, basis: f.basis, qty, unit: Number(f.value), amount: Math.round(qty * Number(f.value) * 100) / 100 };
  });
  return { lines, total: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100 };
}

export function buildSchedule(total, { count, downPct, firstDue, stepMonths }, addMonthsFn) {
  const n = Math.max(1, Number(count) || 1);
  if (n === 1) return [{ n: 1, due: firstDue, amount: total }];
  const down = Math.round(total * (Number(downPct) / 100) * 100) / 100;
  const rest = total - down;
  const each = Math.floor((rest / (n - 1)) * 100) / 100;
  const out = [{ n: 1, due: firstDue, amount: down }];
  for (let i = 1; i < n; i += 1) {
    const amount = i === n - 1 ? Math.round((rest - each * (n - 2)) * 100) / 100 : each;
    out.push({ n: i + 1, due: addMonthsFn(firstDue, i * stepMonths), amount });
  }
  return out;
}

export function allocate(c, today) {
  if (!c.plan) return null;
  const payments = [...(c.payments || [])].sort((a, b) => a.date.localeCompare(b.date));
  let pool = 0;
  let pi = 0;
  const instalments = c.plan.instalments.map((inst) => {
    let paidDate = null;
    while (pool + 1e-6 < inst.amount && pi < payments.length) {
      pool += payments[pi].amount;
      paidDate = payments[pi].date;
      pi += 1;
    }
    const covered = Math.min(pool, inst.amount);
    pool = Math.max(0, pool - inst.amount);
    const paid = covered + 1e-6 >= inst.amount;
    let status = "ne_pritje";
    if (paid) status = "paguar";
    else if (inst.due < today) status = "pas_afatit";
    else if (daysBetween(today, inst.due) <= 15) status = "afrohet";
    return { ...inst, paidAmount: Math.round(covered * 100) / 100, paid, paidDate: paid ? paidDate : null, status };
  });
  const total = instalments.reduce((s, i) => s + i.amount, 0);
  const paid = (c.payments || []).reduce((s, p) => s + p.amount, 0);
  const next = instalments.find((i) => !i.paid) || null;
  return {
    instalments,
    total,
    paid: Math.min(paid, total),
    remaining: Math.max(0, total - paid),
    next,
    pastDue: instalments.filter((i) => i.status === "pas_afatit"),
    active: instalments.some((i) => !i.paid),
  };
}

export const INSTALMENT_STATUS = {
  paguar: { label: "Paguar", tone: "ok" },
  ne_pritje: { label: "Në pritje", tone: "info" },
  afrohet: { label: "Afati afrohet", tone: "warn" },
  pas_afatit: { label: "Pas afatit", tone: "warn" },
};

export function reminders(c, rules, today) {
  const a = allocate(c, today);
  if (!a) return [];
  const out = [];
  a.instalments.forEach((inst) => {
    const offsets = [
      ...rules.remindBefore.map((d) => ({ kind: `para${d}`, date: addDays(inst.due, -d), label: `${d} ditë para afatit` })),
      { kind: "pas", date: addDays(inst.due, rules.remindAfter), label: "Kujtesë e sjellshme pas afatit" },
    ];
    offsets.forEach((o) => {
      if (inst.paidDate && inst.paidDate <= o.date) return;
      if (c.plan.agreedDate && o.date < c.plan.agreedDate) return;
      out.push({ ...o, caseId: c.id, nr: c.nr, inst, sent: o.date <= today });
    });
  });
  return out;
}

export function reminderText(c, r) {
  const amount = r.inst.amount - r.inst.paidAmount;
  const fmt = (v) => {
    const [int, dec] = v.toFixed(2).split(".");
    return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec} €`;
  };
  const due = r.inst.due.split("-").reverse().join(".");
  if (r.kind === "pas") {
    return {
      subject: `Kujtesë për këstin nr. ${r.inst.n} – lënda ${c.nr}`,
      email: `I nderuar/E nderuar ${c.applicant.contact},\n\nJu njoftojmë me mirësjellje se kësti nr. ${r.inst.n} i planit të pagesës për lëndën ${c.nr}, në shumë prej ${fmt(amount)}, me afat ${due}, ende nuk është evidentuar në sistemin tonë.\n\nNëse pagesa është kryer së fundmi, ju lutemi injoroni këtë mesazh. Përndryshe, mund të paguani në çdo bankë komerciale duke përdorur referencën ${c.nr}. Për çdo paqartësi ose nevojë për ripërshtatje të planit, jemi në dispozicion.\n\nMe respekt,\nDrejtoria e Financave\nKomuna e Ferizajt`,
      sms: `Komuna e Ferizajt: Kësti ${r.inst.n} (${fmt(amount)}) për lëndën ${c.nr} me afat ${due} nuk është evidentuar ende. Nëse e keni paguar, faleminderit. Info: 0290 000 000`,
    };
  }
  return {
    subject: `Kujtesë: kësti nr. ${r.inst.n} skadon më ${due}`,
    email: `I nderuar/E nderuar ${c.applicant.contact},\n\nJu kujtojmë se kësti nr. ${r.inst.n} i planit të pagesës për lëndën ${c.nr} (${c.applicant.name}), në shumë prej ${fmt(amount)}, ka afat pagese ${due}.\n\nReferenca e pagesës: ${c.nr}\n\nFaleminderit për bashkëpunimin.\n\nMe respekt,\nDrejtoria e Financave\nKomuna e Ferizajt`,
    sms: `Komuna e Ferizajt: Kujtesë – kësti ${r.inst.n} (${fmt(amount)}) për lëndën ${c.nr} skadon më ${due}. Ref: ${c.nr}. Faleminderit!`,
  };
}

export function applicantNotice(c, cases, today) {
  if (c.stage !== "leje" || c.status === "perfunduar") return null;
  const others = cases.filter((o) => o.id !== c.id && o.applicant.nui === c.applicant.nui && o.plan);
  const withOpen = others.filter((o) => allocate(o, today).pastDue.length > 0);
  return withOpen.length ? withOpen : null;
}

export function inspectionPhase(id) {
  return INSPECTION_PHASES.find((p) => p.id === id);
}

export const INSPECTION_STATUS = {
  planifikuar: { label: "Planifikuar", tone: "info" },
  kerkuar: { label: "Kërkuar nga investitori", tone: "warn" },
  kryer: { label: "Kryer", tone: "ok" },
  ne_pritje: { label: "Në pritje të fazës", tone: "" },
};

export const INSPECTION_RESULT = {
  ne_rregull: { label: "Në përputhje me lejen", tone: "ok" },
  verejtje: { label: "Me vërejtje – kërkon rishikim", tone: "warn" },
};
