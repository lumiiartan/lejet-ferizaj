import { getRole, getTheme, loadState, subscribe } from "./store.js";
import { parseHash, navigate } from "./utils.js";
import { destroyCharts } from "./charts.js";
import { bindShell, canAccess, renderShell, roleHome } from "./views/shell.js";
import * as dashboard from "./views/dashboard.js";
import * as cases from "./views/cases.js";
import * as caseDetail from "./views/case-detail.js";
import * as payments from "./views/payments.js";
import * as inspections from "./views/inspections.js";
import * as reports from "./views/reports.js";
import * as sync from "./views/sync.js";
import * as settings from "./views/settings.js";
import * as prints from "./views/print.js";
import { renderGuideInto } from "./views/guide.js";

const appEl = document.getElementById("app");
let guideOpen = false;
let lastPath = "";

function pick(parts) {
  const [root, id] = parts;
  if (root === "lendet" && id) return caseDetail;
  if (root === "inspektimi") return inspections;
  return { paneli: dashboard, lendet: cases, pagesat: payments, inspektimet: inspections, raportet: reports, sinkronizimi: sync, rregullat: settings, print: prints }[root];
}

function render() {
  loadState();
  document.documentElement.classList.toggle("dark", getTheme() === "dark");
  const { parts, params } = parseHash();
  const role = getRole();
  if (!parts.length || !canAccess(role, parts[0])) {
    navigate(roleHome(role));
    return;
  }
  const view = pick(parts);
  const focusedId = document.activeElement?.id;
  const path = parts.join("/");
  const scroll = window.scrollY;

  destroyCharts();
  const mainHtml = view
    ? view.render(parts, params)
    : '<section class="card"><h1>Faqja nuk u gjet</h1><p class="muted">Kthehuni te faqja kryesore.</p></section>';
  appEl.innerHTML = renderShell({ root: parts[0], mainHtml, guideOpen });
  bindShell(appEl, {
    onToggleGuide: () => {
      guideOpen = !guideOpen;
      render();
    },
  });
  view?.bind?.(parts, params);
  if (guideOpen) renderGuideInto(document.getElementById("guide-panel"), render);

  if (path === lastPath) {
    window.scrollTo(0, scroll);
    const el = focusedId ? document.getElementById(focusedId) : null;
    if (el) {
      el.focus({ preventScroll: true });
      if (el.type === "search" || el.type === "text") el.setSelectionRange(el.value.length, el.value.length);
    }
  } else {
    window.scrollTo(0, 0);
    if (lastPath) document.getElementById("main")?.focus({ preventScroll: true });
  }
  lastPath = path;
}

window.addEventListener("hashchange", render);
subscribe(render);
render();
