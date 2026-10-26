let charts = [];

export function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function palette() {
  return {
    primary: css("--primary"),
    primary2: css("--primary-2"),
    soft: css("--chart-soft"),
    ok: css("--ok"),
    warn: css("--warn"),
    muted: css("--muted"),
    line: css("--line"),
    ink: css("--ink"),
  };
}

export function makeChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === "undefined") return;
  const p = palette();
  Chart.defaults.color = p.muted;
  Chart.defaults.borderColor = p.line;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  config.options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    ...config.options,
    plugins: { legend: { position: "bottom", labels: { boxWidth: 12, usePointStyle: true } }, ...config.options?.plugins },
  };
  charts.push(new Chart(canvas, config));
}

export function euroTick(value) {
  const n = Number(value);
  if (n >= 1000) return `${Math.round(n / 1000)}k €`;
  return `${n} €`;
}
