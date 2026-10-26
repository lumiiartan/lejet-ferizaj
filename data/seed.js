import { DEFAULT_RULES, INSPECTION_PHASES, PEOPLE } from "./config.js";
import { buildSchedule, fee, requiredDocs } from "../js/rules.js";
import { addDays, addMonths, daysBetween, todayIso } from "../js/utils.js";

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMPANIES = [
  { name: "Nerodime Invest SH.P.K.", nui: "811204551", contact: "Ilir Morina" },
  { name: "Lepenci Ndërtim SH.P.K.", nui: "811377902", contact: "Burim Aliu" },
  { name: "Sharri Projekt SH.P.K.", nui: "810998413", contact: "Fitore Zeqiri" },
  { name: "Ura e Gurit Construction", nui: "811450276", contact: "Kushtrim Jakupi" },
  { name: "Kalaja Home SH.P.K.", nui: "811562118", contact: "Arta Sylejmani" },
  { name: "Bregu i Diellit Group", nui: "810876334", contact: "Gentrit Halili" },
  { name: "Fusha Invest SH.P.K.", nui: "811623745", contact: "Edona Rama" },
  { name: "Ndërtimi Modern F.", nui: "811004987", contact: "Shpëtim Kryeziu" },
  { name: "Arbëria Residence SH.P.K.", nui: "811731260", contact: "Vlora Ismaili" },
  { name: "Qyteti i Ri Ndërtim", nui: "810945512", contact: "Ardian Musliu" },
  { name: "Vëllezërit Hasani Ndërtim", nui: "811285039", contact: "Naim Hasani" },
  { name: "Delta Kompleks SH.P.K.", nui: "811819402", contact: "Blerta Hoti" },
];

const PERSONS = ["Agim Hoxha", "Merita Sadiku", "Fadil Ramadani", "Luljeta Kastrati", "Bekim Hyseni", "Shqipe Mehmeti", "Ramiz Qerimi", "Hana Bajrami", "Nexhat Gashi", "Drita Selmani", "Afrim Limani", "Vjosa Zymberi"];

const DESIGNERS = ["Studio Arkitektonike Forma", "Projekt Plus SH.P.K.", "Linja Arkitektura", "AB Design Studio", "Arkitekt Konsult", "Hapësira Studio"];

const STREETS = ["Rr. Dëshmorët e Kombit", "Rr. Rexhep Bislimi", "Rr. Ahmet Kaçiku", "Rr. Vëllezërit Gërvalla", "Rr. Adem Jashari", "Rr. Skënderbeu", "Rr. Nëna Terezë", "Rr. Zenel Salihu", "Rr. Fehmi Lladrovci", "Rr. Hakif Zejnullahu", "Rr. Ibrahim Rugova", "Rr. Lidhja e Prizrenit"];

const ZONE_BY_TYPE = {
  kolektiv: [1, 2, 2, 3, 3, 3, 4],
  individual: [4, 5, 5, 5, 7, 8],
  afarist: [2, 6, 6, 6, 4],
  mikst: [1, 2, 3, 4],
};

