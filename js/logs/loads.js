/* ═══════════════════════════════════════════════════════════════
   logs/loads.js — what the hangboard prescribes, and what it's a
   share of.

   A max hang is a max hang: you can do one of those, once. Training
   happens underneath it, at a share of the total load on the fingers
   — bodyweight included, because bodyweight is on the edge whether
   or not anybody writes it down.

   Two callers, one control: onboarding sets this up at the start of
   a block, and this file's own sheet re-bases it mid-block, for a
   max that's been re-tested or loads that were set before the
   percentage existed and are simply wrong.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;

  /* ═════════════════ the shared control ═════════════════
     Hands back its pieces rather than a finished block, because the
     two callers lay them out differently: onboarding puts the max and
     the working load in separate sections of a longer form, and the
     re-basing sheet runs them together.

     opts.getBodyweight is a function, not a number — in onboarding the
     bodyweight is typed into a field this control doesn't own. */
  CT.loadPicker = function (opts) {
    const state = {
      max: Object.assign({}, opts.max),
      pct: opts.pct,
      /* null means "whatever the percentage works out to". A number
         means somebody disagreed with it, which is allowed and is why
         it's a field rather than a readout. */
      loads: Object.assign({ tfd: null, half: null }, opts.loads || {})
    };

    const bw = () => parseFloat(opts.getBodyweight());
    const derived = id => CT.workingLoad(bw(), state.max[id], state.pct / 100);
    const loadOf  = id => state.loads[id] != null ? state.loads[id] : derived(id);
    const changed = () => { sync(); if (opts.onChange) opts.onChange(); };

    function field(label, control, hint) {
      return el('div', { class: 'field' }, [
        el('label', { text: label }), control,
        hint ? el('p', { class: 'tiny', text: hint }) : null
      ]);
    }

    const maxRows = CT.GRIPS.map(g => field(g.name, el('div', { class: 'row', style: 'gap:9px' }, [
      el('input', { class: 'input', type: 'number', step: 0.5, value: state.max[g.id],
        'aria-label': g.name + ' — max hang',
        oninput: e => { state.max[g.id] = +e.target.value; changed(); } }),
      el('span', { class: 'readout__u', style: 'flex:none', text: 'kg added' })
    ])));

    const pctRow = field('Share of max', el('div', { class: 'row', style: 'gap:9px' }, [
      el('input', { class: 'input', type: 'number', step: 1, min: 40, max: 100, value: state.pct,
        'aria-label': 'Share of max',
        oninput: e => { state.pct = Math.max(40, Math.min(100, +e.target.value || 0)); changed(); } }),
      el('span', { class: 'readout__u', style: 'flex:none', text: '% of total' })
    ]));

    /* ── one grip's working load, with the sum behind it ── */
    const loadRows = CT.GRIPS.map(g => {
      const input = el('input', { class: 'input', type: 'number', step: 0.5,
        'aria-label': g.name + ' — working load',
        oninput: e => { state.loads[g.id] = e.target.value === '' ? null : +e.target.value; changed(); } });
      const sum = el('p', { class: 'tiny' });
      const reset = el('button', { type: 'button', class: 'load__reset', text: 'Use the calculated load',
        onclick: () => { state.loads[g.id] = null; changed(); } });

      const row = el('div', { class: 'field' }, [
        el('label', { text: g.name }),
        el('div', { class: 'row', style: 'gap:9px' }, [
          input, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg added' })
        ]),
        sum, reset
      ]);

      row._sync = () => {
        const d = derived(g.id), v = loadOf(g.id);
        const overridden = state.loads[g.id] != null;
        if (!overridden) input.value = d == null ? '' : d.toFixed(1);
        reset.hidden = !overridden || d == null;
        const w = bw();
        sum.textContent = d == null
          ? 'A bodyweight is needed before this works itself out.'
          : overridden
            ? `Calculated load is ${CT.fmtLoad(d)} — you’ve set ${CT.fmtLoad(v)} instead.`
            : `(${w.toFixed(1)} + ${state.max[g.id].toFixed(1)}) × ${state.pct}% − ${w.toFixed(1)} ` +
              `= ${(w + v).toFixed(1)} kg through the fingers.`;
      };
      return row;
    });

    function sync() { loadRows.forEach(r => r._sync()); }

    return {
      maxRows, pctRow, loadRows, sync,
      valid() {
        const w = bw();
        if (!isFinite(w) || w < 20 || w > 200) return false;
        return CT.GRIPS.every(g => {
          const v = loadOf(g.id);
          return typeof v === 'number' && isFinite(v);
        });
      },
      read() {
        return {
          bodyweight: +bw().toFixed(1),
          max: { tfd: state.max.tfd, half: state.max.half },
          pct: state.pct / 100,
          loads: { tfd: loadOf('tfd'), half: loadOf('half') }
        };
      }
    };
  };

  /* ═════════════════ re-basing a block already running ═════════════════
     Nothing logged is touched: every session keeps the load it was
     really performed at. What moves is where the replay starts, so the
     new figure is what the next session is prescribed rather than being
     overwritten by the last session's recorded weight. */
  CT.views.workingLoads = function (c) {
    const basis = S.workingBasis(c);
    const latest = c.bodyweight[c.bodyweight.length - 1] || null;

    let bwValue = basis ? basis.bodyweight : latest ? latest.kg : '';
    const bwInput = el('input', { class: 'input', type: 'number', step: 0.1, min: 20, max: 200,
      value: bwValue === '' ? '' : Number(bwValue).toFixed(1), placeholder: '00.0',
      oninput: e => { bwValue = e.target.value; picker.sync(); refresh(); } });

    /* No recorded max means loads that were typed in directly, before
       the percentage existed. Those numbers were meant to be near a max,
       so they are the honest place to start the conversation — and they
       are exactly what is currently being prescribed at 100%. */
    const picker = CT.loadPicker({
      getBodyweight: () => bwValue,
      max: basis ? basis.max : { tfd: c.prescribed.tfd, half: c.prescribed.half },
      pct: Math.round((basis ? basis.pct : CT.PROTOCOL.workingPct) * 100),
      onChange: () => refresh()
    });

    const summary = el('p', { class: 'sub' });
    const preview = el('p', { class: 'tiny' });
    const saveBtn = el('button', { class: 'btn btn--primary', onclick: apply },
      [ icon('check'), 'Apply from today' ]);

    function refresh() {
      const ok = picker.valid();
      saveBtn.disabled = !ok;
      if (!ok) {
        summary.textContent = 'A bodyweight and a load for each grip';
        preview.textContent = '';
        return;
      }
      const v = picker.read();
      summary.innerHTML = `<b>${CT.fmtLoad(v.loads.tfd)}</b> drag · <b>${CT.fmtLoad(v.loads.half)}</b> half-crimp`;
      const newMax = !basis || basis.max.tfd !== v.max.tfd || basis.max.half !== v.max.half;
      preview.textContent =
        `Prescribed now: ${CT.fmtLoad(c.prescribed.tfd)} drag, ${CT.fmtLoad(c.prescribed.half)} half-crimp. ` +
        `Applying replaces those and restarts the clean-session count.` +
        (newMax ? ' The max goes on the record as a test dated today.' : '');
    }

    function apply() {
      const v = picker.read();
      const newMax = !basis || basis.max.tfd !== v.max.tfd || basis.max.half !== v.max.half;
      const today = dt.iso(dt.today());

      /* A max that has changed is new information about the athlete, so
         it belongs on the chart as a test. One that hasn't is the same
         test being reused, and inventing a second data point for it
         would be a lie about how often they'd been tested. */
      if (newMax) S.logMaxHang(c, today, { tfd: v.max.tfd, half: v.max.half });
      if (!latest || latest.kg !== v.bodyweight) S.logBodyweight(c, today, v.bodyweight);
      S.setWorkingLoads(c, v);

      CT.sheet.close();
      CT.render(false);
      toast('Working loads updated',
        `${CT.fmtLoad(c.prescribed.tfd)} drag · ${CT.fmtLoad(c.prescribed.half)} half-crimp, from today.`);
    }

    function section(title, kids) {
      return el('div', { class: 'formsec' }, [
        el('div', { class: 'formsec__hd' }, [ el('p', { class: 'eyebrow', text: title }) ]),
        ...kids
      ]);
    }

    CT.sheet.open({
      eyebrow: c.isSelf ? 'Your training' : c.name,
      title: 'Working loads',
      sub: 'What the hangboard prescribes, and what it’s a share of',
      body: el('div', { class: 'sheet__bd', style: 'gap:26px' }, [
        !basis ? el('div', { class: 'nudge' }, [ icon('info'), el('p', { html:
          `These loads were set before the app worked them out as a share of a max, so they are being ` +
          `prescribed in full. The figures below start from what’s prescribed now — correct the max if it ` +
          `isn’t right, and the working load follows.` }) ]) : null,
        section('Bodyweight', [
          el('div', { class: 'formgrid' }, [
            el('div', { class: 'field' }, [
              el('label', { text: 'Bodyweight' }),
              el('div', { class: 'row', style: 'gap:9px' }, [
                bwInput, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg' })
              ]),
              el('p', { class: 'tiny', text: latest
                ? `Last reading ${latest.kg.toFixed(1)} kg, ${dt.relative(latest.date)}.`
                : 'No readings yet — this becomes the first.' })
            ])
          ])
        ]),
        section('Max hang', [
          el('p', { class: 'tiny', style: 'margin-top:-4px',
            text: 'What can be held once, added to bodyweight, on a 20 mm edge for seven seconds.' }),
          el('div', { class: 'formgrid' }, picker.maxRows)
        ]),
        section('Working load', [
          el('p', { class: 'tiny', style: 'margin-top:-4px', text:
            'A share of the total on the fingers, bodyweight included. Both numbers are editable.' }),
          el('div', { class: 'formgrid' }, [ picker.pctRow, null ]),
          el('div', { class: 'formgrid' }, picker.loadRows),
          preview
        ])
      ]),
      footer: el('div', { class: 'sheet__ft' }, [ summary, saveBtn ])
    });

    picker.sync();
    refresh();
  };
})();
