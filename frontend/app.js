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

const routes = [];   // { id, name, data, visible, color, offsetKm, offsetSlider, offsetLabel }
let chart       = null;
let distUnit    = 'km'; // 'km' | 'miles'
let eleUnit     = 'm';  // 'm' | 'ft'
let routeSeq    = 0;    // incrementing id for slider label association

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
  updateAllSliderUnits();
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

// ── Map Thumbnail ─────────────────────────────────────────────────────────

function buildThumbnailSVG(points, color) {
  const W = 248, H = 80, PAD = 8;
  const drawW = W - 2 * PAD;
  const drawH = H - 2 * PAD;

  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  const latRange = maxLat - minLat;
  const lonRange = maxLon - minLon;

  const ptStr = points.map(p => {
    const x = lonRange === 0 ? W / 2 : PAD + ((p.lon - minLon) / lonRange) * drawW;
    const y = latRange === 0 ? H / 2 : PAD + ((maxLat - p.lat) / latRange) * drawH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('class', 'route-item__thumbnail');
  svg.setAttribute('aria-hidden', 'true');

  const polyline = document.createElementNS(NS, 'polyline');
  polyline.setAttribute('points', ptStr);
  polyline.setAttribute('stroke', color);
  polyline.setAttribute('stroke-width', '1.5');
  polyline.setAttribute('stroke-linecap', 'round');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('fill', 'none');

  svg.appendChild(polyline);
  return svg;
}

// ── Route Management ──────────────────────────────────────────────────────

function addRoute(data) {
  const routeId = `route-${++routeSeq}`;
  const route = {
    id:       Symbol(),
    name:     data.name,
    data,
    visible:  true,
    color:    COLORS[routes.length % COLORS.length],
    offsetKm: 0,
  };
  routes.push(route);

  emptyState.style.display = 'none';

  const li = document.createElement('li');
  li.className = 'route-item';
  li.setAttribute('role', 'listitem');

  // ── Header row: checkbox + color dot + name ──────────────────────────────
  const header = document.createElement('div');
  header.className = 'route-item__header';

  const checkbox = document.createElement('input');
  checkbox.type      = 'checkbox';
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

  header.append(checkbox, dot, name);

  // ── Offset row: label + slider + value ───────────────────────────────────
  const offsetRow = document.createElement('div');
  offsetRow.className = 'route-item__offset';

  const offsetLabelEl = document.createElement('label');
  offsetLabelEl.className   = 'route-item__offset-label';
  offsetLabelEl.textContent = 'Offset';
  offsetLabelEl.setAttribute('for', `${routeId}-offset`);

  const slider = document.createElement('input');
  slider.type      = 'range';
  slider.id        = `${routeId}-offset`;
  slider.className = 'route-item__offset-slider';
  slider.min       = '0';
  slider.max       = '0'; // set correctly by updateAllSliderMaxes() below
  slider.step      = '0.1';
  slider.value     = '0';
  slider.setAttribute('aria-label', `X-axis offset for ${data.name}`);

  const offsetValue = document.createElement('span');
  offsetValue.className   = 'route-item__offset-value';
  offsetValue.textContent = formatOffset(0);

  slider.addEventListener('input', () => {
    const displayVal  = parseFloat(slider.value);
    route.offsetKm    = distUnit === 'miles' ? displayVal / KM_TO_MILES : displayVal;
    offsetValue.textContent = formatOffset(route.offsetKm);
    renderChart();
  });

  route.offsetSlider = slider;
  route.offsetLabel  = offsetValue;

  offsetRow.append(offsetLabelEl, slider, offsetValue);
  li.append(header, buildThumbnailSVG(data.points, route.color), offsetRow);
  routeList.appendChild(li);

  routeCount.textContent = routes.length;
  updateAllSliderMaxes();
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

function convertPoint(p, offsetKm = 0) {
  const distKm = p.distance + offsetKm;
  return {
    x: distUnit === 'miles' ? +(distKm * KM_TO_MILES).toFixed(3) : distKm,
    y: eleUnit  === 'ft'    ? +(p.elevation * M_TO_FT).toFixed(1) : p.elevation,
  };
}

function formatOffset(offsetKm) {
  return distUnit === 'miles'
    ? `+${(offsetKm * KM_TO_MILES).toFixed(1)} mi`
    : `+${offsetKm.toFixed(1)} km`;
}

function getMaxRouteDistanceKm() {
  if (!routes.length) return 0;
  return Math.max(...routes.map(r => {
    const pts = r.data.points;
    return pts.length ? pts[pts.length - 1].distance : 0;
  }));
}

function updateAllSliderMaxes() {
  const maxKm = getMaxRouteDistanceKm();
  const maxDisplay = distUnit === 'miles' ? +(maxKm * KM_TO_MILES).toFixed(1) : +maxKm.toFixed(1);
  routes.forEach(r => { if (r.offsetSlider) r.offsetSlider.max = maxDisplay; });
}

function updateAllSliderUnits() {
  const maxKm = getMaxRouteDistanceKm();
  const maxDisplay = distUnit === 'miles' ? +(maxKm * KM_TO_MILES).toFixed(1) : +maxKm.toFixed(1);
  routes.forEach(r => {
    if (!r.offsetSlider) return;
    r.offsetSlider.max   = maxDisplay;
    r.offsetSlider.value = distUnit === 'miles'
      ? +(r.offsetKm * KM_TO_MILES).toFixed(1)
      : +r.offsetKm.toFixed(1);
    r.offsetLabel.textContent = formatOffset(r.offsetKm);
  });
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
    data:            r.data.points.map(p => convertPoint(p, r.offsetKm)),
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
