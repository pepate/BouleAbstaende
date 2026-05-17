const COLORS = {
  nearest: '#22c55e',
  other: '#e5e7eb',
  crosshair: 'rgba(255,255,255,0.95)',
  labelBg: 'rgba(0,0,0,0.65)',
};

export function render(ctx, rankedBalls, cx, cy) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);

  drawCrosshair(ctx, cx, cy);

  for (const ball of rankedBalls) {
    const isNearest = ball.rank === 1;
    const color = isNearest ? COLORS.nearest : COLORS.other;
    const lineWidth = isNearest ? 3 : 1.5;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ball.x, ball.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r + 2, 0, Math.PI * 2);
    ctx.stroke();

    const label = rankedBalls.length > 1
      ? `${ball.rank} · ${ball.percent}%`
      : `${ball.rank}`;
    drawLabel(ctx, label, ball.x + ball.r + 8, ball.y, color);
  }
}

function drawCrosshair(ctx, cx, cy) {
  const size = 18;
  ctx.save();
  ctx.strokeStyle = COLORS.crosshair;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(cx - size, cy);
  ctx.lineTo(cx + size, cy);
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx, cy + size);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLabel(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
  const metrics = ctx.measureText(text);
  const pad = 5;
  const lineHeight = 20;

  ctx.fillStyle = COLORS.labelBg;
  ctx.fillRect(x, y - lineHeight / 2, metrics.width + 2 * pad, lineHeight);

  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pad, y);
  ctx.restore();
}
