import { test, assertClose } from './harness.js';
import { computeTilt } from '../modules/level.js';

test('computeTilt: flat (beta=0, gamma=0) gives tilt 0', () => {
  const t = computeTilt({ beta: 0, gamma: 0 });
  assertClose(t.tilt, 0, 0.001);
});

test('computeTilt: 10° forward tilt gives tilt 10', () => {
  const t = computeTilt({ beta: 10, gamma: 0 });
  assertClose(t.tilt, 10, 0.001);
});

test('computeTilt: combined beta and gamma uses hypot', () => {
  const t = computeTilt({ beta: 3, gamma: 4 });
  assertClose(t.tilt, 5, 0.001);
});

test('computeTilt: missing fields default to 0', () => {
  const t = computeTilt({});
  assertClose(t.tilt, 0, 0.001);
});
