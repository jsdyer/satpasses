import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { direction, inEarthShadow, observerAt, predict } from '../dist/orbits.mjs';
const snapshot = JSON.parse(readFileSync(new URL('../dist/elements.json', import.meta.url)));

test('compass headings wrap at north', () => {
  assert.equal(direction(360), 'N');
  assert.equal(direction(-90), 'W');
  assert.equal(direction(45), 'NE');
});

test('Earth shadow blocks a night-side object on the Sun axis', () => {
  const sun = [149597870.7, 0, 0];
  assert.equal(inEarthShadow({x:-6800, y:0, z:0}, sun), true);
  assert.equal(inEarthShadow({x:6800, y:0, z:0}, sun), false);
  assert.equal(inEarthShadow({x:-6800, y:6500, z:0}, sun), false);
});

test('live-format ISS elements produce sorted geometric pass windows near epoch', () => {
  const iss = snapshot.objects.find(entry => entry.omm.NORAD_CAT_ID === 25544);
  const start = Date.parse(iss.omm.EPOCH);
  const passes = predict(iss.omm, observerAt(49.2827, -123.1207, 0), start, start + 72 * 3600 * 1000, 10);
  assert.ok(passes.length > 3);
  assert.ok(passes.every(pass => pass.end > pass.start && pass.peak.elevation >= 10));
  assert.ok(passes.every((pass, index) => !index || passes[index - 1].end <= pass.start));
  assert.ok(passes.every(pass => pass.windows.every(window => window.start >= pass.start && window.end <= pass.end)));
});
