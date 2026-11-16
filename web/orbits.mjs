import {
  degreesToRadians, ecfToLookAngles, eciToEcf, gstime, jday, json2satrec,
  propagate, radiansToDegrees, sunPos,
} from './vendor/satellite.mjs';

const AU = 149597870.7;
const EARTH = 6378.137;
const SUN = 695700;
const CIVIL_TWILIGHT = -6;

export function observerAt(lat, lon, altitude) {
  return { latitude: degreesToRadians(lat), longitude: degreesToRadians(lon), height: altitude / 1000 };
}

export function inEarthShadow(position, toSun) {
  const sunDistance = Math.hypot(...toSun);
  const direction = toSun.map(component => component / sunDistance);
  const behind = -(position.x * direction[0] + position.y * direction[1] + position.z * direction[2]);
  if (behind <= 0) return false;
  const radius = EARTH - behind * (SUN - EARTH) / sunDistance;
  return radius > 0 && Math.hypot(
    position.x + behind * direction[0],
    position.y + behind * direction[1],
    position.z + behind * direction[2],
  ) < radius;
}

function sampler(omm, observer) {
  const record = json2satrec(omm);
  return (time, withSun = false) => {
    const date = new Date(time);
    const state = propagate(record, date);
    if (!state?.position) return null;
    const sidereal = gstime(date);
    const look = ecfToLookAngles(observer, eciToEcf(state.position, sidereal));
    const result = { time, elevation: radiansToDegrees(look.elevation),
      azimuth: (radiansToDegrees(look.azimuth) + 360) % 360, range: look.rangeSat };
    if (!Number.isFinite(result.elevation)) return null;
    if (withSun) {
      const sun = sunPos(jday(date)).rsun.map(x => x * AU);
      const [x, y, z] = sun;
      const sunLook = ecfToLookAngles(observer, eciToEcf({ x, y, z }, sidereal));
      result.sunAltitude = radiansToDegrees(sunLook.elevation);
      result.sunlit = !inEarthShadow(state.position, sun);
      result.visible = result.sunlit && result.sunAltitude <= CIVIL_TWILIGHT;
    }
    return result;
  };
}

function crossing(at, lower, upper, cutoff, rising) {
  while (upper - lower > 1000) {
    const midpoint = (lower + upper) / 2;
    const above = (at(midpoint)?.elevation ?? -90) >= cutoff;
    if (above === rising) upper = midpoint;
    else lower = midpoint;
  }
  return Math.round((lower + upper) / 2);
}

function passDetails(at, start, end, threshold, clippedStart, clippedEnd) {
  const samples = [];
  const subdivisions = Math.max(1, Math.ceil((end - start) / 5000));
  for (let i = 0; i <= subdivisions; i++) {
    const point = at(Math.round(start + (end - start) * i / subdivisions), true);
    if (point) samples.push(point);
  }
  if (!samples.length) return null;
  const peak = samples.reduce((best, point) => point.elevation > best.elevation ? point : best);
  const windows = [];
  let open = null;
  for (const point of samples) {
    if (point.visible && point.elevation >= threshold - 0.1) {
      if (!open) open = { start: point.time, end: point.time, peak: point };
      open.end = point.time;
      if (point.elevation > open.peak.elevation) open.peak = point;
    } else if (open) {
      windows.push(open);
      open = null;
    }
  }
  if (open) windows.push(open);
  return { start, end, peak, rise: samples[0], set: samples.at(-1), samples, windows,
    visible: windows.some(window => window.end > window.start), clippedStart, clippedEnd };
}

export function predict(omm, observer, start, end, threshold) {
  const at = sampler(omm, observer);
  const passes = [];
  let previous = at(start);
  let opened = previous?.elevation >= threshold ? start : null;
  const startsInProgress = opened !== null;
  function finish(atEnd, clippedEnd) {
    const pass = passDetails(at, opened, atEnd, threshold, startsInProgress && opened === start, clippedEnd);
    if (pass) passes.push(pass);
    opened = null;
  }
  const step = 20000;
  for (let time = start + step; time < end + step; time += step) {
    const next = at(Math.min(time, end));
    if (!next) {
      opened = null;
      previous = null;
      continue;
    }
    const above = next.elevation >= threshold;
    if (above && opened === null) {
      opened = previous ? crossing(at, previous.time, next.time, threshold, true) : next.time;
    } else if (!above && opened !== null && previous) {
      finish(crossing(at, previous.time, next.time, threshold, false), false);
    }
    previous = next;
  }
  if (opened !== null && opened < end) finish(end, true);
  return passes;
}

export function direction(azimuth) {
  const compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return compass[Math.round(((azimuth % 360 + 360) % 360) / 22.5) % 16];
}
