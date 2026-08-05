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
  /* ═════════════════ a max hang test ═════════════════
     Six weeks in, somebody re-tests. That is a fact about the athlete
     and belongs on the record whatever else happens to it — so it is
     logged on its own, like a bodyweight reading, and training is
     re-based from it only if that is what you want today. A test in
     the middle of a block is often just information; a test between
     blocks is usually the new starting point. */
  CT.views.maxHangLog = function (c, opts) {
    opts = opts || {};
    const existingDate = opts.date || null;
    const editing = existingDate ? c.maxHang.find(m => m.date === existingDate) : null;
    const dateBar = CT.dateBar(c, editing ? editing.date : null, () => sync());
    const last = c.maxHang[c.maxHang.length - 1] || null;
    const bwAt = c.bodyweight[c.bodyweight.length - 1] || null;
    const pct = c.workingPct || CT.PROTOCOL.workingPct;

    const inputs = {};
    const rows = CT.GRIPS.map(g => {
      const input = el('input', { class: 'input', type: 'number', step: 0.5,
        'aria-label': g.name + ' — max hang',
        value: editing ? editing[g.id].toFixed(1) : last ? last[g.id].toFixed(1) : '',
        placeholder: '00.0', oninput: () => sync() });
      inputs[g.id] = input;
      return el('div', { class: 'field' }, [
        el('label', { text: g.name }),
        el('div', { class: 'row', style: 'gap:9px' }, [
          input, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg added' })
        ]),
        el('p', { class: 'tiny', text: last ? `Last test ${CT.fmtLoad(last[g.id])}, ${dt.relative(last.date)}.`
                                            : 'No test on record yet.' })
      ]);
    });

    const read = () => {
      const out = {};
      for (const g of CT.GRIPS) {
        const v = parseFloat(inputs[g.id].value);
        if (!isFinite(v)) return null;
        out[g.id] = Math.round(v * 2) / 2;
      }
      return out;
    };

    /* Off by default: a test is a measurement, and quietly moving what
       somebody is training at because they measured themselves is how a
       hard day mid-block turns into a lighter block. */
    let rebase = false;
    const rebaseNote = el('p', { class: 'tiny' });
    const rebaseBtn = el('button', {
      class: 'pick', type: 'button', style: 'width:100%', 'aria-pressed': 'false',
      onclick: e => {
        if (!bwAt) return;
        rebase = !rebase;
        e.currentTarget.setAttribute('aria-pressed', String(rebase));
        motion.pop(e.currentTarget, .95);
        sync();
      }
    }, [
      el('p', { class: 'pick__n', text: 'Train from this test' }),
      el('p', { class: 'pick__d', text: `Re-base the working loads to ${Math.round(pct * 100)}% of it, from today` })
    ]);

    const summary = el('p', { class: 'sub' });
    const saveBtn = el('button', { class: 'btn btn--primary', onclick: save },
      [ icon('check'), editing ? 'Save changes' : 'Save test' ]);

    function derived(v) {
      if (!bwAt || !v) return null;
      return { tfd: CT.workingLoad(bwAt.kg, v.tfd, pct), half: CT.workingLoad(bwAt.kg, v.half, pct) };
    }

    function sync() {
      const v = read();
      saveBtn.disabled = !v;
      rebaseBtn.disabled = !bwAt;
      const clash = c.maxHang.find(m => m.date === dateBar.get() && (!editing || m.date !== editing.date));
      const d = derived(v);
      rebaseNote.textContent = !bwAt
        ? 'A bodyweight reading is needed before a working load can be worked out from this.'
        : rebase && d
          ? `Working loads become ${CT.fmtLoad(d.tfd)} drag · ${CT.fmtLoad(d.half)} half-crimp, ` +
            `at ${bwAt.kg.toFixed(1)} kg bodyweight. The clean-session count restarts.`
          : 'The test goes on the chart. What you train at is left alone.';
      summary.textContent = !v ? 'A figure for each grip'
        : clash ? `Replaces the test already on ${dt.short(dateBar.get())}.`
        : rebase ? 'Recorded, and training moves with it.' : 'Recorded on the chart.';
    }

    function save() {
      const v = read(), date = dateBar.get();
      if (editing && date !== editing.date) S.deleteMaxHang(c, editing.date);
      S.logMaxHang(c, date, v);
      const d = derived(v);
      if (rebase && d) S.setWorkingLoads(c, { bodyweight: bwAt.kg, max: v, pct, loads: d });
      CT.sheet.close();
      CT.render(false);
      toast(editing ? 'Test updated' : date === dt.iso(dt.today()) ? 'Max hang logged' : 'Logged for ' + dt.short(date),
        `${CT.fmtLoad(v.tfd)} drag · ${CT.fmtLoad(v.half)} half-crimp` +
        (rebase && d ? ` · now training at ${CT.fmtLoad(d.tfd)} / ${CT.fmtLoad(d.half)}` : ''));
    }

    CT.sheet.open({
      eyebrow: editing ? 'Editing · ' + dt.short(editing.date) : c.isSelf ? 'Your training' : c.name,
      title: editing ? 'Edit max hang test' : 'Log a max hang test',
      sub: 'What could be held once, added to bodyweight, on a 20 mm edge for seven seconds',
      body: el('div', { class: 'sheet__bd', style: 'gap:22px' }, [
        dateBar,
        el('div', { class: 'formgrid' }, rows),
        el('div', { class: 'field' }, [ rebaseBtn, rebaseNote ])
      ]),
      footer: el('div', { class: 'sheet__ft' }, [
        editing ? CT.deleteButton(() => {
          S.deleteMaxHang(c, editing.date);
          CT.sheet.close(); CT.render(false);
          toast('Test deleted', dt.short(editing.date) + ' removed from the chart.');
        }) : null,
        summary, saveBtn
      ])
    });
    sync();
  };

  /* The prescription and what it's a share of, with the way in to change
     it. The coach reads this on the Clients screen and the athlete on
     their own dashboard — the same row, because it is the same question
     and they are equally entitled to answer it. */
  CT.loadsRow = function (c) {
    const basis = S.workingBasis(c);
    return el('div', { class: 'target' }, [
      el('span', { class: 'quick__dot quick__dot--s' }),
      el('div', {}, [
        el('p', { class: 'target__n', text: 'Working loads' }),
        el('p', { class: 'target__d', text:
          `${CT.fmtLoad(c.prescribed.tfd)} drag · ${CT.fmtLoad(c.prescribed.half)} half-crimp · ` +
          (basis
            ? `${Math.round(basis.pct * 100)}% of a ${CT.fmtLoad(basis.max.tfd)} / ${CT.fmtLoad(basis.max.half)} max`
            : 'set directly, not worked out from a max') })
      ]),
      el('button', { class: 'btn btn--ghost btn--sm', style: 'margin-left:auto',
        text: basis ? 'Adjust' : 'Change',
        onclick: () => CT.views.workingLoads(c) })
    ]);
  };

  CT.views.workingLoads = function (c) {
    const basis = S.workingBasis(c);
    const latest = c.bodyweight[c.bodyweight.length - 1] || null;

    /* Two ways to answer the same question, because there are two
       situations. Usually a max is the honest starting point and the
       load falls out of it. Sometimes it isn't: a finger is sore, the
       last test is months old, or the coach simply knows what this
       athlete should be hanging — and then the arithmetic is in the
       way and a number typed in is the whole answer. */
    let mode = basis ? 'max' : 'direct';
    const MODES = [
      ['max',    'From a max hang', 'A share of the total on the fingers'],
      ['direct', 'Set directly',    'Type the load, no max needed']
    ];

    let bwValue = basis ? basis.bodyweight : latest ? latest.kg : '';
    const bwInput = el('input', { class: 'input', type: 'number', step: 0.1, min: 20, max: 200,
      value: bwValue === '' ? '' : Number(bwValue).toFixed(1), placeholder: '00.0',
      oninput: e => { bwValue = e.target.value; picker.sync(); refresh(); } });

    /* The most recent test is the best guess at a max — better than
       whatever is being prescribed now, which is a share of one. */
    const lastTest = c.maxHang[c.maxHang.length - 1] || null;
    const picker = CT.loadPicker({
      getBodyweight: () => bwValue,
      max: basis ? basis.max
         : lastTest ? { tfd: lastTest.tfd, half: lastTest.half }
         : { tfd: c.prescribed.tfd, half: c.prescribed.half },
      pct: Math.round((basis ? basis.pct : CT.PROTOCOL.workingPct) * 100),
      onChange: () => refresh()
    });

    /* Direct entry. Opens at what is already prescribed, because the
       commonest edit by far is nudging that number rather than
       replacing it. */
    const directInputs = {};
    const directRows = CT.GRIPS.map(g => {
      const input = el('input', { class: 'input', type: 'number', step: 0.5,
        'aria-label': g.name + ' — load', value: c.prescribed[g.id].toFixed(1),
        oninput: () => refresh() });
      directInputs[g.id] = input;
      return el('div', { class: 'field' }, [
        el('label', { text: g.name }),
        el('div', { class: 'row', style: 'gap:9px' }, [
          input, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg added' })
        ])
      ]);
    });
    const directRead = () => {
      const out = {};
      for (const g of CT.GRIPS) {
        const v = parseFloat(directInputs[g.id].value);
        if (!isFinite(v)) return null;
        out[g.id] = Math.round(v * 2) / 2;
      }
      return out;
    };

    const summary = el('p', { class: 'sub' });
    const preview = el('p', { class: 'tiny' });
    const saveBtn = el('button', { class: 'btn btn--primary', onclick: apply },
      [ icon('check'), 'Apply from today' ]);

    const maxPanes = [], directPanes = [];
    const switcher = el('div', { class: 'picker' }, MODES.map(([id, name, desc]) =>
      el('button', {
        class: 'pick', 'aria-pressed': String(mode === id),
        onclick: e => {
          mode = id;
          [...switcher.children].forEach((b, i) => b.setAttribute('aria-pressed', String(MODES[i][0] === id)));
          motion.pop(e.currentTarget, .9);
          syncMode();
        }
      }, [
        el('p', { class: 'pick__n', text: name }),
        el('p', { class: 'pick__d', text: desc })
      ])
    ));

    function syncMode() {
      maxPanes.forEach(n => n.hidden = mode !== 'max');
      directPanes.forEach(n => n.hidden = mode !== 'direct');
      refresh();
    }

    function refresh() {
      if (mode === 'direct') {
        const loads = directRead();
        saveBtn.disabled = !loads;
        if (!loads) {
          summary.textContent = 'A load for each grip';
          preview.textContent = '';
          return;
        }
        summary.innerHTML = `<b>${CT.fmtLoad(loads.tfd)}</b> drag · <b>${CT.fmtLoad(loads.half)}</b> half-crimp`;
        preview.textContent =
          `Prescribed now: ${CT.fmtLoad(c.prescribed.tfd)} drag, ${CT.fmtLoad(c.prescribed.half)} half-crimp. ` +
          `Applying replaces those and restarts the clean-session count. ` +
          (basis ? 'These stop being a share of a max — the tests already on the chart stay there. '
                 : '') +
          'The clean-session rule carries on from here as usual.';
        return;
      }
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
      const today = dt.iso(dt.today());

      if (mode === 'direct') {
        S.setLoadsDirect(c, directRead());
        CT.sheet.close();
        CT.render(false);
        return toast('Working loads set',
          `${CT.fmtLoad(c.prescribed.tfd)} drag · ${CT.fmtLoad(c.prescribed.half)} half-crimp, from today.`);
      }

      const v = picker.read();
      const newMax = !basis || basis.max.tfd !== v.max.tfd || basis.max.half !== v.max.half;

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

    const bwSection = section('Bodyweight', [
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
    ]);
    const maxSection = section('Max hang', [
      el('p', { class: 'tiny', style: 'margin-top:-4px',
        text: 'What can be held once, added to bodyweight, on a 20 mm edge for seven seconds.' }),
      el('div', { class: 'formgrid' }, picker.maxRows)
    ]);
    const shareSection = section('Working load', [
      el('p', { class: 'tiny', style: 'margin-top:-4px', text:
        'A share of the total on the fingers, bodyweight included. Both numbers are editable.' }),
      el('div', { class: 'formgrid' }, [ picker.pctRow, null ]),
      el('div', { class: 'formgrid' }, picker.loadRows)
    ]);
    const directSection = section('Working load', [
      el('p', { class: 'tiny', style: 'margin-top:-4px', text:
        'What goes on the harness, for both grips. Nothing is worked out from anything — this is ' +
        'simply the load, and the clean-session rule takes it from there.' }),
      el('div', { class: 'formgrid' }, directRows)
    ]);
    maxPanes.push(bwSection, maxSection, shareSection);
    directPanes.push(directSection);

    CT.sheet.open({
      eyebrow: c.isSelf ? 'Your training' : c.name,
      title: 'Working loads',
      sub: 'What the hangboard prescribes, and where the number comes from',
      body: el('div', { class: 'sheet__bd', style: 'gap:26px' }, [
        !basis && !lastTest ? el('div', { class: 'nudge' }, [ icon('info'), el('p', { html:
          `These loads were set directly rather than worked out from a max. Either is fine — record a max ` +
          `hang and the load follows from it, or carry on setting it by hand.` }) ]) : null,
        switcher,
        bwSection, maxSection, shareSection,
        directSection,
        preview
      ]),
      footer: el('div', { class: 'sheet__ft' }, [ summary, saveBtn ])
    });

    picker.sync();
    syncMode();
  };
})();
