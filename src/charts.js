/**
 * Minimal dependency-free SVG charting.
 *
 * Every chart mounts once and returns an `update(spec)` function; it re-renders
 * on container resize. No external libraries are used, because the whole point
 * of this page is that it works offline.
 */

export const COLORS = {
  ink: '#0d2420',
  muted: '#5b6b66',
  faint: '#9aa8a3',
  grid: '#e4eae6',
  axis: '#c8d2cd',
  m2: '#0f766e',
  m3: '#7c8f95',
  base: '#b45309',
  credit: '#1d4ed8',
  rates: '#7c3aed',
  deposit: '#0e7490',
  positive: '#0f766e',
  negative: '#b91c1c',
  total: '#0d2420',
  layers: ['#0f766e', '#38a169', '#b45309', '#7c3aed', '#0e7490', '#9aa8a3'],
  // Loan book, by borrower. Housing is drawn first because it dominates the stack.
  lending: ['#1d4ed8', '#7c3aed', '#0e7490'],
};

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  return node;
}

/**
 * Round values to a fixed number of significant digits rather than decimal
 * places, so ticks do not collapse to zero for very small magnitudes.
 */
function tidy(v) {
  return Number(v.toPrecision(12));
}

export function niceTicks(min, max, count = 5) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const LADDER = [1, 2, 5, 10];
  let index = LADDER.findIndex((v) => norm <= v);
  if (index < 0) index = LADDER.length - 1;

  const ticksFor = (i) => {
    const step = LADDER[i] * mag;
    // A degenerate step would spin forever; no ticks rather than an infinite loop.
    if (!(step > 0) || !Number.isFinite(step)) return null;
    const start = Math.ceil(min / step - 1e-9) * step;
    const ticks = [];
    for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(tidy(v));
    return ticks;
  };

  // Two gridlines leave a series floating with nothing to read it against, so step
  // down the ladder until the axis has at least three, without crowding it. The
  // ceiling allows a little more than the caller asked for: a step of 5 over a
  // span of 13 is either 2 lines or 7, and 7 is the readable one.
  let ticks = ticksFor(index);
  while (index > 0 && (!ticks || ticks.length < 3)) {
    const finer = ticksFor(index - 1);
    if (finer && finer.length > count + 3) break;
    index -= 1;
    ticks = finer ?? ticks;
  }
  return ticks ?? [tidy(min), tidy(max)];
}

