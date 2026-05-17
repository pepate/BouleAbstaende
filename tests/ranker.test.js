import { test, assertEqual } from './harness.js';
import { rank } from '../modules/ranker.js';

test('rank: empty input returns empty array', () => {
  assertEqual(rank([], 100, 100), []);
});

test('rank: single ball gets rank 1 and percent 100', () => {
  const r = rank([{ x: 50, y: 50, r: 10 }], 100, 100);
  assertEqual(r.length, 1);
  assertEqual(r[0].rank, 1);
  assertEqual(r[0].percent, 100);
});

test('rank: three balls sorted by distance ascending', () => {
  const balls = [
    { x: 200, y: 100, r: 10 },  // dist 100
    { x: 150, y: 100, r: 10 },  // dist 50
    { x: 300, y: 100, r: 10 },  // dist 200
  ];
  const r = rank(balls, 100, 100);
  assertEqual(r.map(b => b.rank), [1, 2, 3]);
  assertEqual(r.map(b => b.x), [150, 200, 300]);
});

test('rank: percent computed relative to nearest', () => {
  const balls = [
    { x: 200, y: 100, r: 10 },  // dist 100
    { x: 150, y: 100, r: 10 },  // dist 50
  ];
  const r = rank(balls, 100, 100);
  assertEqual(r[0].percent, 100);
  assertEqual(r[1].percent, 200);
});

test('rank: ball at exactly center does not divide by zero', () => {
  const r = rank([{ x: 100, y: 100, r: 10 }], 100, 100);
  assertEqual(r[0].percent, 100);
});

test('rank: preserves r property', () => {
  const r = rank([{ x: 50, y: 50, r: 17 }], 100, 100);
  assertEqual(r[0].r, 17);
});
