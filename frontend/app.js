'use strict';

// ── Constants ─────────────────────────────────────────────────────────────

const COLORS = [
  '#e05252', '#4a9eff', '#52c47a', '#f5a623',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
  '#84cc16', '#14b8a6',
];

const KM_TO_MILES = 0.621371;
const M_TO_FT     = 3.28084;

// ── State ─────────────────────────────────────────────────────────────────

const routes = [];   // { id, name, data, visible, color }
let chart    = null;
let distUnit = 'km'; // 'km' | 'miles'
let eleUnit  = 'm';  // 'm' | 'ft'

// ── DOM References ────────────────────────────────────────────────────────

const uploadZone           = document.getElementById('uploadZone');
const fileInput            = document.getElementById('fileInput');
const routeList            = document.getElementById('routeList');
const emptyState           = document.getElementById('emptyState');
const routeCount           = document.getElementById('routeCount');
const chartEmpty           = document.getElementById('chartEmpty');
const chartCanvasContainer = document.getElementById('chartCanvasContainer');
const themeToggle          = document.getElementById('themeToggle');
const sunIcon              = document.getElementById('sunIcon');
const moonIcon             = document.getElementById('moonIcon');
const distanceToggle       = document.getElementById('distanceToggle');
const elevationToggle      = document.getElementById('elevationToggle');

// ── Theme ─────────────────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const isDark = theme === 'dark';
  sunIcon.style.display  = isDark ? 'none' : '';
  moonIcon.style.display = isDark ? '' : 'none';
  themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  if (chart) renderChart();
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ── Unit Toggles ──────────────────────────────────────────────────────────

distanceToggle.addEventListener('click', () => {
  distUnit = distUnit === 'km' ? 'miles' : 'km';
  distanceToggle.textContent = distUnit;
  distanceToggle.setAttribute('aria-label', `Switch to ${distUnit === 'km' ? 'miles' : 'km'}`);
  if (chart) renderChart();
});

elevationToggle.addEventListener('click', () => {
  eleUnit = eleUnit === 'm' ? 'ft' : 'm';
  elevationToggle.textContent = eleUnit;
  elevationToggle.setAttribute('aria-label', `Switch to ${eleUnit === 'm' ? 'ft' : 'm'}`);
  if (chart) renderChart();
});

// ── Upload ────────────────────────────────────────────────────────────────

uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('upload-zone--drag-over');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('upload-zone--drag-over');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('upload-zone--drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.gpx'));
  if (files.length) processFiles(files);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    processFiles(Array.from(fileInput.files));
    fileInput.value = '';
  }
});

async function processFiles(files) {
  for (const file of files) {
    await uploadFile(file);
  }
}

async function uploadFile(file) {
  uploadZone.classList.add('upload-zone--loading');
  try {
    const body = new FormData();
    body.append('file', file);
    const res  = await fetch('/upload', { method: 'POST', body });
    const data = await res.json();
    if (!res.ok) {
      alert(`Upload error: ${data.error || 'unknown error'}`);
      return;
    }
    addRoute(data);
  } catch {
    alert('Upload failed. Is the server running?');
  } finally {
    uploadZone.classList.remove('upload-zone--loading');
  }
}

// ── Route Management ──────────────────────────────────────────────────────

function addRoute(data) {
  const route = {
    id:      Symbol(),
    name:    data.name,
    data,
    visible: true,
    color:   COLORS[routes.length % COLORS.length],
  };
  routes.push(route);

  emptyState.style.display = 'none';

  const li       = document.createElement('li');
  li.className   = 'route-item';
  li.setAttribute('role', 'listitem');

  const checkbox = document.createElement('input');
  checkbox.type  = 'checkbox';
  checkbox.className = 'route-item__checkbox';
  checkbox.checked   = true;
  checkbox.setAttribute('aria-label', `Show ${data.name}`);
  checkbox.addEventListener('change', () => {
    route.visible = checkbox.checked;
    renderChart();
  });

  const dot = document.createElement('span');
  dot.className        = 'route-item__color';
  dot.style.background = route.color;
  dot.setAttribute('aria-hidden', 'true');

  const name = document.createElement('span');
  name.className   = 'route-item__name';
  name.textContent = data.name;
  name.title       = data.name;

  li.append(checkbox, dot, name);
  routeList.appendChild(li);

  routeCount.textContent = routes.length;
  renderChart();
}

