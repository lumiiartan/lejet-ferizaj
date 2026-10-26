// Konfigurimi i demos. Vlerat e shënuara TO CONFIRM janë shembuj derisa
// Drejtoria e Urbanizmit t'i konfirmojë me planin rregullues dhe vendimet e Kuvendit.

export const MUNICIPALITY = "Komuna e Ferizajt";
export const PRODUCT = "Asistenti i Lejeve";
export const TAGLINE = "Më shpejt për qytetarin, më saktë për komunën";
export const LEGAL_DEADLINE = 45;
export const DEADLINE_SOFT = 30;
export const DEADLINE_HARD = 40;

export const ZONES = [
  { id: 1, name: "Zona 1 – Qendra", maxCoef: 4.0 },
  { id: 2, name: "Zona 2 – Qendra e zgjeruar", maxCoef: 3.5 },
  { id: 3, name: "Zona 3 – Banim kolektiv", maxCoef: 3.0 },
  { id: 4, name: "Zona 4 – Banim i përzier", maxCoef: 2.5 },
  { id: 5, name: "Zona 5 – Banim individual", maxCoef: 1.2 },
  { id: 6, name: "Zona 6 – Zona ekonomike", maxCoef: 1.5 },
  { id: 7, name: "Zona 7 – Periferia urbane", maxCoef: 1.0 },
  { id: 8, name: "Zona 8 – Zona rurale", maxCoef: 0.6 },
];

export const TYPES = {
  kolektiv: "Banim kolektiv",
  individual: "Banim individual",
  afarist: "Objekt afarist",
  mikst: "Banim dhe afarizëm",
};

export const STAGES = [
  { id: "kushte", label: "Kushtet ndërtimore", short: "Kushtet", decision: "Kushtet ndërtimore" },
  { id: "leje", label: "Leja ndërtimore", short: "Leja", decision: "Leja ndërtimore" },
  { id: "ndertim", label: "Inspektime sipas fazave", short: "Ndërtimi", decision: null },
  { id: "pranim", label: "Pranimi teknik", short: "Pranimi", decision: "Procesverbali i pranimit teknik" },
  { id: "certifikate", label: "Certifikata e përdorimit", short: "Certifikata", decision: "Certifikata e përdorimit" },
];

export const STATUSES = {
  ne_shqyrtim: { label: "Në shqyrtim", tone: "info" },
  kerkon_plotesim: { label: "Kërkon plotësim", tone: "warn" },
  gati_per_vendim: { label: "Gati për vendim", tone: "ok" },
  ne_zbatim: { label: "Në zbatim", tone: "info" },
  perfunduar: { label: "Përfunduar", tone: "ok" },
};

// phases: në cilat faza kërkohet dokumenti; when: kur aplikohet (null = gjithmonë)
export const CHECKLIST = [
  { id: "prona", label: "Certifikata e pronës", stages: ["kushte", "leje"] },
  { id: "kopja", label: "Kopja e planit", stages: ["kushte", "leje"] },
  { id: "gjeodezi", label: "Matjet gjeodezike", stages: ["kushte", "leje"] },
  { id: "konceptual", label: "Projekti konceptual", stages: ["kushte"] },
  { id: "kryesor", label: "Projekti kryesor", stages: ["leje"] },
  { id: "statik", label: "Elaborati statik", stages: ["leje"] },
  { id: "fizika", label: "Fizika ndërtimore", stages: ["leje"], when: (c) => c.category === "II" },
  { id: "gropa", label: "Elaborati i gropës ndërtimore", stages: ["leje"], when: (c) => c.floorsBelow > 0, hint: "kur ka etazhe nën tokë" },
  { id: "zjarri", label: "Mbrojtja nga zjarri", stages: ["leje"], when: (c) => c.category === "II" || c.floorsAbove >= 4 },
  { id: "gjeomek", label: "Elaborati gjeomekanik", stages: ["leje"], when: (c) => c.category === "II" },
  { id: "keds", label: "Pëlqimi i KEDS", stages: ["leje"] },
  { id: "ujesjellesi", label: "Pëlqimi i ujësjellësit (KRU)", stages: ["leje"] },
  { id: "hekurudha", label: "Pëlqimi i Infrakos (hekurudha)", stages: ["kushte", "leje"], when: (c) => c.nearRailway, hint: "kur parcela është pranë hekurudhës" },
  { id: "pranim_dok", label: "Dokumentacioni i ndërtimit të kryer", stages: ["pranim"] },
  { id: "pranim_inst", label: "Atestet e instalimeve", stages: ["pranim"] },
  { id: "cert_kerkese", label: "Kërkesa për certifikatë përdorimi", stages: ["certifikate"] },
];

