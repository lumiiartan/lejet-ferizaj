import { STAGES, STATUSES } from "../../data/config.js";
import { deadline, deadlineTone, stageIndex } from "../rules.js";
import { esc } from "../utils.js";

export function badge(text, tone = "") {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

export function statusBadge(c) {
  const s = STATUSES[c.status];
  return badge(s.label, s.tone);
}

export function stageLabel(c) {
  if (c.status === "perfunduar") return "Përfunduar";
  return STAGES.find((s) => s.id === c.stage)?.short ?? c.stage;
}

export function deadlineBadge(c, today) {
  const d = deadline(c, today);
  if (!d) return '<span class="muted">—</span>';
  return badge(d.text.split(" · ")[0], deadlineTone(d.level));
}

export function deadlineMeter(c, today) {
  const d = deadline(c, today);
  if (!d) return "";
  const pct = Math.min(100, (d.elapsed / 45) * 100);
  return `
    <div class="meter ${d.level}" role="img" aria-label="${esc(d.text)}">
      <div class="meter-bar"><span style="width:${pct}%"></span><i style="left:${(30 / 45) * 100}%"></i><i style="left:${(40 / 45) * 100}%"></i></div>
      <div class="meter-text"><strong>${esc(d.text)}</strong><span class="muted">Afati ligjor: 45 ditë · njoftime në ditën 30 dhe 40</span></div>
    </div>`;
}

export function stepper(c) {
  const current = stageIndex(c.stage);
  const done = c.status === "perfunduar";
  return `
    <ol class="stepper" aria-label="Cikli i lëndës">
      ${STAGES.map((s, i) => {
        const state = done || i < current ? "done" : i === current ? "current" : "todo";
        return `<li class="${state}" ${state === "current" ? 'aria-current="step"' : ""}><span class="dot">${state === "done" ? "✓" : i + 1}</span><span class="lbl">${s.label}</span></li>`;
      }).join("")}
    </ol>`;
}

export function kpi({ label, value, sub = "", tone = "", href = "" }) {
  const tag = href ? "a" : "section";
  return `
    <${tag} class="card kpi ${tone}" ${href ? `href="${href}"` : ""}>
      <p class="kpi-label">${label}</p>
      <p class="kpi-value">${value}</p>
      ${sub ? `<p class="kpi-sub">${sub}</p>` : ""}
    </${tag}>`;
}

export function pageHead(title, sub = "", actions = "") {
  return `
    <div class="page-head">
      <div>
        <h1>${title}</h1>
        ${sub ? `<p class="muted">${sub}</p>` : ""}
      </div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ""}
    </div>`;
}

export function notice(text, tone = "info", title = "") {
  return `<div class="notice ${tone}" role="note">${title ? `<strong>${title}</strong>` : ""}<span>${text}</span></div>`;
}

export function tasksPanel(tasks, title = "Detyrat e mia") {
  return `
    <section class="card tasks">
      <div class="card-head"><h2>${title}</h2>${badge(String(tasks.length), tasks.length ? "info" : "ok")}</div>
      ${tasks.length
        ? `<ul class="task-list">${tasks.map((t) => `
            <li><a class="task ${t.tone ?? ""}" href="${t.href}">
              <span class="task-dot" aria-hidden="true"></span>
              <span class="task-body"><strong>${t.title}</strong><span class="muted">${t.text}</span></span>
              <span class="task-go" aria-hidden="true">›</span>
            </a></li>`).join("")}</ul>`
        : '<p class="empty">Nuk ka detyra të hapura. Punë e mbarë!</p>'}
    </section>`;
}