// ── Chart ─────────────────────────────────────────────────────────────────

function chartThemeColors() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    grid:    dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
    tick:    dark ? '#7d8590' : '#64748b',
    legend:  dark ? '#e6edf3' : '#0f172a',
    tooltip: {
      bg:     dark ? '#1c2128' : '#ffffff',
      border: dark ? '#30363d' : '#e2e8f0',
      text:   dark ? '#e6edf3' : '#0f172a',
    },
  };
}

function convertPoint(p) {
  return {
    x: distUnit === 'miles' ? +(p.distance * KM_TO_MILES).toFixed(3) : p.distance,
    y: eleUnit  === 'ft'    ? +(p.elevation * M_TO_FT).toFixed(1)    : p.elevation,
  };
}

function renderChart() {
  const visible = routes.filter(r => r.visible);
  const colors  = chartThemeColors();

  if (visible.length === 0) {
    if (chart) { chart.destroy(); chart = null; }
    chartCanvasContainer.classList.remove('visible');
    chartEmpty.classList.remove('hidden');
    return;
  }

  chartEmpty.classList.add('hidden');
  chartCanvasContainer.classList.add('visible');

  const xLabel   = distUnit === 'km' ? 'Distance (km)' : 'Distance (miles)';
  const yLabel   = eleUnit  === 'm'  ? 'Elevation (m)' : 'Elevation (ft)';
  const datasets = visible.map(r => ({
    label:           r.name,
    data:            r.data.points.map(convertPoint),
    borderColor:     r.color,
    backgroundColor: r.color + '18',
    borderWidth:     2,
    pointRadius:     0,
    pointHitRadius:  12,
    pointHoverRadius: 4,
    tension:         0.3,
    fill:            false,
  }));

  if (chart) {
    chart.data.datasets                         = datasets;
    chart.options.scales.x.title.text           = xLabel;
    chart.options.scales.y.title.text           = yLabel;
    chart.options.scales.x.grid.color           = colors.grid;
    chart.options.scales.y.grid.color           = colors.grid;
    chart.options.scales.x.ticks.color          = colors.tick;
    chart.options.scales.y.ticks.color          = colors.tick;
    chart.options.scales.x.title.color          = colors.tick;
    chart.options.scales.y.title.color          = colors.tick;
    chart.options.plugins.legend.labels.color   = colors.legend;
    chart.options.plugins.tooltip.backgroundColor = colors.tooltip.bg;
    chart.options.plugins.tooltip.borderColor   = colors.tooltip.border;
    chart.options.plugins.tooltip.titleColor    = colors.tooltip.text;
    chart.options.plugins.tooltip.bodyColor     = colors.tooltip.text;
    chart.update('none');
    return;
  }

  const ctx = document.getElementById('elevationChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction: {
        mode:      'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display:  true,
          position: 'top',
          labels: {
            color:    colors.legend,
            font:     { family: 'Inter, system-ui, sans-serif', size: 12 },
            boxWidth: 14,
            padding:  16,
          },
        },
        tooltip: {
          backgroundColor: colors.tooltip.bg,
          borderColor:     colors.tooltip.border,
          borderWidth:     1,
          titleColor:      colors.tooltip.text,
          bodyColor:       colors.tooltip.text,
          padding:         10,
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              return `${items[0].parsed.x.toFixed(2)} ${distUnit}`;
            },
            label: (item) => {
              return `  ${item.dataset.label}: ${item.parsed.y.toFixed(1)} ${eleUnit}`;
            },
          },
        },
      },
      scales: {
        x: {
          type:  'linear',
          title: { display: true, text: xLabel, color: colors.tick, font: { size: 12 } },
          grid:  { color: colors.grid },
          ticks: { color: colors.tick, font: { size: 11 } },
        },
        y: {
          title: { display: true, text: yLabel, color: colors.tick, font: { size: 12 } },
          grid:  { color: colors.grid },
          ticks: { color: colors.tick, font: { size: 11 } },
          min:   0,
        },
      },
    },
  });
}

// ── Init ──────────────────────────────────────────────────────────────────

initTheme();
