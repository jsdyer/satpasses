import { direction, observerAt, predict } from './orbits.mjs';

const el = id => document.getElementById(id);
const presets = {
  vancouver: [49.2827, -123.1207, 'America/Vancouver'],
  langley: [49.1044, -122.6607, 'America/Vancouver'],
  victoria: [48.4284, -123.3656, 'America/Vancouver'],
  halifax: [44.6488, -63.5752, 'America/Halifax'],
  sydney: [46.1368, -60.1942, 'America/Halifax'],
};
const hours = 60 * 60 * 1000;
const degrees = number => Math.round(number) + '°';
const svgNS = 'http://www.w3.org/2000/svg';
let data;
let results = [];
let config;
let timeFormat;
let dateFormat;

function make(tag, value, className) {
  const item = document.createElement(tag);
  if (value !== undefined) item.textContent = value;
  if (className) item.className = className;
  return item;
}
function setStatus(message, style = '') {
  el('status').textContent = message;
  el('status').className = ['status', style].filter(Boolean).join(' ');
}
function clock(time) {
  return timeFormat.format(time);
}
function sky(point) {
  return direction(point.azimuth) + ' ' + degrees(point.azimuth);
}
function shownPasses() {
  return el('visible-only').checked ? results.filter(pass => pass.visible) : results;
}
function svg(tag, attributes) {
  const node = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}
function elevationPlot(pass) {
  const x = t => 42 + (t - pass.start) / Math.max(1, pass.end - pass.start) * 520;
  const y = elevation => 128 - elevation / 90 * 108;
  const chart = svg('svg', { viewBox: '0 0 580 155', class: 'profile', role: 'img',
    'aria-label': 'Elevation profile. Peak ' + degrees(pass.peak.elevation) + ' at ' + clock(pass.peak.time) + '.' });
  for (const elevation of [0, 30, 60, 90]) {
    const label = svg('text', { x: 7, y: y(elevation) + 4 });
    label.textContent = degrees(elevation);
    chart.append(svg('line', { x1: 42, x2: 562, y1: y(elevation), y2: y(elevation), class: 'grid' }), label);
  }
  for (const window of pass.windows) {
    chart.append(svg('rect', { x: x(window.start), y: 20, width: Math.max(1, x(window.end) - x(window.start)), height: 108, class: 'illuminated' }));
  }
  chart.append(
    svg('polyline', { points: pass.samples.map(point => x(point.time) + ',' + y(point.elevation)).join(' '), class: 'arc' }),
    svg('circle', { cx: x(pass.peak.time), cy: y(pass.peak.elevation), r: 4, class: 'peak' }),
  );
  return chart;
}

function passCard(pass) {
  const shell = make('details', undefined, 'pass');
  const summary = make('summary', undefined, 'pass-summary');
  const head = make('span', undefined, 'pass-when');
  head.append(make('strong', clock(pass.rise.time)), make('small', pass.clippedStart ? 'Already above threshold' : 'Start of pass'));
  const peak = make('span', undefined, 'pass-peak');
  peak.append(make('strong', degrees(pass.peak.elevation)), make('small', 'Peak elevation'));
  summary.append(head, peak, make('span', sky(pass.rise) + ' → ' + sky(pass.set), 'directions'),
    make('span', pass.visible ? 'Likely visible' : 'Daylight or shadow', pass.visible ? 'flag visible' : 'flag'));
  const view = make('div', undefined, 'pass-detail');
  view.append(elevationPlot(pass));
  const facts = make('dl', undefined, 'pass-facts');
  for (const [label, point] of [['Start', pass.rise], ['Highest point', pass.peak], ['End', pass.set]]) {
    const fact = make('div');
    fact.append(make('dt', label), make('dd', clock(point.time)),
      make('dd', sky(point) + ' · elevation ' + degrees(point.elevation) + ' · ' + Math.round(point.range).toLocaleString() + ' km'));
    facts.append(fact);
  }
  view.append(facts);
  if (pass.visible) {
    for (const window of pass.windows.filter(item => item.end > item.start)) {
      view.append(make('p', 'Likely visible ' + clock(window.start) + ' to ' + clock(window.end) +
        '. Highest visible point ' + degrees(window.peak.elevation) + ' toward ' + direction(window.peak.azimuth) + '.', 'fine'));
    }
  } else {
    view.append(make('p', 'No sustained interval meets the sunlight and twilight thresholds.', 'fine'));
  }
  if (pass.clippedEnd) view.append(make('p', 'The pass continues beyond the selected look-ahead period.', 'fine'));
  shell.append(summary, view);
  return shell;
}

function renderPasses() {
  const output = el('passes');
  output.replaceChildren();
  const view = shownPasses();
  el('download').disabled = view.length === 0;
  if (!view.length) {
    output.append(make('p', el('visible-only').checked && results.length
      ? 'No likely visible passes. Uncheck the filter to see every pass.'
      : 'No passes rise above this elevation in the selected period. Try a lower cutoff or a longer period.', 'empty'));
    return;
  }
  let previous;
  for (const pass of view) {
    const date = dateFormat.format(pass.start);
    if (date !== previous) output.append(make('h3', date, 'result-day'));
    previous = date;
    output.append(passCard(pass));
  }
}