export const INSPECTION_PHASES = [
  {
    id: "themeli",
    label: "Themeli",
    offset: 45,
    checks: ["Pozicioni i objektit sipas situacionit", "Kuota e themelit sipas projektit", "Armatura sipas elaboratit statik", "Hidroizolimi i themelit"],
  },
  {
    id: "konstruksioni",
    label: "Konstruksioni",
    offset: 150,
    checks: ["Shtyllat dhe trarët sipas elaboratit", "Pllakat ndërkatëshe", "Lartësia e etazheve", "Masat e sigurisë në kantier"],
  },
  {
    id: "kati_fundit",
    label: "Kati i fundit",
    offset: 270,
    checks: ["Numri i etazheve sipas lejes", "Lartësia totale e objektit", "Terracat dhe penthouse sipas projektit", "Kulmi / izolimi"],
  },
  {
    id: "instalimet",
    label: "Instalimet",
    offset: 360,
    checks: ["Instalimet elektrike", "Ujësjellësi dhe kanalizimi", "Ngrohja dhe ventilimi", "Mbrojtja nga zjarri"],
  },
  {
    id: "final",
    label: "Inspektimi final",
    offset: 450,
    checks: ["Përputhshmëria me lejen", "Vendet e parkimit", "Sipërfaqja e gjelbër", "Qasja për persona me aftësi të kufizuara"],
  },
];

export const DEFAULT_RULES = {
  zoneCoef: Object.fromEntries(ZONES.map((z) => [z.id, z.maxCoef])),
  zoneCoefConfirmed: false,
  penthouseTerraces: "bruto",
  donatedLand: "perfshihet",
  parkingPerUnit: 1,
  parkingPerBusiness: 1,
  greenMinPct: 20,
  fees: [
    { id: "mbi", label: "Taksa e lejes – sipërfaqja bruto mbi tokë", basis: "m2_mbi", value: 10 },
    { id: "nen", label: "Taksa e lejes – sipërfaqja bruto nën tokë", basis: "m2_nen", value: 3 },
    { id: "adm", label: "Taksa administrative", basis: "fikse", value: 30 },
  ],
  feesConfirmed: false,
  maxInstalments: 12,
  minDownPct: 20,
  remindBefore: [15, 3],
  remindAfter: 5,
};

export const PEOPLE = {
  officers: [
    { id: "o1", name: "Arbëresha Krasniqi" },
    { id: "o2", name: "Driton Shala" },
    { id: "o3", name: "Mimoza Berisha" },
    { id: "o4", name: "Valon Rexhepi" },
    { id: "o5", name: "Teuta Hajdari" },
  ],
  inspectors: [
    { id: "i1", name: "Fatmir Osmani" },
    { id: "i2", name: "Agron Bytyqi" },
  ],
  director: { name: "Besnik Gashi", title: "Drejtori i Urbanizmit" },
  finance: { name: "Liridona Mustafa", title: "Zyrtare e Financave" },
  mayor: { name: "Kryetari i Komunës", title: "Kryetari" },
};

export const AUDIT_RECOMMENDATIONS = [
  {
    id: "r1",
    title: "Llogaritja e koeficientit të ndërtimit me rregulla të njëjta për të gjitha lëndët",
    how: "Kalkulatori i parametrave me rregulla të konfiguruara një herë nga Drejtori; fletë llogaritjeje e bashkëngjitur çdo vendimi.",
    status: "zbatuar",
  },
  {
    id: "r2",
    title: "Përcjellja e pagesave të taksës me këste dhe arkëtimi në kohë",
    how: "Plan pagese për çdo lëndë, kujtesa automatike 15 dhe 3 ditë para afatit, import i ekstraktit bankar.",
    status: "zbatuar",
  },
  {
    id: "r3",
    title: "Dosje të plota para vendimit",
    how: "Lista e kontrollit sipas kategorisë dhe kërkesë standarde për plotësim me afat.",
    status: "zbatuar",
  },
  {
    id: "r4",
    title: "Respektimi i afatit ligjor prej 45 ditësh",
    how: "Numëruesi i afatit për çdo lëndë me njoftime në ditën 30 dhe 40.",
    status: "zbatuar",
  },
  {
    id: "r5",
    title: "Inspektime të dokumentuara sipas fazave të ndërtimit",
    how: "Plani i inspektimeve krijohet automatikisht me lëshimin e lejes; procesverbal nga terreni.",
    status: "zbatuar",
  },
  {
    id: "r6",
    title: "Përputhja e të dhënave me sistemin qendror të lejeve",
    how: "Fusha «Nr. i lëndës në sistemin qendror» dhe import/eksport CSV. Lidhja automatike kërkon marrëveshje me ministrinë.",
    status: "ne_proces",
  },
];
