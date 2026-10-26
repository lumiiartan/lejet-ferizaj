import { getState, setRole } from "../store.js";
import { navigate } from "../utils.js";

function steps() {
  const h = getState().meta.heroes;
  return [
    {
      title: "Kryetari: pasqyra",
      body: "KPI pozitive, koha e trajtimit krahasuar me afatin 45 ditë, të hyrat. Vetëm totale – pa emra investitorësh.",
      role: "mayor", path: "paneli",
    },
    {
      title: "Zyrtari: detyrat e mia",
      body: "Lënda e Nerodime Invest është në ditën 31. Mungojnë 2 dokumente dhe del njoftimi i butë për planin e pagesës.",
      role: "officer", path: `lendet/${h.h1}`,
    },
    {
      title: "Dosja dhe letra për plotësim",
      body: "Te «Dosja» shtypni «Përgatit kërkesën për plotësim». Letra e sjellshme del gati për shtyp.",
      role: "officer", path: `lendet/${h.h1}?tab=dosja`,
    },
    {
      title: "Kalkulatori i parametrave",
      body: "ISPN 3,04 kundrejt 3,00: terracat e penthouse-it llogariten si bruto. Rregulli vendoset një herë për të gjithë.",
      role: "officer", path: `lendet/${h.h1}?tab=parametrat`,
    },
    {
      title: "Drejtori: lëshon lejen",
      body: "Lënda e Sharri Projekt është gati. «Miratoj dhe lësho» → taksa fiksohet, plani i kësteve krijohet, leja ndahet me Inspektoratin.",
      role: "director", path: `lendet/${h.h3}`,
    },
    {
      title: "Financat: pagesat dhe parashikimi",
      body: "«Import nga banka» → «Gjenero shembull» → «Kontrollo» → «Regjistro». Pastaj «Parashikimi 12-mujor» për buxhetin.",
      role: "finance", path: "pagesat?tab=import",
    },
    {
      title: "Inspektori në terren (celular)",
      body: "Lepenci Ndërtim kërkoi inspektimin e konstruksionit. Hapni formularin, plotësoni dhe nënshkruani → procesverbali.",
      role: "inspector", path: "inspektimet",
    },
    {
      title: "Raporti për Kuvendin",
      body: "Raport tremujor i gatshëm për shtyp, plus pasqyra e rekomandimeve të auditimit.",
      role: "mayor", path: "raportet",
    },
  ];
}

export function renderGuideInto(container) {
  if (!container) return;
  const list = steps();
  container.innerHTML = `
    <h2>Udhëzuesi i demos</h2>
    <p class="muted small">~15 minuta · çdo hap ndërron rolin dhe hap ekranin e duhur</p>
    <ol>
      ${list.map((s, i) => `
        <li>
          <strong>${s.title}</strong>
          <p class="muted small">${s.body}</p>
          <button type="button" class="btn secondary sm guide-step" data-step="${i}">Hap</button>
        </li>`).join("")}
    </ol>`;
  container.querySelectorAll(".guide-step").forEach((btn) => btn.addEventListener("click", () => {
    const s = list[Number(btn.dataset.step)];
    setRole(s.role);
    navigate(s.path);
    window.dispatchEvent(new Event("hashchange"));
  }));
}