export function createSeed(today = todayIso()) {
  const r = rng(20261026);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const between = (a, b) => Math.round(a + r() * (b - a));
  const rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
  const officers = PEOPLE.officers.map((o) => o.id);
  const cases = [];

  function makeBuilding(type, zone) {
    const maxCoef = rules.zoneCoef[zone];
    const parcelArea = {
      kolektiv: between(900, 3200),
      individual: between(320, 900),
      afarist: between(800, 3000),
      mikst: between(900, 2600),
    }[type];
    const category = type === "individual" ? "I" : "II";
    const coef = maxCoef * (0.62 + r() * 0.36) * (r() < 0.1 ? 1.07 : 1);
    const grossAbove = Math.round(parcelArea * coef);
    const floorsAbove = { kolektiv: between(5, 10), individual: between(2, 3), afarist: between(2, 5), mikst: between(4, 8) }[type];
    const footprint = grossAbove / floorsAbove;
    const floorsBelow = type === "individual" ? (r() < 0.3 ? 1 : 0) : between(0, 2) || (type === "kolektiv" ? 1 : 0);
    const grossBelow = Math.round(footprint * floorsBelow * (1 + r() * 0.3));
    const penthouse = (type === "kolektiv" || type === "mikst") && r() < 0.5;
    const terraceArea = penthouse ? between(70, 230) : 0;
    const housingUnits = type === "afarist" ? 0 : type === "individual" ? between(1, 2) : Math.round((grossAbove * (type === "mikst" ? 0.65 : 0.85)) / 82);
    const businessUnits = type === "afarist" ? between(4, 18) : type === "individual" ? 0 : between(2, 8);
    const parkingReq = housingUnits + businessUnits;
    const parkingSpaces = Math.round(parkingReq * (r() < 0.07 ? 0.88 : 1 + r() * 0.3));
    const greenArea = Math.round(parcelArea * (r() < 0.06 ? 0.17 : 0.205 + r() * 0.1));
    const donatedArea = r() < 0.3 ? between(40, 200) : 0;
    return {
      zone, category, type, parcelArea, grossAbove, grossBelow, floorsAbove, floorsBelow,
      penthouse, terraceArea, housingUnits, businessUnits, parkingSpaces, greenArea, donatedArea,
      nearRailway: r() < 0.14,
    };
  }

  function docsAll(c, stage, date, out = c.docs) {
    requiredDocs(c, stage).forEach((item) => {
      out[item.id] = { present: true, date: addDays(date, -between(0, 3)) };
    });
  }

  // Lejet e lëshuara kanë qenë brenda normave të kohës kur u lëshuan.
  function comply(c) {
    const baseArea = c.parcelArea;
    const terraces = c.penthouse && rules.penthouseTerraces === "bruto" ? c.terraceArea : 0;
    const maxGross = Math.floor(baseArea * rules.zoneCoef[c.zone]) - terraces;
    if (c.grossAbove > maxGross) c.grossAbove = Math.round(maxGross * 0.97);
    c.parkingSpaces = Math.max(c.parkingSpaces, c.housingUnits + c.businessUnits);
    c.greenArea = Math.max(c.greenArea, Math.ceil(baseArea * 0.205));
  }

  function decisionDays() {
    return r() < 0.06 ? between(46, 52) : between(14, 42);
  }

  function addPlan(c, permitDate, { count, step, downPct } = {}) {
    c.fee = { ...fee(c, rules), date: permitDate };
    const n = count ?? (r() < 0.55 ? pick([4, 6, 8, 10, 12]) : 1);
    const stepMonths = step ?? (n === 4 ? 3 : 1);
    c.plan = {
      agreedDate: permitDate,
      count: n,
      stepMonths,
      downPct: downPct ?? (n === 1 ? 100 : pick([20, 25, 30])),
      instalments: buildSchedule(c.fee.total, { count: n, downPct: downPct ?? pick([20, 25, 30]), firstDue: permitDate, stepMonths }, addMonths),
    };
    c.payments = [];
    c.plan.instalments.forEach((inst, idx) => {
      if (idx === 0) {
        c.payments.push({ id: `p-${c.id}-1`, date: inst.due, amount: inst.amount, source: "banka", note: "Pagesa para lëshimit të lejes" });
        return;
      }
      const roll = r();
      let date = null;
      if (inst.due <= today) {
        if (roll < 0.93) date = addDays(inst.due, -between(0, 8));
        else if (roll < 0.985) date = addDays(inst.due, between(3, 18));
      } else if (daysBetween(today, inst.due) < 12 && roll < 0.2) {
        date = addDays(today, -between(0, 3));
      }
      if (date && date <= today) c.payments.push({ id: `p-${c.id}-${inst.n}`, date, amount: inst.amount, source: "banka", note: "" });
    });
  }

  function simulate(c, received) {
    const by = (id) => PEOPLE.officers.find((o) => o.id === id)?.name;
    const tl = c.timeline;
    c.receivedDate = received;
    tl.push({ date: received, kind: "pranim", title: "Aplikimi u pranua", text: "Kërkesa për kushte ndërtimore u regjistrua dhe iu caktua zyrtarit.", by: by(c.officerId) });

    let start = received;
    const stages = ["kushte", "leje"];
    for (const stage of stages) {
      const days = decisionDays();
      const decision = addDays(start, days);
      if (decision > today) return current(c, stage, start);
      docsAll(c, stage, addDays(start, between(-2, 6)));
      if (r() < 0.35) {
        const reqDate = addDays(start, between(4, 10));
        tl.push({ date: reqDate, kind: "kerkese", title: "Kërkesë për plotësim", text: "U dërgua kërkesë për plotësim të dosjes me afat 15 ditë.", by: by(c.officerId) });
        tl.push({ date: addDays(reqDate, between(3, 12)), kind: "dokument", title: "Dosja u plotësua", text: "Aplikuesi dorëzoi dokumentet e kërkuara.", by: c.applicant.contact });
      }
      const nr = `${stage === "kushte" ? "KN" : "LN"}-${decision.slice(0, 4)}-${String(between(100, 999))}`;
      c.decisions.push({ stage, date: decision, days, nr });
      tl.push({ date: decision, kind: "vendim", title: stage === "kushte" ? "U lëshuan kushtet ndërtimore" : "U lëshua leja ndërtimore", text: `Vendimi nr. ${nr} · ${days} ditë trajtim`, by: PEOPLE.director.name });
      if (stage === "kushte") {
        start = addDays(decision, between(5, 30));
        if (start > today) start = decision;
        tl.push({ date: start, kind: "pranim", title: "Aplikimi për leje ndërtimore", text: "Aplikuesi dorëzoi projektin kryesor.", by: c.applicant.contact });
      } else {
        comply(c);
        addPlan(c, decision);
        tl.push({ date: decision, kind: "pagese", title: c.plan.count > 1 ? `Plan pagese me ${c.plan.count} këste` : "Taksa u pagua në tërësi", text: "Pagesa e parë u evidentua para lëshimit të lejes.", by: PEOPLE.finance.name });
        tl.push({ date: decision, kind: "inspektim", title: "Leja u nda me Inspektoratin", text: "U krijua plani i inspektimeve sipas fazave.", by: "Sistemi" });
        start = decision;
      }
    }

    const permit = start;
    let lastDone = permit;
    let open = false;
    c.inspections = INSPECTION_PHASES.map((phase) => {
      const planned = addDays(permit, Math.round(phase.offset * (0.85 + r() * 0.35)));
      const inspectorId = pick(["i1", "i2"]);
      if (!open && planned <= today) {
        lastDone = planned;
        const result = r() < 0.86 ? "ne_rregull" : "verejtje";
        const checks = Object.fromEntries(phase.checks.map((_, i) => [i, true]));
        if (result === "verejtje") checks[between(0, phase.checks.length - 1)] = false;
        tl.push({ date: planned, kind: "inspektim", title: `Inspektimi: ${phase.label}`, text: result === "ne_rregull" ? "Në përputhje me lejen." : "Me vërejtje; investitori u njoftua për rishikim.", by: PEOPLE.inspectors.find((i) => i.id === inspectorId).name });
        return { phase: phase.id, planned, status: "kryer", doneDate: planned, inspectorId, result, checks, notes: result === "verejtje" ? "Vërejtje e vogël, u adresua brenda javës." : "" };
      }
      const first = !open;
      open = true;
      return { phase: phase.id, planned, status: first && daysBetween(today, planned) <= 7 ? "planifikuar" : "ne_pritje", inspectorId, result: null, checks: {}, notes: "" };
    });
    if (open) return current(c, "ndertim", permit);

    for (const stage of ["pranim", "certifikate"]) {
      start = addDays(lastDone, between(5, 15));
      const days = between(8, 30);
      const decision = addDays(start, days);
      if (start > today || decision > today) return current(c, stage, start > today ? addDays(today, -2) : start);
      docsAll(c, stage, start);
      tl.push({ date: start, kind: "pranim", title: stage === "pranim" ? "Kërkesë për pranim teknik" : "Kërkesë për certifikatë përdorimi", text: "Kërkesa u regjistrua.", by: c.applicant.contact });
      const nr = `${stage === "pranim" ? "PT" : "CP"}-${decision.slice(0, 4)}-${String(between(100, 999))}`;
      c.decisions.push({ stage, date: decision, days, nr });
      tl.push({ date: decision, kind: "vendim", title: stage === "pranim" ? "Pranimi teknik u krye" : "U lëshua certifikata e përdorimit", text: `Vendimi nr. ${nr} · ${days} ditë trajtim`, by: PEOPLE.director.name });
      lastDone = decision;
    }
    c.stage = "certifikate";
    c.status = "perfunduar";
    c.stageStart = lastDone;
    return c;
  }

  function current(c, stage, start) {
    c.stage = stage;
    c.stageStart = start;
    if (stage === "ndertim") {
      c.status = "ne_zbatim";
      return c;
    }
    const items = requiredDocs(c, stage);
    const elapsed = daysBetween(start, today);
    const roll = r();
    let missing = [];
    if (roll < 0.24 && elapsed > 5) {
      c.status = "kerkon_plotesim";
      missing = items.slice(2).sort(() => r() - 0.5).slice(0, between(1, 3)).map((i) => i.id);
      const reqDate = addDays(start, Math.min(elapsed - 1, between(4, 10)));
      c.requests.push({ id: `rq-${c.id}`, date: reqDate, stage, items: missing, deadline: addDays(reqDate, 15) });
      c.timeline.push({ date: reqDate, kind: "kerkese", title: "Kërkesë për plotësim", text: `U kërkuan ${missing.length} dokumente me afat 15 ditë.`, by: PEOPLE.officers.find((o) => o.id === c.officerId).name });
    } else if (roll < 0.42 && elapsed > 8) {
      c.status = "gati_per_vendim";
    } else {
      c.status = "ne_shqyrtim";
      if (r() < 0.55) missing = items.slice(2).sort(() => r() - 0.5).slice(0, between(1, 2)).map((i) => i.id);
    }
    items.forEach((item) => {
      c.docs[item.id] = missing.includes(item.id) ? { present: false } : { present: true, date: addDays(start, between(0, 3)) };
    });
    if (stage === "leje" && !c.plan && r() < 0.5) {
      c.planDraft = { count: pick([6, 8, 12]), downPct: 20, stepMonths: 1 };
    }
    return c;
  }

  function base(idx, type, zone, officerId) {
    const isPerson = type === "individual";
    const company = isPerson ? null : pick(COMPANIES.slice(3));
    const person = isPerson ? pick(PERSONS) : null;
    return {
      id: `c${String(idx).padStart(3, "0")}`,
      nr: "",
      nationalNr: null,
      applicant: isPerson
        ? { name: person, nui: String(between(1100000000, 1299999999)), contact: person, kind: "Person fizik" }
        : { name: company.name, nui: company.nui, contact: company.contact, kind: "Person juridik" },
      designer: pick(DESIGNERS),
      address: `${pick(STREETS)}, Ferizaj`,
      parcel: `P-71914061-${String(between(1000, 9999)).padStart(5, "0")}-${between(0, 3)}`,
      officerId,
      ...makeBuilding(type, zone),
      stage: "kushte",
      status: "ne_shqyrtim",
      stageStart: today,
      receivedDate: today,
      docs: {},
      requests: [],
      decisions: [],
      timeline: [],
      fee: null,
      plan: null,
      planDraft: null,
      payments: [],
      inspections: [],
    };
  }

  const TYPES = ["kolektiv", "kolektiv", "kolektiv", "kolektiv", "individual", "individual", "afarist", "mikst"];
  const ages = [];
  for (let i = 0; i < 38; i += 1) ages.push(between(1, 120));
  for (let i = 0; i < 34; i += 1) ages.push(between(120, 480));
  for (let i = 0; i < 22; i += 1) ages.push(between(480, 900));
  ages.length = 0;
  for (let i = 0; i < 135; i += 1) ages.push(between(1, 365));
  for (let i = 0; i < 16; i += 1) ages.push(between(1, 70));
  for (let i = 0; i < 40; i += 1) ages.push(between(365, 900));
  ages.forEach((age, i) => {
    const type = pick(TYPES);
    const c = base(i + 1, type, pick(ZONE_BY_TYPE[type]), officers[i % officers.length]);
    simulate(c, addDays(today, -age));
    cases.push(c);
  });

  // Lëndë kyçe për udhëzuesin e demos.
  const heroes = {};
  const heroIds = () => heroes;
  const [nerodime, lepenci, sharri] = COMPANIES;
  const asCompany = (co) => ({ name: co.name, nui: co.nui, contact: co.contact, kind: "Person juridik" });
  const officerName = (id) => PEOPLE.officers.find((o) => o.id === id).name;

  function inLeje(c, { received, kushteDays, lejeStart, kushteNr }) {
    c.receivedDate = received;
    const decided = addDays(received, kushteDays);
    docsAll(c, "kushte", received);
    c.decisions = [{ stage: "kushte", date: decided, days: kushteDays, nr: kushteNr }];
    c.timeline = [
      { date: received, kind: "pranim", title: "Aplikimi u pranua", text: "Kërkesa për kushte ndërtimore u regjistrua dhe iu caktua zyrtarit.", by: officerName(c.officerId) },
      { date: decided, kind: "vendim", title: "U lëshuan kushtet ndërtimore", text: `Vendimi nr. ${kushteNr} · ${kushteDays} ditë trajtim`, by: PEOPLE.director.name },
      { date: lejeStart, kind: "pranim", title: "Aplikimi për leje ndërtimore", text: "Aplikuesi dorëzoi projektin kryesor.", by: c.applicant.contact },
    ];
    c.stage = "leje";
    c.stageStart = lejeStart;
    docsAll(c, "leje", lejeStart);
  }

  // Lënda e mëparshme e të njëjtit investitor, me një këst pas afatit.
  const h1b = base(901, "kolektiv", 2, "o3");
  h1b.applicant = asCompany(nerodime);
  simulate(h1b, addDays(today, -300));
  {
    const permit = h1b.decisions.find((d) => d.stage === "leje").date;
    addPlan(h1b, permit, { count: 12, step: 1, downPct: 20 });
    const target = [...h1b.plan.instalments].reverse().find((i) => i.due < today && i.n > 1);
    const shift = daysBetween(target.due, addDays(today, -9));
    h1b.plan.instalments.forEach((i) => { if (i.n > 1) i.due = addDays(i.due, shift); });
    h1b.payments = h1b.plan.instalments
      .filter((i) => i.n < target.n)
      .map((i) => ({ id: `p-${h1b.id}-${i.n}`, date: addDays(i.due, -between(0, 5)), amount: i.amount, source: "banka", note: i.n === 1 ? "Pagesa para lëshimit të lejes" : "" }));
    const planEntry = h1b.timeline.find((t) => t.kind === "pagese");
    if (planEntry) planEntry.title = "Plan pagese me 12 këste";
  }
  cases.push(h1b);
  heroes.h1b = h1b.id;

  const h1 = base(902, "kolektiv", 3, "o1");
  Object.assign(h1, {
    applicant: asCompany(nerodime),
    designer: "Studio Arkitektonike Forma",
    address: "Rr. Rexhep Bislimi, Ferizaj",
    parcelArea: 1850, donatedArea: 120, grossAbove: 5420, grossBelow: 2360, floorsAbove: 8, floorsBelow: 2,
    penthouse: true, terraceArea: 210, housingUnits: 58, businessUnits: 4, parkingSpaces: 64, greenArea: 410, nearRailway: false,
    status: "ne_shqyrtim",
    planDraft: { count: 8, downPct: 20, stepMonths: 1 },
  });
  inLeje(h1, { received: addDays(today, -96), kushteDays: 38, lejeStart: addDays(today, -31), kushteNr: `KN-${addDays(today, -58).slice(0, 4)}-412` });
  h1.docs.gropa = { present: false };
  h1.docs.keds = { present: false };
  cases.push(h1);
  heroes.h1 = h1.id;

  const h2 = base(903, "kolektiv", 3, "o2");
  h2.applicant = asCompany(lepenci);
  h2.address = "Rr. Vëllezërit Gërvalla, Ferizaj";
  simulate(h2, addDays(today, -235));
  {
    const [themeli, konstr, ...rest] = h2.inspections;
    Object.assign(themeli, { status: "kryer", doneDate: addDays(today, -95), planned: addDays(today, -95), result: "ne_rregull", checks: { 0: true, 1: true, 2: true, 3: true }, inspectorId: "i1" });
    Object.assign(konstr, { status: "kerkuar", requestedDate: addDays(today, -1), planned: addDays(today, 2), inspectorId: "i1", doneDate: null, result: null, checks: {} });
    rest.forEach((ins) => Object.assign(ins, { status: "ne_pritje", doneDate: null, result: null, checks: {} }));
    h2.timeline = h2.timeline.filter((t) => !t.title.startsWith("Inspektimi:"));
    h2.timeline.push({ date: themeli.doneDate, kind: "inspektim", title: "Inspektimi: Themeli", text: "Në përputhje me lejen.", by: PEOPLE.inspectors[0].name });
    h2.timeline.push({ date: addDays(today, -1), kind: "inspektim", title: "Kërkesë për inspektim: Konstruksioni", text: "Investitori kërkoi inspektimin e fazës së konstruksionit.", by: lepenci.contact });
    h2.stage = "ndertim";
    h2.status = "ne_zbatim";
  }
  cases.push(h2);
  heroes.h2 = h2.id;

  const h3 = base(904, "mikst", 2, "o2");
  h3.applicant = asCompany(sharri);
  h3.grossAbove = Math.round(h3.parcelArea * 2.9);
  h3.parkingSpaces = h3.housingUnits + h3.businessUnits + 6;
  h3.greenArea = Math.round(h3.parcelArea * 0.24);
  h3.donatedArea = 0;
  h3.penthouse = false;
  h3.terraceArea = 0;
  h3.status = "gati_per_vendim";
  h3.planDraft = { count: 6, downPct: 25, stepMonths: 1 };
  inLeje(h3, { received: addDays(today, -70), kushteDays: 35, lejeStart: addDays(today, -26), kushteNr: `KN-${addDays(today, -35).slice(0, 4)}-388` });
  h3.timeline.push({ date: addDays(today, -3), kind: "dokument", title: "Dosja u kompletua", text: "Të gjitha dokumentet e kërkuara janë në dosje.", by: officerName("o2") });
  cases.push(h3);
  heroes.h3 = h3.id;

  const h4 = base(905, "kolektiv", 4, "o1");
  Object.assign(h4, { receivedDate: addDays(today, -12), stage: "kushte", status: "kerkon_plotesim", stageStart: addDays(today, -12) });
  docsAll(h4, "kushte", h4.stageStart);
  h4.docs.gjeodezi = { present: false };
  h4.requests = [{ id: "rq-h4", date: addDays(today, -4), stage: "kushte", items: ["gjeodezi"], deadline: addDays(today, 11) }];
  h4.timeline = [
    { date: h4.receivedDate, kind: "pranim", title: "Aplikimi u pranua", text: "Kërkesa për kushte ndërtimore u regjistrua dhe iu caktua zyrtarit.", by: officerName("o1") },
    { date: addDays(today, -4), kind: "kerkese", title: "Kërkesë për plotësim", text: "U kërkuan matjet gjeodezike me afat 15 ditë.", by: officerName("o1") },
  ];
  cases.push(h4);
  heroes.h4 = h4.id;

  // Disa lëndë afër afatit, që numëruesi të duket në veprim.
  const openMine = cases.filter((c) => c.officerId === "o1" && ["kushte", "leje"].includes(c.stage) && c.status === "ne_shqyrtim" && !Object.values(heroIds()).includes(c.id));
  [41, 35].forEach((days, i) => {
    const c = openMine[i];
    if (!c) return;
    const shift = days - daysBetween(c.stageStart, today);
    c.stageStart = addDays(c.stageStart, -shift);
    c.timeline.forEach((t) => { if (t.date >= addDays(c.stageStart, shift)) t.date = addDays(t.date, -shift); });
  });

  // Numrat e lëndëve sipas datës së pranimit.
  cases.sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));
  const seq = {};
  cases.forEach((c) => {
    const y = c.receivedDate.slice(0, 4);
    seq[y] = (seq[y] || 0) + 1;
    c.nr = `FER-${y}-${String(seq[y] + 40).padStart(4, "0")}`;
    const recent = daysBetween(c.receivedDate, today) < 14;
    c.nationalNr = recent && r() < 0.7 ? null : `eP-${y}-${String(between(1000, 9999)).padStart(5, "0")}`;
    c.timeline.sort((a, b) => a.date.localeCompare(b.date));
    if (c.status === "perfunduar") c.inspections.forEach((i) => { if (i.status !== "kryer") i.status = "kryer"; });
  });


  return {
    meta: { version: 1, seededOn: today, heroes },
    rules,
    rulesLog: [{ date: addDays(today, -60), by: PEOPLE.director.name, text: "Rregullat fillestare u vendosën (vlerat e zonave: TO CONFIRM)." }],
    cases,
    syncLog: [],
    importLog: [],
  };
}