export function extent(series) {
  let min = Infinity;
  let max = -Infinity;
  for (const s of series) {
    for (const [, y] of s.points) {
      if (!Number.isFinite(y)) continue;
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  if (!Number.isFinite(min)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  return [min, max];
}

export function xTickLabels(months, count) {
  const step = Math.max(1, Math.ceil(months / Math.max(1, count)));
  const out = [];
  for (let m = 0; m <= months; m += step) out.push(m);
  if (out[out.length - 1] !== months) out.push(months);
  return out;
}

function mountContainer(container) {
  if (!container) {
    throw new Error('chart mount point is missing from the page — stale markup or a cached script');
  }
  container.innerHTML = '';
  container.classList.add('chart');
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  container.append(legend, tip);
  return { tip, legend };
}

function paintLegend(legend, items) {
  legend.innerHTML = items
    .map(
      (item) =>
        `<span class="legend-item${item.dashed ? ' is-dashed' : ''}"><i style="background:${item.color}"></i>${item.name}</span>`,
    )
    .join('');
}

export function linePath(points, x, y) {
  let d = '';
  let started = false;
  for (const [px, py] of points) {
    if (!Number.isFinite(py)) {
      started = false;
      continue;
    }
    d += `${started ? 'L' : 'M'}${x(px).toFixed(2)},${y(py).toFixed(2)}`;
    started = true;
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Line chart                                                          */
/* ------------------------------------------------------------------ */

export function lineChart(container, spec) {
  const { tip, legend } = mountContainer(container);
  let current = spec;
  let observer;

  function render() {
    const s = current;
    const width = Math.max(260, container.clientWidth);
    const height = s.height ?? 220;
    const spark = s.sparkline === true;
    const margin = spark
      ? { top: 4, right: 4, bottom: 4, left: 4 }
      : { top: 12, right: 14, bottom: 26, left: 46 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    container.querySelector('svg')?.remove();
    const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
    root.setAttribute('aria-label', s.title ?? 'chart');

    const allPoints = s.series.flatMap((x) => x.points);
    const xMax = Math.max(1, ...allPoints.map((p) => p[0]));
    let [yMin, yMax] = s.yDomain ?? extent(s.series);
    if (s.includeZero) yMin = Math.min(0, yMin);
    // Leave roughly the same headroom under the lowest series as above the
    // highest, so a flat line never sits on the axis.
    const pad = (yMax - yMin) * 0.08 || 1;
    yMin -= pad * 0.8;
    yMax += pad;

    const X = (v) => margin.left + (v / xMax) * innerW;
    const Y = (v) => margin.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

    if (!spark) {
      for (const t of niceTicks(yMin, yMax, 4)) {
        const yy = Y(t);
        root.appendChild(
          svg('line', { x1: margin.left, x2: margin.left + innerW, y1: yy, y2: yy, stroke: COLORS.grid }),
        );
        const label = svg('text', {
          x: margin.left - 7,
          y: yy + 3.5,
          'text-anchor': 'end',
          class: 'chart-axis-label',
        });
        label.textContent = (s.yFormat ?? String)(t);
        root.appendChild(label);
      }
      const ticks = s.xTicks ?? xTickLabels(xMax, Math.max(2, Math.floor(innerW / 78)));
      for (const t of ticks) {
        const label = svg('text', {
          x: X(t),
          y: margin.top + innerH + 16,
          'text-anchor': 'middle',
          class: 'chart-axis-label',
        });
        label.textContent = (s.xFormat ?? String)(t);
        root.appendChild(label);
      }
      root.appendChild(
        svg('line', {
          x1: margin.left,
          x2: margin.left + innerW,
          y1: margin.top + innerH,
          y2: margin.top + innerH,
          stroke: COLORS.axis,
        }),
      );
    }

    if (s.annotateZero && yMin < 0 && yMax > 0) {
      root.appendChild(
        svg('line', {
          x1: margin.left,
          x2: margin.left + innerW,
          y1: Y(0),
          y2: Y(0),
          stroke: COLORS.axis,
          'stroke-dasharray': '3 3',
        }),
      );
    }

    for (const series of s.series) {
      if (series.area) {
        const d = `${linePath(series.points, X, Y)}L${X(series.points.at(-1)[0]).toFixed(2)},${Y(yMin).toFixed(2)}L${X(series.points[0][0]).toFixed(2)},${Y(yMin).toFixed(2)}Z`;
        root.appendChild(svg('path', { d, fill: series.color, opacity: 0.1 }));
      }
      root.appendChild(
        svg('path', {
          d: linePath(series.points, X, Y),
          fill: 'none',
          stroke: series.color,
          'stroke-width': series.width ?? 2,
          'stroke-dasharray': series.dashed ? '5 4' : undefined,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        }),
      );
    }

    const hover = svg('line', {
      y1: margin.top,
      y2: margin.top + innerH,
      stroke: COLORS.ink,
      'stroke-width': 1,
      opacity: 0,
      'pointer-events': 'none',
    });
    const dots = s.series.map((series) =>
      svg('circle', { r: 3.5, fill: '#fff', stroke: series.color, 'stroke-width': 2, opacity: 0 }),
    );
    root.appendChild(hover);
    for (const d of dots) root.appendChild(d);

    const overlay = svg('rect', {
      x: margin.left,
      y: margin.top,
      width: innerW,
      height: innerH,
      fill: 'transparent',
    });
    root.appendChild(overlay);

    const xValues = [...new Set(allPoints.map((p) => p[0]))].sort((a, b) => a - b);
    overlay.addEventListener('pointermove', (ev) => {
      const rect = root.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * width;
      const target = ((px - margin.left) / innerW) * xMax;
      let nearest = xValues[0];
      for (const v of xValues) if (Math.abs(v - target) < Math.abs(nearest - target)) nearest = v;
      hover.setAttribute('x1', X(nearest));
      hover.setAttribute('x2', X(nearest));
      hover.setAttribute('opacity', 0.25);
      const rows = [];
      s.series.forEach((series, i) => {
        const pt = series.points.find((p) => p[0] === nearest);
        if (!pt || !Number.isFinite(pt[1])) {
          dots[i].setAttribute('opacity', 0);
          return;
        }
        dots[i].setAttribute('cx', X(nearest));
        dots[i].setAttribute('cy', Y(pt[1]));
        dots[i].setAttribute('opacity', 1);
        rows.push(
          `<span class="tip-row"><i style="background:${series.color}"></i>${series.name}<b>${(s.yFormat ?? String)(pt[1])}</b></span>`,
        );
      });
      tip.innerHTML = `<span class="tip-head">${(s.xFormat ?? String)(nearest)}</span>${rows.join('')}`;
      tip.hidden = false;
      const flip = X(nearest) > width * 0.6;
      tip.style.left = `${X(nearest)}px`;
      tip.style.transform = flip ? 'translate(-108%, 0)' : 'translate(8px, 0)';
      tip.style.top = `${margin.top}px`;
    });
    overlay.addEventListener('pointerleave', () => {
      tip.hidden = true;
      hover.setAttribute('opacity', 0);
      for (const d of dots) d.setAttribute('opacity', 0);
    });

    root.appendChild(hover);
    for (const d of dots) root.appendChild(d);
    paintLegend(
      legend,
      s.series.map((series) => ({ name: series.name, color: series.color, dashed: series.dashed })),
    );
    container.insertBefore(root, tip);
  }

  function update(next) {
    current = next;
    render();
  }

  observer = new ResizeObserver(() => render());
  observer.observe(container);
  render();

  return { update, destroy: () => observer.disconnect() };
}

/* ------------------------------------------------------------------ */
/* Stacked area                                                        */
/* ------------------------------------------------------------------ */

export function stackedArea(container, spec) {
  const { tip, legend } = mountContainer(container);
  let current = spec;
  const observer = new ResizeObserver(() => render());

  function render() {
    const s = current;
    const width = Math.max(260, container.clientWidth);
    const height = s.height ?? 200;
    const margin = { top: 12, right: 14, bottom: 26, left: 46 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    container.querySelector('svg')?.remove();
    const root = svg('svg', { width, height, role: 'img' });
    root.setAttribute('aria-label', s.title ?? 'stacked area chart');

    const xs = s.layers[0]?.points.map((p) => p[0]) ?? [0, 1];
    const xMax = Math.max(1, ...xs);
    const totals = xs.map((_, i) => s.layers.reduce((a, l) => a + Math.max(0, l.points[i]?.[1] ?? 0), 0));
    const yMax = Math.max(1, ...totals) * 1.05;

    const X = (v) => margin.left + (v / xMax) * innerW;
    const Y = (v) => margin.top + innerH - (v / yMax) * innerH;

    for (const t of niceTicks(0, yMax, 4)) {
      const yy = Y(t);
      root.appendChild(svg('line', { x1: margin.left, x2: margin.left + innerW, y1: yy, y2: yy, stroke: COLORS.grid }));
      const label = svg('text', { x: margin.left - 7, y: yy + 3.5, 'text-anchor': 'end', class: 'chart-axis-label' });
      label.textContent = (s.yFormat ?? String)(t);
      root.appendChild(label);
    }
    for (const t of xTickLabels(xMax, Math.max(2, Math.floor(innerW / 78)))) {
      const label = svg('text', {
        x: X(t),
        y: margin.top + innerH + 16,
        'text-anchor': 'middle',
        class: 'chart-axis-label',
      });
      label.textContent = (s.xFormat ?? String)(t);
      root.appendChild(label);
    }

    let cumulative = xs.map(() => 0);
    s.layers.forEach((layer, li) => {
      const upper = xs.map((_, i) => cumulative[i] + Math.max(0, layer.points[i]?.[1] ?? 0));
      const top = upper.map((v, i) => `${X(xs[i]).toFixed(2)},${Y(v).toFixed(2)}`);
      const bottom = cumulative
        .map((v, i) => `${X(xs[i]).toFixed(2)},${Y(v).toFixed(2)}`)
        .reverse();
      root.appendChild(
        svg('path', {
          d: `M${top.join('L')}L${bottom.join('L')}Z`,
          fill: layer.color ?? COLORS.layers[li % COLORS.layers.length],
          opacity: 0.85,
        }),
      );
      cumulative = upper;
    });

    const overlay = svg('rect', {
      x: margin.left,
      y: margin.top,
      width: innerW,
      height: innerH,
      fill: 'transparent',
    });
    overlay.addEventListener('pointermove', (ev) => {
      const rect = root.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * width;
      const index = Math.round(((px - margin.left) / innerW) * (xs.length - 1));
      const i = Math.min(xs.length - 1, Math.max(0, index));
      const rows = s.layers.map(
        (l, li) =>
          `<span class="tip-row"><i style="background:${l.color ?? COLORS.layers[li % COLORS.layers.length]}"></i>${l.name}<b>${(s.yFormat ?? String)(l.points[i][1])}</b></span>`,
      );
      tip.innerHTML = `<span class="tip-head">${(s.xFormat ?? String)(xs[i])}</span>${rows.join('')}`;
      tip.hidden = false;
      tip.style.left = `${X(xs[i])}px`;
      tip.style.transform = X(xs[i]) > width * 0.6 ? 'translate(-108%, 0)' : 'translate(8px, 0)';
      tip.style.top = `${margin.top}px`;
    });
    overlay.addEventListener('pointerleave', () => {
      tip.hidden = true;
    });
    root.appendChild(overlay);
    paintLegend(
      legend,
      s.layers.map((l, li) => ({ name: l.name, color: l.color ?? COLORS.layers[li % COLORS.layers.length] })),
    );
    container.insertBefore(root, tip);
  }

  render();
  return {
    update(next) {
      current = next;
      render();
    },
    destroy: () => observer.disconnect(),
  };
}

/* ------------------------------------------------------------------ */
/* Waterfall                                                           */
/* ------------------------------------------------------------------ */

/**
 * items: [{ label, value, kind: 'add' | 'subtract' | 'total' }]
 */
export function waterfall(container, spec) {
  const { tip, legend } = mountContainer(container);
  let current = spec;

  function render() {
    const s = current;
    const width = Math.max(260, container.clientWidth);
    const height = s.height ?? 210;
    const margin = { top: 16, right: 10, bottom: 42, left: 46 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    container.querySelector('svg')?.remove();
    const root = svg('svg', { width, height, role: 'img' });
    root.setAttribute('aria-label', s.title ?? 'waterfall chart');

    const items = s.items;
    let running = 0;
    const bars = items.map((item) => {
      if (item.kind === 'total') {
        return { ...item, from: 0, to: item.value };
      }
      const from = running;
      running += item.value;
      return { ...item, from, to: running };
    });

    const maxV = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to)));
    const minV = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
    const pad = (maxV - minV) * 0.12;
    const Y = (v) => margin.top + innerH - ((v - minV) / (maxV + pad - minV)) * innerH;

    for (const t of niceTicks(minV, maxV, 4)) {
      const yy = Y(t);
      root.appendChild(svg('line', { x1: margin.left, x2: margin.left + innerW, y1: yy, y2: yy, stroke: COLORS.grid }));
      const label = svg('text', { x: margin.left - 7, y: yy + 3.5, 'text-anchor': 'end', class: 'chart-axis-label' });
      label.textContent = (s.yAxisFormat ?? ((v) => v.toFixed(0)))(t);
      root.appendChild(label);
    }

    const slot = innerW / bars.length;
    const barW = Math.min(58, slot * 0.62);

    bars.forEach((bar, i) => {
      const cx = margin.left + slot * (i + 0.5);
      const top = Y(Math.max(bar.from, bar.to));
      const bottom = Y(Math.min(bar.from, bar.to));
      const color =
        bar.kind === 'total' ? COLORS.total : bar.value >= 0 ? COLORS.positive : COLORS.negative;
      const rect = svg('rect', {
        x: cx - barW / 2,
        y: top,
        width: barW,
        height: Math.max(1.5, bottom - top),
        fill: color,
        rx: 2,
        opacity: bar.kind === 'total' ? 0.95 : 0.82,
      });
      rect.addEventListener('pointerenter', () => {
        tip.innerHTML = `<span class="tip-head">${bar.label}</span><span class="tip-row"><i style="background:${color}"></i>${bar.kind === 'total' ? 'Total' : 'Contribution'}<b>${(s.yFormat ?? String)(bar.value)}</b></span>`;
        tip.hidden = false;
        tip.style.left = `${cx}px`;
        tip.style.transform = cx > width * 0.6 ? 'translate(-108%, 0)' : 'translate(8px, 0)';
        tip.style.top = `${Math.max(0, top - 8)}px`;
      });
      rect.addEventListener('pointerleave', () => {
        tip.hidden = true;
      });
      root.appendChild(rect);

      if (i < bars.length - 1 && bars[i + 1].kind !== 'total') {
        root.appendChild(
          svg('line', {
            x1: cx + barW / 2,
            x2: margin.left + slot * (i + 1.5) - barW / 2,
            y1: Y(bar.to),
            y2: Y(bar.to),
            stroke: COLORS.axis,
            'stroke-dasharray': '2 3',
          }),
        );
      }

      const words = bar.label.split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).trim().length > 13) {
          lines.push(line.trim());
          line = w;
        } else {
          line = `${line} ${w}`;
        }
      }
      if (line.trim()) lines.push(line.trim());
      lines.slice(0, 3).forEach((text, li) => {
        const label = svg('text', {
          x: cx,
          y: margin.top + innerH + 13 + li * 10,
          'text-anchor': 'middle',
          class: 'chart-axis-label',
        });
        label.textContent = text;
        root.appendChild(label);
      });
    });

    legend.innerHTML = '';
    container.insertBefore(root, tip);
  }

  render();
  return { update(next) { current = next; render(); } };
}
