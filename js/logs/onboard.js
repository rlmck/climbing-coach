/* ═══════════════════════════════════════════════════════════════
   logs/onboard.js — a coach sets up a new athlete.

   The days picked here are the weekly targets: one suggested slot
   per prescribed session, so the plan and the target can never
   drift apart. Everything else the athlete builds themselves.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;

  const DAY_LABEL = ['M','T','W','T','F','S','S'];
  const DAY_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  CT.views.onboard = function () {
    const form = {
      name: '',
      bodyweight: '',
      start: CT.nextMonday(),
      weeks: 8,
      loads: { tfd: 10, half: 12.5 },
      template: { strength: [0], endurance: [1, 3, 5], pe: [2] },
      note: ''
    };

    const summary = el('p', { class: 'sub' });
    const saveBtn = el('button', { class: 'btn btn--primary', onclick: create }, [ icon('check'), 'Create client' ]);
    const phaseNote = el('p', { class: 'tiny' });

    /* ── a row of seven day toggles ── */
    function dayRow(key, label, hint) {
      const btns = DAY_LABEL.map((d, i) => el('button', {
        text: d, 'aria-label': DAY_FULL[i], 'aria-pressed': String(form.template[key].includes(i)),
        onclick: e => {
          const list = form.template[key];
          const at = list.indexOf(i);
          if (at >= 0) list.splice(at, 1); else list.push(i);
          list.sort((a, b) => a - b);
          e.currentTarget.setAttribute('aria-pressed', String(at < 0));
          if (at < 0) motion.pop(e.currentTarget, .82);
          sync();
        }
      }));
      const count = el('span', { class: 'grip__streaktxt', style: 'min-width:96px;text-align:right' });
      const row = el('div', { class: 'dayrow' }, [
        el('div', {}, [
          el('p', { class: 'target__n', text: label }),
          el('p', { class: 'target__d', text: hint })
        ]),
        el('div', { class: 'days' }, btns),
        count
      ]);
      row._count = count;
      row._key = key;
      return row;
    }

    const rows = [
      dayRow('strength',  'Strength',        'Max hangs. Two rest days between if you run more than one.'),
      dayRow('endurance', 'Endurance',       'The volume that carries the block.'),
      dayRow('pe',        'Power endurance', 'Only scheduled in the final three weeks.')
    ];

    function field(label, control, hint) {
      return el('div', { class: 'field' }, [
        el('label', { text: label }), control,
        hint ? el('p', { class: 'tiny', text: hint }) : null
      ]);
    }

    function section(title, kids) {
      return el('div', { class: 'formsec' }, [
        el('div', { class: 'formsec__hd' }, [ el('p', { class: 'eyebrow', text: title }) ]),
        ...kids
      ]);
    }

    const nameInput = el('input', { class: 'input', type: 'text', placeholder: 'Full name',
      oninput: e => { form.name = e.target.value; sync(); } });
    const bwInput = el('input', { class: 'input', type: 'number', step: 0.1, min: 20, max: 200,
      placeholder: 'Optional', oninput: e => { form.bodyweight = e.target.value; } });
    const startInput = el('input', { class: 'input', type: 'date', value: form.start,
      oninput: e => { form.start = e.target.value || CT.nextMonday(); sync(); } });
    const weeksInput = el('select', { class: 'input', onchange: e => { form.weeks = +e.target.value; sync(); } },
      [4, 6, 8, 10, 12].map(w => el('option', { value: w, text: w + ' weeks', selected: w === form.weeks || null })));
    const tfdInput = el('input', { class: 'input', type: 'number', step: 0.5, value: form.loads.tfd,
      oninput: e => { form.loads.tfd = +e.target.value; sync(); } });
    const halfInput = el('input', { class: 'input', type: 'number', step: 0.5, value: form.loads.half,
      oninput: e => { form.loads.half = +e.target.value; sync(); } });
    const noteInput = el('textarea', { class: 'input', placeholder: 'Anything they should read on day one.',
      oninput: e => form.note = e.target.value });

    function sync() {
      rows.forEach(r => {
        const n = form.template[r._key].length;
        r._count.textContent = n === 0 ? 'none' : n + (n === 1 ? ' day' : ' days');
        r._count.style.color = n === 0 && r._key !== 'pe' ? 'var(--clay)' : '';
      });

      const t = form.template;
      const peFrom = form.weeks - 2;
      phaseNote.textContent = `Base phase for weeks 1 to ${peFrom - 1}. Power endurance opens in week ${peFrom} and runs to the end.`;

      const valid = form.name.trim().length > 1 && t.strength.length > 0 && t.endurance.length > 0;
      saveBtn.disabled = !valid;

      const base = t.strength.length + t.endurance.length;
      summary.textContent = !form.name.trim() ? 'Give them a name to finish'
        : !t.strength.length ? 'Pick at least one strength day'
        : !t.endurance.length ? 'Pick at least one endurance day'
        : `${form.weeks} weeks from ${dt.short(form.start)} · ${base} sessions a week, ${base + t.pe.length} once power endurance opens`;
    }

    function create() {
      const c = CT.createClient({
        name: form.name,
        bodyweight: form.bodyweight ? +parseFloat(form.bodyweight).toFixed(1) : null,
        start: form.start,
        weeks: form.weeks,
        loads: form.loads,
        template: {
          strength: form.template.strength.slice(),
          endurance: form.template.endurance.slice(),
          pe: form.template.pe.slice()
        },
        note: form.note.trim()
      });
      S.addClient(c);
      CT.state.activeClient = c.id;
      CT.sheet.close();
      CT.render(false);
      toast(c.name + ' is set up', `${c.targets.strength} strength and ${c.targets.endurance} endurance a week, starting ${dt.short(c.block.start)}.`);
    }

    CT.sheet.open({
      eyebrow: 'New client',
      title: 'Onboard an athlete',
      sub: 'Four things: who they are, when the block runs, what they hang, and which days they train',
      body: el('div', { class: 'sheet__bd', style: 'gap:26px' }, [
        section('Athlete', [
          el('div', { class: 'formgrid' }, [
            field('Name', nameInput),
            field('Starting bodyweight', el('div', { class: 'row', style: 'gap:9px' }, [
              bwInput, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg' })
            ]), 'They can update this any time.')
          ])
        ]),
        section('Block', [
          el('div', { class: 'formgrid' }, [
            field('Starts', startInput, 'Blocks run Monday to Sunday.'),
            field('Length', weeksInput)
          ]),
          phaseNote
        ]),
        section('Starting hang loads', [
          el('div', { class: 'formgrid' }, [
            field('Three-finger drag', el('div', { class: 'row', style: 'gap:9px' }, [
              tfdInput, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg added' })
            ])),
            field('Half-crimp', el('div', { class: 'row', style: 'gap:9px' }, [
              halfInput, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg added' })
            ]))
          ]),
          el('p', { class: 'tiny', text: 'Set these a little under a clean max hang. Two clean sessions in a row earns +2.5 kg from there.' })
        ]),
        section('Training days', [
          el('p', { class: 'tiny', style: 'margin-top:-4px', text: 'What you pick here becomes their weekly target.' }),
          ...rows
        ]),
        section('First note', [ field('Note from the coach', noteInput) ])
      ]),
      footer: el('div', { class: 'sheet__ft' }, [ summary, saveBtn ])
    });
    sync();
  };
})();
