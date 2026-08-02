/* ═══════════════════════════════════════════════════════════════
   logs/session.js — endurance and power-endurance logs.
   Pick a modality, fill a short form, pick a date. The field sets
   are a deliberate first pass: shapes to react to, not a spec.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;

  const RPE = v => v <= 3 ? 'Easy' : v <= 5 ? 'Steady' : v <= 7 ? 'Hard' : v <= 9 ? 'Very hard' : 'Maximal';
  const UNIT = { minutes: 'min', seconds: 's', kg: 'kg', number: '' };

  /* ═══════════════ which kind of session? ═══════════════
     Nothing in the app opens a log without knowing what it is. */
  CT.views.chooseLog = function (c, opts) {
    const kinds = [
      ['strength',  'Strength',        'Hangboard max hangs, or limit bouldering'],
      ['endurance', 'Endurance',       'Routes, traversing, edge pulls, 1-on-1-off, 4×4s'],
      ['pe',        'Power Endurance', 'Boulder 4×4s, wall crawls, repeaters']
    ].filter(([id]) => id !== 'pe' || S.inPEPhase(c));

    const body = el('div', { class: 'sheet__bd' }, [
      el('div', { class: 'picker', style: 'grid-template-columns:1fr' }, kinds.map(([id, name, desc]) =>
        el('button', { class: 'pick', onclick: () => { CT.sheet.close(true); CT.openLog(id, opts); } }, [
          el('div', { class: 'row', style: 'gap:10px' }, [
            el('span', { class: 'quick__dot quick__dot--' + (id === 'strength' ? 's' : id === 'pe' ? 'p' : 'e') }),
            el('p', { class: 'pick__n', text: name })
          ]),
          el('p', { class: 'pick__d', style: 'margin-left:17px', text: desc })
        ])
      )),
      !S.inPEPhase(c)
        ? el('p', { class: 'tiny', text: `Power Endurance opens in week ${c.block.peFromWeek}, the final three of the block.` })
        : null
    ]);

    CT.sheet.open({
      eyebrow: 'New session',
      title: opts.date && opts.date !== dt.iso(dt.today())
        ? 'What did you do on ' + dt.short(opts.date) + '?'
        : 'What are you logging?',
      sub: 'You can change the date on the next screen.',
      body
    });
  };

  /* ═══════════════ planning a future day ═══════════════
     A day that hasn't happened yet can't be logged — pick the kind of
     session and it lands on the plan as a placeholder, to be logged on
     the day itself. Power Endurance is offered by the week the date
     falls in, not by the week the athlete is in today. */
  CT.views.planSlot = function (c, date) {
    if (S.isCoach()) {
      toast('Coaches don’t plan from here', `Switch to ${c.name} in the corner to add to their week.`);
      return;
    }
    const peOpen = S.weekOf(c, date) >= c.block.peFromWeek;
    const kinds = [
      ['strength',  'Strength',        'Max hangs or limit bouldering'],
      ['endurance', 'Endurance',       'Routes, traversing, edge pulls, 1-on-1-off, 4×4s'],
      ['pe',        'Power Endurance', 'Boulder 4×4s, wall crawls, repeaters']
    ].filter(([id]) => id !== 'pe' || peOpen);

    const place = type => {
      if (!S.addPlannedSlot(c, date, type)) {
        toast('That day is full', `${dt.short(date)} already has ${S.maxPerDay} sessions.`);
        return;
      }
      CT.sheet.close();
      CT.render(false);
      toast(CT.TYPE[type].label + ' planned', dt.short(date) + ' · log it on the day.');
    };

    const body = el('div', { class: 'sheet__bd' }, [
      el('div', { class: 'picker', style: 'grid-template-columns:1fr' }, kinds.map(([id, name, desc]) =>
        el('button', { class: 'pick', onclick: () => place(id) }, [
          el('div', { class: 'row', style: 'gap:10px' }, [
            el('span', { class: 'quick__dot quick__dot--' + (id === 'strength' ? 's' : id === 'pe' ? 'p' : 'e') }),
            el('p', { class: 'pick__n', text: name })
          ]),
          el('p', { class: 'pick__d', style: 'margin-left:17px', text: desc })
        ])
      )),
      el('p', { class: 'tiny', text: peOpen
        ? 'It joins your plan as a suggested session — drag it to another day any time.'
        : `It joins your plan as a suggested session. Power Endurance opens in week ${c.block.peFromWeek}.` })
    ]);

    CT.sheet.open({
      eyebrow: 'Plan ahead',
      title: 'What are you planning for ' + dt.short(date) + '?',
      sub: dt.relative(date) + ' — nothing is logged until the day itself',
      body
    });
  };

  /* ═══════════════ bodyweight ═══════════════ */
  CT.views.weightLog = function (c, opts) {
    opts = opts || {};
    const editing = opts.date ? c.bodyweight.find(b => b.date === opts.date) : null;
    const last = c.bodyweight[c.bodyweight.length - 1] || null;
    const dateBar = CT.dateBar(c, editing ? editing.date : null, () => sync());

    const input = el('input', { class: 'input', type: 'number', step: 0.1, min: 20, max: 200,
      value: editing ? editing.kg.toFixed(1) : last ? last.kg.toFixed(1) : '', placeholder: '00.0',
      style: 'font-size:28px;height:64px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums',
      oninput: () => sync() });

    const delta = el('p', { class: 'tiny' });
    const saveBtn = el('button', { class: 'btn btn--primary', onclick: save },
      [ icon('check'), editing ? 'Save changes' : 'Save reading' ]);

    function sync() {
      const v = parseFloat(input.value);
      const ok = !isNaN(v) && v >= 20 && v <= 200;
      saveBtn.disabled = !ok;
      const existing = c.bodyweight.find(b => b.date === dateBar.get());
      delta.textContent = !ok ? 'Enter a weight between 20 and 200 kg.'
        : existing ? `Replaces the ${existing.kg.toFixed(1)} kg reading already on ${dt.short(dateBar.get())}.`
        : last ? `${(v - last.kg) >= 0 ? '+' : ''}${(v - last.kg).toFixed(1)} kg since ${dt.short(last.date)}.`
        : 'This becomes your first reading.';
    }

    function save() {
      const v = parseFloat(input.value), date = dateBar.get();
      /* moving an edited reading to a different day leaves nothing behind */
      if (editing && date !== editing.date) S.deleteBodyweight(c, editing.date);
      S.logBodyweight(c, date, +v.toFixed(1));
      CT.sheet.close();
      CT.render(false);
      if (editing) return toast('Reading updated', dt.short(date) + ' · ' + v.toFixed(1) + ' kg');
      toast(date === dt.iso(dt.today()) ? 'Weight logged' : 'Logged for ' + dt.short(date),
            v.toFixed(1) + ' kg' + (last ? ` · ${(v - last.kg) >= 0 ? '+' : ''}${(v - last.kg).toFixed(1)} kg since last time` : ''));
    }

    CT.sheet.open({
      eyebrow: editing ? 'Editing · ' + dt.short(editing.date) : 'Bodyweight',
      title: editing ? 'Edit reading' : 'Log a reading',
      sub: 'Whenever you weigh in — the trend matters more than any one number',
      body: el('div', { class: 'sheet__bd' }, [
        dateBar,
        el('div', { class: 'field' }, [
          el('label', { text: 'Weight' }),
          el('div', { class: 'row', style: 'gap:10px' }, [
            input, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg' })
          ]),
          delta
        ])
      ]),
      footer: el('div', { class: 'sheet__ft' }, [
        editing ? CT.deleteButton(() => {
          S.deleteBodyweight(c, editing.date);
          CT.sheet.close(); CT.render(false);
          toast('Reading deleted', dt.short(editing.date) + ' removed from the trend.');
        }) : null,
        el('p', { class: 'sub', text: last ? `Last reading ${last.kg.toFixed(1)} kg, ${dt.relative(last.date)}` : 'No readings yet' }),
        saveBtn
      ])
    });
    sync();
  };

  CT.views.sessionLog = function (c, type, opts) {
    const editing = opts.sessionId ? S.session(c, opts.sessionId) : null;
    if (editing) type = editing.type;
    const mods = CT.MODALITIES[type];
    const T = CT.TYPE[type];
    let modality = editing ? editing.modality : opts.modality || null;
    const values = {};

    const dateBar = CT.dateBar(c, editing ? editing.date : opts.date);
    const formHost = el('div', { style: 'display:none' });
    const saveBtn = el('button', { class: 'btn btn--primary', disabled: true, onclick: save },
      [ icon('check'), editing ? 'Save changes' : 'Save session' ]);
    const summary = el('p', { class: 'sub', text: 'Pick what you did' });

    const picker = el('div', { class: 'picker' }, mods.map(m =>
      el('button', {
        class: 'pick', 'aria-pressed': String(modality === m.id),
        onclick: () => choose(m.id)
      }, [
        el('p', { class: 'pick__n', text: m.name }),
        el('p', { class: 'pick__d', text: m.desc })
      ])
    ));

    function choose(id) {
      const first = !modality;
      modality = id;
      [...picker.children].forEach((b, i) => b.setAttribute('aria-pressed', String(mods[i].id === id)));
      buildForm();
      summary.textContent = mods.find(m => m.id === id).name;
      saveBtn.disabled = false;
      if (first) motion.collapse(formHost, true);
      else if (motion.on) motion.enter(formHost, '.field');
    }

    function buildForm() {
      CT.ui.clear(formHost);
      Object.keys(values).forEach(k => delete values[k]);
      const grid = el('div', { class: 'formgrid' });

      const prior = editing && editing.modality === modality ? editing.fields : null;

      CT.FORMS[modality].forEach(([key, label, kind, def]) => {
        const options = kind === 'select' ? String(def).split(',') : null;
        values[key] = options ? options[Math.floor(options.length / 2)] : def;
        if (prior && prior[key] !== undefined && prior[key] !== null) values[key] = prior[key];
        const init = values[key];

        let control;
        if (options) {
          control = el('select', { class: 'input', onchange: e => values[key] = e.target.value },
            options.map(o => el('option', { value: o, text: o, selected: o === init || null })));
        } else if (kind === 'rpe') {
          const out = el('span', { class: 'rpe__val', text: `${init} · ${RPE(init)}` });
          const range = el('input', { type: 'range', min: 1, max: 10, step: 1, value: init,
            oninput: e => { values[key] = +e.target.value; out.textContent = `${e.target.value} · ${RPE(+e.target.value)}`; } });
          control = el('div', { class: 'rpe' }, [ range, out ]);
        } else {
          control = el('div', { class: 'row', style: 'gap:9px' }, [
            el('input', { class: 'input', type: 'number', value: init, min: 0, step: kind === 'kg' ? 0.5 : 1,
              oninput: e => values[key] = +e.target.value }),
            UNIT[kind] ? el('span', { class: 'readout__u', style: 'flex:none', text: UNIT[kind] }) : null
          ]);
        }

        grid.appendChild(el('div', { class: 'field' + (kind === 'rpe' ? ' span2' : '') }, [
          el('label', { text: label + (kind === 'rpe' ? ' — RPE 1 to 10' : '') }),
          control
        ]));
      });

      formHost.appendChild(grid);
      formHost.appendChild(el('div', { class: 'field', style: 'margin-top:14px' }, [
        el('label', { text: 'Notes' }),
        el('textarea', { class: 'input', id: 'eNotes', text: editing ? editing.notes : '',
          placeholder: type === 'pe' ? 'How the last set felt. Where it fell apart.' : 'Terrain, partners, how it felt.' })
      ]));
    }

    function save() {
      const date = dateBar.get();
      const notesEl = CT.ui.$('#eNotes', formHost);
      const payload = { date, modality, fields: Object.assign({}, values),
                        notes: notesEl ? notesEl.value.trim() : '' };

      if (editing) {
        S.updateSession(c, editing.id, payload);
        CT.sheet.close(); CT.render(false);
        toast('Session updated', dt.short(date) + ' · ' + mods.find(m => m.id === modality).name);
        return;
      }

      const before = S.streak(c);
      S.logSession(c, Object.assign({ type }, payload));
      CT.sheet.close();
      toast(date === dt.iso(dt.today()) ? 'Logged' : 'Logged for ' + dt.short(date),
            mods.find(m => m.id === modality).name + ' added to your week.');
      CT.afterLog(c, before);
    }

    const body = el('div', { class: 'sheet__bd' }, [
      dateBar,
      el('div', {}, [
        el('p', { class: 'eyebrow', style: 'margin-bottom:10px', text: 'What did you do' }),
        picker
      ]),
      formHost
    ]);

    CT.sheet.open({
      eyebrow: editing ? 'Editing · ' + dt.short(editing.date) : T.label,
      title: type === 'pe' ? 'Power Endurance' : 'Endurance',
      sub: type === 'pe'
        ? 'Anaerobic work — scheduled in the final three weeks of the block'
        : 'Aerobic capacity — the volume that carries the block',
      body,
      footer: el('div', { class: 'sheet__ft' }, [
        editing ? CT.deleteButton(() => {
          S.deleteSession(c, editing.id);
          CT.sheet.close(); CT.render(false);
          toast('Session deleted', dt.short(editing.date) + ' cleared from your week.');
        }) : null,
        summary, saveBtn
      ])
    });

    if (modality) choose(modality);
  };
})();
