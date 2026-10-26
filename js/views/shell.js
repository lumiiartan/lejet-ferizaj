import { MUNICIPALITY, PRODUCT, TAGLINE } from "../../data/config.js";
import { ROLES, currentUser, getRole, getTheme, resetDemo, setRole, setTheme } from "../store.js";
import { navigate } from "../utils.js";

const ICONS = {
  paneli: '<path d="M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z"/>',
  lendet: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  pagesat: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  inspektimet: '<path d="M4 18v-2a8 8 0 0 1 16 0v2zM2 18h20M12 8V5M9 9.5 8 7m7 2.5 1-2.5"/>',
  raportet: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
  sinkronizimi: '<path d="M20 7h-9a5 5 0 0 0 0 10h1M4 17h9a5 5 0 0 0 0-10h-1M17 4l3 3-3 3M7 14l-3 3 3 3"/>',
  rregullat: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};

const LABELS = {
  paneli: "Paneli",
  lendet: "Lëndët",
  pagesat: "Taksat dhe pagesat",
  inspektimet: "Inspektimet",
  raportet: "Raportet",
  sinkronizimi: "Sistemi qendror",
  rregullat: "Rregullat",
};

const SHORT = { pagesat: "Pagesat", sinkronizimi: "Sinkronizimi" };

const NAV = {
  officer: ["paneli", "lendet", "sinkronizimi", "rregullat"],
  director: ["paneli", "lendet", "pagesat", "inspektimet", "raportet", "rregullat"],
  finance: ["pagesat", "paneli", "lendet", "raportet", "rregullat"],
  inspector: ["inspektimet", "lendet"],
  mayor: ["paneli", "raportet", "lendet"],
};

export function icon(name, size = 20) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

export function roleHome(role) {
  return NAV[role][0];
}

export function canAccess(role, root) {
  if (root === "print") return true;
  if (root === "inspektimi") return NAV[role].includes("inspektimet");
  return NAV[role].includes(root);
}

export function canSeePayments(role) {
  return role !== "inspector";
}

export function isReadOnly(role) {
  return role === "mayor";
}

export function renderShell({ root, mainHtml, guideOpen }) {
  const role = getRole();
  const user = currentUser();
  const links = NAV[role];
  return `
    <a class="skip-link" href="#main">Kalo te përmbajtja</a>
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="#/${roleHome(role)}" aria-label="${PRODUCT} – faqja kryesore">
          <img src="./assets/logo.svg" alt="" width="40" height="40" />
          <span class="brand-text">
            <strong>${PRODUCT}</strong>
            <span>${MUNICIPALITY} · ${TAGLINE}</span>
          </span>
        </a>
        <div class="topbar-actions">
          <label class="role-pick">
            <span class="role-caption">Roli</span>
            <select class="role-select" id="role-switcher" aria-label="Ndrysho rolin e demos">
              ${ROLES.map((r) => `<option value="${r.id}" ${r.id === role ? "selected" : ""}>${r.label}</option>`).join("")}
            </select>
          </label>
          <span class="user-chip" title="Përdoruesi i demos">${user.person}${role === "mayor" ? ' · <span class="ro">vetëm lexim</span>' : ""}</span>
          <button type="button" class="btn secondary sm" id="btn-guide" aria-expanded="${guideOpen}">${guideOpen ? "Mbyll udhëzuesin" : "Udhëzuesi"}</button>
          <button type="button" class="btn ghost sm icon-btn" id="btn-theme" aria-label="${getTheme() === "dark" ? "Kalo në pamje të çelët" : "Kalo në pamje të errët"}">${getTheme() === "dark" ? "☀" : "☾"}</button>
          <button type="button" class="btn ghost sm" id="btn-reset">Rivendos demon</button>
        </div>
      </div>
    </header>
    <div class="app-body">
      <aside class="sidebar" aria-label="Navigimi kryesor">
        <nav>
          ${links.map((p) => `<a class="nav-link ${root === p || (root === "inspektimi" && p === "inspektimet") ? "active" : ""}" href="#/${p}" ${root === p ? 'aria-current="page"' : ""}>${icon(p)}<span>${LABELS[p]}</span></a>`).join("")}
        </nav>
        <p class="sidebar-note">Plotëson sistemin qendror të lejeve – nuk e zëvendëson.</p>
      </aside>
      <main class="content" id="main" tabindex="-1">${mainHtml}</main>
    </div>
    <footer class="app-footer">Demo – të gjitha të dhënat janë fiktive · ${PRODUCT} · ${MUNICIPALITY}</footer>
    <nav class="mobile-nav" aria-label="Navigimi">
      ${links.map((p) => `<a class="nav-link ${root === p ? "active" : ""}" href="#/${p}">${icon(p)}<span>${SHORT[p] ?? LABELS[p]}</span></a>`).join("")}
    </nav>
    ${guideOpen ? '<aside class="guide-panel" id="guide-panel" aria-label="Udhëzuesi i demos"></aside>' : ""}`;
}

export function bindShell(rootEl, { onToggleGuide }) {
  rootEl.querySelector("#role-switcher").addEventListener("change", (e) => {
    setRole(e.target.value);
    navigate(roleHome(e.target.value));
  });
  rootEl.querySelector("#btn-theme").addEventListener("click", () => setTheme(getTheme() === "dark" ? "light" : "dark"));
  rootEl.querySelector("#btn-reset").addEventListener("click", () => {
    if (confirm("Të rivendosen të dhënat fillestare të demos? Ndryshimet e bëra do të fshihen.")) {
      resetDemo();
      navigate(roleHome(getRole()));
    }
  });
  rootEl.querySelector("#btn-guide").addEventListener("click", onToggleGuide);
}