function calendar(timeZone, options) {
  return new Intl.DateTimeFormat('en-CA', { ...options, ...(timeZone ? { timeZone } : {}) });
}

function calculate() {
  const target = data?.objects[Number(el('satellite').value)];
  if (!target || !el('planner').reportValidity()) return;
  const place = presets[el('place').value];
  const selectedZone = el('zone').value;
  const timezone = selectedZone === 'utc' ? 'UTC' : selectedZone === 'preset' ? place?.[2] : undefined;
  dateFormat = calendar(timezone, { weekday: 'long', month: 'long', day: 'numeric' });
  timeFormat = calendar(timezone, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const lat = Number(el('lat').value);
  const lon = Number(el('lon').value);
  const altitude = Number(el('altitude').value);
  const threshold = Number(el('min').value);
  const start = Date.now();
  const end = start + Number(el('window').value) * 24 * hours;
  config = { start, end, target, lat, lon, altitude, threshold };
  el('target-summary').textContent = target.name + ' · NORAD ' + target.omm.NORAD_CAT_ID;
  el('timezone-label').textContent = timeFormat.resolvedOptions().timeZone + ' · elevation ≥ ' + threshold + '°';
  const age = (start - Date.parse(target.omm.EPOCH)) / hours;
  if (age > 240 || age < -24) {
    results = [];
    el('filters').hidden = true;
    renderPasses();
    el('passes').replaceChildren();
    setStatus('The selected orbit epoch is too far from today for a useful forecast. Check the source or choose a different satellite.', 'warn');
    return;
  }
  results = predict(target.omm, observerAt(lat, lon, altitude), start, end, threshold);
  const visible = results.filter(pass => pass.visible).length;
  const message = results.length + (results.length === 1 ? ' pass' : ' passes') +
    ' found · ' + visible + ' likely visible.';
  const nearingStale = age > 72 || (start - Date.parse(data.retrieved)) / hours > 48;
  setStatus(message + (nearingStale ? ' The orbital data is aging. Times may drift.' : ''), nearingStale ? 'warn' : '');
  el('filters').hidden = false;
  renderPasses();
}

function exportPasses() {
  const header = ['satellite', 'norad_id', 'orbital_epoch_utc', 'latitude', 'longitude', 'minimum_elevation_deg',
    'start_utc', 'peak_utc', 'end_utc', 'peak_elevation_deg', 'start_azimuth_deg', 'end_azimuth_deg', 'likely_visible',
    'estimated_visible_windows_utc'];
  const iso = time => new Date(time).toISOString();
  const rows = shownPasses().map(pass => [config.target.name, config.target.omm.NORAD_CAT_ID,
    config.target.omm.EPOCH, config.lat, config.lon, config.threshold, iso(pass.start), iso(pass.peak.time), iso(pass.end),
    pass.peak.elevation.toFixed(2), pass.rise.azimuth.toFixed(2), pass.set.azimuth.toFixed(2), pass.visible,
    pass.windows.filter(window => window.end > window.start).map(window => iso(window.start) + '/' + iso(window.end)).join(' | ')]);
  const file = new Blob([[header, ...rows].map(row => row.join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(file);
  const link = make('a');
  link.href = href;
  link.download = 'satellite-passes-' + config.target.omm.NORAD_CAT_ID + '.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
}

el('place').addEventListener('change', () => {
  const preset = presets[el('place').value];
  if (!preset) return;
  el('lat').value = preset[0];
  el('lon').value = preset[1];
  el('altitude').value = 0;
  if (data) calculate();
});
for (const id of ['lat', 'lon']) el(id).addEventListener('input', () => { el('place').value = 'custom'; });
el('planner').addEventListener('submit', event => {
  event.preventDefault();
  calculate();
});
el('visible-only').addEventListener('change', renderPasses);
el('download').addEventListener('click', exportPasses);
for (const id of ['satellite', 'min', 'window', 'zone']) el(id).addEventListener('change', calculate);

try {
  const response = await fetch('./elements.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  data = await response.json();
  if (!data.objects?.length || !Number.isFinite(Date.parse(data.retrieved))) throw new Error('Invalid snapshot');
  const picker = el('satellite');
  picker.replaceChildren(...data.objects.map((target, index) => new Option(target.name + ' · ' + target.description, index)));
  picker.addEventListener('change', updateAge);
  updateAge();
  picker.disabled = false;
  el('calculate').disabled = false;
  calculate();
} catch {
  setStatus('Orbital data is unavailable. Reload to retry, or check the CelesTrak link below.', 'warn');
}

function updateAge() {
  const object = data.objects[Number(el('satellite').value)];
  const utc = calendar('UTC', { month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const age = Math.round(Math.max(0, (Date.now() - Date.parse(object.omm.EPOCH)) / hours));
  el('data-age').textContent = 'Orbit epoch ' + utc.format(Date.parse(object.omm.EPOCH)) + ' UTC (' + age +
    ' h ago) · snapshot ' + utc.format(Date.parse(data.retrieved)) + ' UTC';
}
