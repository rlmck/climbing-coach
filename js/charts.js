/* ═══════════════════════════════════════════════════════════════
   charts.js — hand-rolled SVG. Two series maximum anywhere here,
   and the grip pair (spruce / ember) sits in the CVD floor band,
   so it always ships secondary encoding: solid vs dashed stroke,
   round vs square markers, and direct labels at the line ends.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, motion } = CT.ui, dt = CT.dt;
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (t, a) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); return n; };

  const nice = (min, max) => {
    const span = max - min || 1;
    const step = Math.pow(10, Math.floor(Math.log10(span / 3)));
    const s = [1, 2, 2.5, 5, 10].map(m => m * step).find(m => span / m <= 4) || step * 10;
    return { lo: Math.floor(min / s) * s, hi: Math.ceil(max / s) * s, step: s };
  };

  /* ── time-series line chart ─────────────────────────────── */
  function line(host, cfg) {
    const o = Object.assign({ height: 190, decimals: 1, unit: '', pad: 0.12, directLabel: true }, cfg);
    const draw = () => {
      const W = Math.max(320, host.clientWidth || 640), H = o.height;
      const m = { t: 14, r: o.directLabel ? 62 : 16, b: 24, l: 38 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;

      const all = o.series.flatMap(s => s.points);
      const xs = all.map(p => dt.parse(p.x).getTime());
      const ys = all.map(p => p.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs);
      const span = (Math.max(...ys) - Math.min(...ys)) || 1;
      const { lo, hi, step } = nice(Math.min(...ys) - span * o.pad, Math.max(...ys) + span * o.pad);

      const X = t => m.l + (x1 === x0 ? iw / 2 : (t - x0) / (x1 - x0) * iw);
      const Y = v => m.t + ih - (v - lo) / (hi - lo) * ih;

      const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });

      /* recessive grid + y ticks */
      for (let v = lo; v <= hi + 1e-9; v += step) {
        svg.appendChild(svgEl('line', { class: 'grid-line', x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v) }));
        const t = svgEl('text', { class: 'axis-t', x: m.l - 8, y: Y(v) + 3.5, 'text-anchor': 'end' });
        t.textContent = (+v.toFixed(2)).toString();
        svg.appendChild(t);
      }
      /* x ticks — first, middle, last */
      const dates = [...new Set(o.series[0].points.map(p => p.x))];
      [dates[0], dates[Math.floor((dates.length - 1) / 2)], dates[dates.length - 1]].forEach((d, i) => {
        if (!d) return;
        const t = svgEl('text', { class: 'axis-t', x: X(dt.parse(d).getTime()), y: H - 6,
          'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle' });
        t.textContent = dt.mini(d);
        svg.appendChild(t);
      });

      /* series */
      const paths = [];
      o.series.forEach(s => {
        const pts = s.points.map(p => [X(dt.parse(p.x).getTime()), Y(p.y)]);
        const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
        const path = svgEl('path', { class: 'series', d, stroke: s.color });
        if (s.dash) path.setAttribute('stroke-dasharray', '5 4');
        svg.appendChild(path); paths.push(path);

        pts.forEach((p, i) => {
          const last = i === pts.length - 1;
          const node = s.marker === 'square'
            ? svgEl('rect', { class: 'dot', x: p[0] - (last ? 4.5 : 3.2), y: p[1] - (last ? 4.5 : 3.2),
                              width: last ? 9 : 6.4, height: last ? 9 : 6.4, rx: 1.5, fill: s.color })
            : svgEl('circle', { class: 'dot', cx: p[0], cy: p[1], r: last ? 4.5 : 3.2, fill: s.color });
          svg.appendChild(node);
        });

        if (o.directLabel) {
          const last = pts[pts.length - 1];
          const lv = svgEl('text', { class: 'lbl', x: last[0] + 10, y: last[1] - 1, fill: s.color });
          lv.textContent = s.points[s.points.length - 1].y.toFixed(o.decimals) + o.unit;
          svg.appendChild(lv);
          const ln = svgEl('text', { class: 'axis-t', x: last[0] + 10, y: last[1] + 11 });
          ln.textContent = s.name;
          svg.appendChild(ln);
        }
      });

      /* hover: crosshair + tooltip */
      const cross = svgEl('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, stroke: 'var(--ink-4)', 'stroke-width': 1, opacity: 0 });
      svg.appendChild(cross);
      const tip = el('div', { class: 'tip', style:
        'position:absolute;pointer-events:none;opacity:0;background:rgba(22,24,26,.94);color:#fff;' +
        'padding:8px 11px;border-radius:9px;font-size:12px;line-height:1.45;white-space:nowrap;' +
        'box-shadow:0 6px 22px rgba(16,18,20,.22);transform:translate(-50%,-115%);z-index:5' });

      svg.addEventListener('pointermove', ev => {
        const r = svg.getBoundingClientRect();
        const px = (ev.clientX - r.left) * (W / r.width);
        let best = null;
        dates.forEach(d => {
          const dx = Math.abs(X(dt.parse(d).getTime()) - px);
          if (!best || dx < best.dx) best = { d, dx };
        });
        if (!best) return;
        const bx = X(dt.parse(best.d).getTime());
        cross.setAttribute('x1', bx); cross.setAttribute('x2', bx); cross.setAttribute('opacity', .35);
        tip.innerHTML = `<b style="font-weight:600">${dt.short(best.d)}</b><br>` + o.series.map(s => {
          const p = s.points.find(pp => pp.x === best.d);
          return p ? `<span style="display:inline-block;width:7px;height:7px;border-radius:${s.marker==='square'?'1px':'50%'};background:${s.color};margin-right:6px"></span>` +
                     `<span style="color:rgba(255,255,255,.68)">${s.name}</span> ${p.y.toFixed(o.decimals)}${o.unit}` : '';
        }).filter(Boolean).join('<br>');
        tip.style.left = (bx / W * 100) + '%';
        tip.style.top = (m.t + ih * 0.35) + 'px';
        tip.style.opacity = 1;
      });
      svg.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); tip.style.opacity = 0; });

      host.style.position = 'relative';
      CT.ui.clear(host);
      host.appendChild(svg);
      host.appendChild(tip);
      paths.forEach((p, i) => motion.draw(p, i * 0.12));
    };

    mount(host, draw);
    return host;
  }

  /* wait for the host to have a width before the first draw, then track resizes */
  function mount(host, draw) {
    let tries = 0;
    (function first() {
      if (host.clientWidth || ++tries > 30) draw();
      else requestAnimationFrame(first);
    })();
    if (!window.ResizeObserver) return;
    let w = 0;
    new ResizeObserver(() => {
      if (Math.abs(host.clientWidth - w) > 12) { w = host.clientWidth; draw(); }
    }).observe(host);
  }

  /* ── critical-force decay curve (single series + asymptote) ── */
  function cfCurve(host, test) {
    const draw = () => {
      const W = Math.max(280, host.clientWidth || 460), H = 168;
      const m = { t: 14, r: 58, b: 24, l: 34 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const ys = test.curve;
      const { lo, hi, step } = nice(Math.min(test.cf, ...ys) * 0.9, Math.max(...ys) * 1.04);
      const X = i => m.l + i / (ys.length - 1) * iw;
      const Y = v => m.t + ih - (v - lo) / (hi - lo) * ih;

      const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });
      for (let v = lo; v <= hi + 1e-9; v += step) {
        svg.appendChild(svgEl('line', { class: 'grid-line', x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v) }));
        const t = svgEl('text', { class: 'axis-t', x: m.l - 7, y: Y(v) + 3.5, 'text-anchor': 'end' });
        t.textContent = (+v.toFixed(0)).toString(); svg.appendChild(t);
      }
      [1, 12, 24].forEach((r, i) => {
        const t = svgEl('text', { class: 'axis-t', x: X(r - 1), y: H - 6,
          'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle' });
        t.textContent = 'rep ' + r; svg.appendChild(t);
      });

      /* bars — mean force per repeater */
      ys.forEach((v, i) => {
        const w = Math.max(3, iw / ys.length - 3);
        svg.appendChild(svgEl('rect', {
          x: X(i) - w / 2, y: Y(v), width: w, height: Math.max(1, m.t + ih - Y(v)),
          rx: 2, fill: 'var(--surface-3)'
        }));
      });

      /* critical force asymptote */
      const cfY = Y(test.cf);
      svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: cfY, y2: cfY,
        stroke: 'var(--ember-mark)', 'stroke-width': 2, 'stroke-dasharray': '6 4', 'stroke-linecap': 'round' }));
      const lab = svgEl('text', { class: 'lbl', x: m.l + iw + 9, y: cfY + 4, fill: 'var(--ember-mark)' });
      lab.textContent = test.cf.toFixed(1) + ' kg'; svg.appendChild(lab);
      const sub = svgEl('text', { class: 'axis-t', x: m.l + iw + 9, y: cfY + 16 });
      sub.textContent = 'critical force'; svg.appendChild(sub);

      /* decay trace */
      const d = ys.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
      const path = svgEl('path', { class: 'series', d, stroke: 'var(--spruce-mark)' });
      svg.appendChild(path);

      CT.ui.clear(host); host.appendChild(svg);
      motion.draw(path);
    };
    mount(host, draw);
    return host;
  }

  /* ── sparkline for tiles ────────────────────────────────── */
  function spark(values, color, w, h) {
    w = w || 76; h = h || 26;
    const lo = Math.min(...values), hi = Math.max(...values), sp = (hi - lo) || 1;
    const d = values.map((v, i) =>
      (i ? 'L' : 'M') + (i / (values.length - 1) * w).toFixed(1) + ' ' + (h - (v - lo) / sp * (h - 4) - 2).toFixed(1)
    ).join(' ');
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h });
    svg.appendChild(svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.75,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return svg;
  }

  CT.charts = { line, cfCurve, spark };
})();
