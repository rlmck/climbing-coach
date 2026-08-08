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
      /* x ticks — first, middle, last, and only as many of those as are
         actually different days. Two points make the middle the first
         one over again, and one point makes all three the same date:
         both used to stamp the same label on the same x twice, which
         reads as a smudge rather than as an axis. */
      const dates = [...new Set(o.series.flatMap(s => s.points.map(p => p.x)))].sort();
      const ticks = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])]
        .filter(i => dates[i]);
      ticks.forEach((idx, i) => {
        const d = dates[idx];
        const t = svgEl('text', { class: 'axis-t', x: X(dt.parse(d).getTime()), y: H - 6,
          'text-anchor': ticks.length === 1 ? 'middle'
                       : i === 0 ? 'start'
                       : i === ticks.length - 1 ? 'end' : 'middle' });
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

  /* ── hands, drawn the way grips are ─────────────────────────
     Same two validated marks as everywhere else, same secondary
     encoding: solid/round against dashed/square, so the pair never
     depends on colour alone. */
  const HAND = {
    right: { color: 'var(--spruce-mark)', marker: 'circle', dash: false, label: 'Right' },
    left:  { color: 'var(--ember-mark)',  marker: 'square', dash: true,  label: 'Left'  }
  };

  /* ── critical-force decay curve ─────────────────────────────
     One trace per hand across 24 repeaters, each with its own
     asymptote. Two things the device knows and a plain line chart
     would hide are drawn explicitly: reps it flagged as unreliable
     get hollow markers, and reps with no usable reading break the
     line rather than dropping it to the floor. The band over the
     closing reps is where the critical force was actually read. */
  function cfCurve(host, test) {
    const hands = CT.cf.hands(test);
    const draw = () => {
      const W = Math.max(280, host.clientWidth || 460), H = 236;
      const narrow = W < 430;
      const m = { t: 16, r: narrow ? 14 : 66, b: 26, l: 36 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;

      const n = Math.max(...hands.map(h => h.reps.length), 2);
      const live = hands.flatMap(h => h.reps.filter(r => r.avg > 0).map(r => r.avg));
      const cfs  = hands.map(h => h.cf);
      const { lo, hi, step } = nice(Math.min(...cfs, ...live) * 0.9, Math.max(...live) * 1.04);
      const X = i => m.l + i / (n - 1) * iw;
      const Y = v => m.t + ih - (v - lo) / (hi - lo) * ih;

      const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });

      /* the reps the critical force is averaged from */
      const win = hands[0] ? hands[0].window : [];
      if (win.length) {
        const a = X(Math.min(...win) - 1), b = X(Math.max(...win) - 1);
        svg.appendChild(svgEl('rect', { x: a - 5, y: m.t, width: (b - a) + 10, height: ih,
          fill: 'var(--surface-3)', opacity: .75, rx: 3 }));
        const t = svgEl('text', { class: 'axis-t', x: (a + b) / 2, y: m.t + 11, 'text-anchor': 'middle' });
        t.textContent = narrow ? 'CF' : 'critical force read here'; svg.appendChild(t);
      }

      for (let v = lo; v <= hi + 1e-9; v += step) {
        svg.appendChild(svgEl('line', { class: 'grid-line', x1: m.l, x2: m.l + iw, y1: Y(v), y2: Y(v) }));
        const t = svgEl('text', { class: 'axis-t', x: m.l - 7, y: Y(v) + 3.5, 'text-anchor': 'end' });
        t.textContent = (+v.toFixed(0)).toString(); svg.appendChild(t);
      }
      [1, 12, n].forEach((r, i) => {
        const t = svgEl('text', { class: 'axis-t', x: X(r - 1), y: H - 7,
          'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle' });
        t.textContent = 'rep ' + r; svg.appendChild(t);
      });

      const paths = [];
      hands.forEach(h => {
        const S = HAND[h.hand] || HAND.right;

        /* asymptote, drawn under the trace it belongs to */
        const cfY = Y(h.cf);
        svg.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: cfY, y2: cfY,
          stroke: S.color, 'stroke-width': 1.5, 'stroke-dasharray': '2 5',
          'stroke-linecap': 'round', opacity: .55 }));
        if (narrow) {
          const lab = svgEl('text', { class: 'lbl', x: m.l + 4, y: cfY - 5, fill: S.color });
          lab.textContent = S.label + ' ' + h.cf.toFixed(1) + ' kg'; svg.appendChild(lab);
        } else {
          const lab = svgEl('text', { class: 'lbl', x: m.l + iw + 9, y: cfY + 4, fill: S.color });
          lab.textContent = h.cf.toFixed(1) + ' kg'; svg.appendChild(lab);
          const sub = svgEl('text', { class: 'axis-t', x: m.l + iw + 9, y: cfY + 16 });
          sub.textContent = S.label.toLowerCase() + ' CF'; svg.appendChild(sub);
        }

        /* the trace, broken wherever a rep recorded nothing */
        let d = '', pen = false;
        h.reps.forEach((r, i) => {
          if (r.avg <= 0) { pen = false; return; }
          d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(r.avg).toFixed(1) + ' ';
          pen = true;
        });
        const path = svgEl('path', { class: 'series', d: d.trim(), stroke: S.color });
        if (S.dash) path.setAttribute('stroke-dasharray', '5 4');
        svg.appendChild(path); paths.push(path);

        /* markers — hollow wherever the device didn't trust the rep */
        h.reps.forEach((r, i) => {
          if (r.avg <= 0) return;
          const x = X(i), y = Y(r.avg), sz = 3.1;
          const fill = r.unreliable ? 'var(--surface)' : S.color;
          const node = S.marker === 'square'
            ? svgEl('rect', { class: 'dot', x: x - sz, y: y - sz, width: sz * 2, height: sz * 2, rx: 1, fill })
            : svgEl('circle', { class: 'dot', cx: x, cy: y, r: sz, fill });
          if (r.unreliable) { node.setAttribute('stroke', S.color); node.setAttribute('stroke-width', 1.4); }
          svg.appendChild(node);
        });

        /* a rep that recorded nothing is marked as absent, not as zero */
        h.reps.forEach((r, i) => {
          if (r.avg > 0) return;
          svg.appendChild(svgEl('line', { x1: X(i), x2: X(i), y1: m.t + 16, y2: m.t + ih,
            stroke: S.color, 'stroke-width': 1, 'stroke-dasharray': '1 4', opacity: .5 }));
        });
      });

      CT.ui.clear(host); host.appendChild(svg);
      paths.forEach((p, i) => motion.draw(p, i * 0.12));
    };
    mount(host, draw);
    return host;
  }

  /* ── training zones ─────────────────────────────────────────
     What the test is actually for. Both hands share one axis, so
     the gap between them is the first thing you see rather than
     something you work out from two numbers. */
  function cfZones(host, test) {
    const hands = CT.cf.hands(test);
    const draw = () => {
      const W = Math.max(280, host.clientWidth || 460);
      const narrow = W < 430;
      const rowH = 52, H = hands.length * rowH + 34;
      const m = { t: 8, r: narrow ? 14 : 62, b: 26, l: narrow ? 34 : 44 };
      const iw = W - m.l - m.r;

      const top = Math.max(...hands.map(h => h.cf)) * 1.28;
      const X = v => m.l + Math.max(0, Math.min(1, v / top)) * iw;

      const svg = svgEl('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' });

      /* axis in whole kilos, coarse enough not to crowd a phone */
      const stepKg = top > 40 ? 10 : 5;
      for (let v = 0; v <= top; v += stepKg) {
        svg.appendChild(svgEl('line', { class: 'grid-line', x1: X(v), x2: X(v), y1: m.t, y2: m.t + hands.length * rowH }));
        const t = svgEl('text', { class: 'axis-t', x: X(v), y: H - 8, 'text-anchor': 'middle' });
        t.textContent = String(v); svg.appendChild(t);
      }
      const unit = svgEl('text', { class: 'axis-t', x: m.l + iw, y: H - 8, 'text-anchor': 'end' });
      unit.textContent = 'kg'; svg.appendChild(unit);

      const bars = [];
      hands.forEach((h, i) => {
        const S = HAND[h.hand] || HAND.right;
        const y = m.t + i * rowH + 12, bh = 20;

        const name = svgEl('text', { class: 'axis-t', x: m.l - 8, y: y + bh / 2 + 3.5, 'text-anchor': 'end' });
        name.textContent = narrow ? S.label[0] : S.label; svg.appendChild(name);

        /* aerobic — everything the hand can hold more or less forever */
        const aer = svgEl('rect', { x: m.l, y, width: 1, height: bh, rx: 3, fill: S.color, opacity: .16 });
        svg.appendChild(aer); bars.push([aer, X(h.zone[0]) - m.l]);

        /* threshold — the band the test exists to find */
        const thr = svgEl('rect', { x: X(h.zone[0]), y, width: 1, height: bh, rx: 3, fill: S.color, opacity: .52 });
        svg.appendChild(thr); bars.push([thr, X(h.zone[1]) - X(h.zone[0])]);

        /* the critical force itself */
        svg.appendChild(svgEl('line', { x1: X(h.cf), x2: X(h.cf), y1: y - 5, y2: y + bh + 5,
          stroke: S.color, 'stroke-width': 2.25, 'stroke-linecap': 'round' }));

        const lab = svgEl('text', { class: 'lbl',
          x: narrow ? X(h.cf) - 6 : X(h.cf) + 9, y: y + bh / 2 + 4, fill: S.color,
          'text-anchor': narrow ? 'end' : 'start' });
        lab.textContent = h.cf.toFixed(1) + (narrow ? '' : ' kg'); svg.appendChild(lab);
      });

      CT.ui.clear(host); host.appendChild(svg);
      bars.forEach(([node, w]) => {
        if (!CT.ui.ON) { node.setAttribute('width', Math.max(1, w)); return; }
        window.gsap.to(node, { attr: { width: Math.max(1, w) }, duration: .7, ease: 'power3.out' });
      });
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

  CT.charts = { line, cfCurve, cfZones, spark, HAND };
})();
