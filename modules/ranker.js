export function rank(balls, cx, cy) {
  if (balls.length === 0) return [];

  const withDist = balls.map(b => ({
    x: b.x,
    y: b.y,
    r: b.r,
    distance: Math.hypot(b.x - cx, b.y - cy),
  }));

  withDist.sort((a, b) => a.distance - b.distance);

  const nearest = withDist[0].distance;
  return withDist.map((b, i) => ({
    x: b.x,
    y: b.y,
    r: b.r,
    rank: i + 1,
    percent: nearest > 0 ? Math.round((b.distance / nearest) * 100) : 100,
  }));
}
