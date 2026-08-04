/* ═══════════════════════════════════════════════════════════════
   logs/onboard.js — a coach sets up an athlete.

   The days picked here are the weekly targets: one suggested slot
   per prescribed session, so the plan and the target can never
   drift apart. Everything else the athlete builds themselves.

   The same form sets up the coach's own training. A coach who climbs
   is an athlete with an unusual amount of say over their own plan, not
   a different kind of record — so it is the same record, claimed by
   the person making it, with no code to hand anybody.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;

  const DAY_LABEL = ['M','T','W','T','F','S','S'];
  const DAY_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  CT.views.onboard = function (opts) {
    const self = !!(opts && opts.self);
    const form = {
      name: self ? (CT.world.coach.full || '') : '',
      bodyweight: '',
      start: CT.nextMonday(),
      weeks: 8,
      /* What they can hold once, per grip — added load at bodyweight. */
      max: { tfd: 20, half: 25 },
      pct: Math.round(CT.PROTOCOL.workingPct * 100),
      /* The load the block actually opens on. Null means "whatever the
         percentage works out to"; a number means somebody disagreed with
         it, which is allowed and is why the field is a field. */
      loads: { tfd: null, half: null },
      template: { strength: [0], endurance: [1, 3, 5], pe: [2] },
      note: ''
    };

    /* the working load for a grip, derived unless it's been overridden */
    const derived = id => CT.workingLoad(parseFloat(form.bodyweight), form.max[id], form.pct / 100);
    const loadOf  = id => form.loads[id] != null ? form.loads[id] : derived(id);

    const summary = el('p', { class: 'sub' });
    const saveBtn = el('button', { class: 'btn btn--primary', onclick: create },
      [ icon('check'), self ? 'Start my block' : 'Create client' ]);
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
      dayRow('pe',        'Power Endurance', 'Only scheduled in the final three weeks.')
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
      value: form.name, oninput: e => { form.name = e.target.value; sync(); } });
    const bwInput = el('input', { class: 'input', type: 'number', step: 0.1, min: 20, max: 200,
      placeholder: '00.0', oninput: e => { form.bodyweight = e.target.value; sync(); } });
    const startInput = el('input', { class: 'input', type: 'date', value: form.start,
      oninput: e => { form.start = e.target.value || CT.nextMonday(); sync(); } });
    const weeksInput = el('select', { class: 'input', onchange: e => { form.weeks = +e.target.value; sync(); } },
      [4, 6, 8, 10, 12].map(w => el('option', { value: w, text: w + ' weeks', selected: w === form.weeks || null })));
    const maxRows = CT.GRIPS.map(g => field(g.name, el('div', { class: 'row', style: 'gap:9px' }, [
      el('input', { class: 'input', type: 'number', step: 0.5, value: form.max[g.id],
        'aria-label': g.name + ' — max hang',
        oninput: e => { form.max[g.id] = +e.target.value; sync(); } }),
      el('span', { class: 'readout__u', style: 'flex:none', text: 'kg added' })
    ])));

    const pctInput = el('input', { class: 'input', type: 'number', step: 1, min: 40, max: 100, value: form.pct,
      oninput: e => { form.pct = Math.max(40, Math.min(100, +e.target.value || 0)); sync(); } });

    /* ── the working load, and the sum behind it ──
       Shown as a field rather than a readout because the arithmetic is
       a starting point, not a verdict: a coach who knows this athlete
       hangs better than the number says can simply say so. */
    function loadRow(g) {
      const input = el('input', { class: 'input', type: 'number', step: 0.5,
        'aria-label': g.name + ' — working load',
        oninput: e => { form.loads[g.id] = e.target.value === '' ? null : +e.target.value; sync(); } });
      const sum = el('p', { class: 'tiny' });
      const reset = el('button', { type: 'button', class: 'load__reset', text: 'Use the calculated load',
        onclick: () => { form.loads[g.id] = null; sync(); } });

      const row = el('div', { class: 'field' }, [
        el('label', { text: g.name }),
        el('div', { class: 'row', style: 'gap:9px' }, [
          input, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg added' })
        ]),
        sum, reset
      ]);

      row._sync = () => {
        const d = derived(g.id), v = loadOf(g.id);
        const overridden = form.loads[g.id] != null;
        if (!overridden) input.value = d == null ? '' : d.toFixed(1);
        reset.hidden = !overridden || d == null;
        const bw = parseFloat(form.bodyweight);
        sum.textContent = d == null
          ? 'Enter a bodyweight above and this works itself out.'
          : overridden
            ? `Calculated load is ${sign(d)} kg — you’ve set ${sign(v)} kg instead.`
            : `(${bw.toFixed(1)} + ${form.max[g.id].toFixed(1)}) × ${form.pct}% − ${bw.toFixed(1)} ` +
              `= ${(bw + v).toFixed(1)} kg through the fingers.`;
      };
      return row;
    }

    const sign = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
    const loadRows = CT.GRIPS.map(loadRow);
    const noteInput = el('textarea', { class: 'input', placeholder: 'Anything they should read on day one.',
      oninput: e => form.note = e.target.value });

    function sync() {
      rows.forEach(r => {
        const n = form.template[r._key].length;
        r._count.textContent = n === 0 ? 'none' : n + (n === 1 ? ' day' : ' days');
        r._count.style.color = n === 0 && r._key !== 'pe' ? 'var(--clay)' : '';
      });

      loadRows.forEach(r => r._sync());

      const t = form.template;
      const peFrom = form.weeks - 2;
      phaseNote.textContent = `Base phase for weeks 1 to ${peFrom - 1}. Power Endurance opens in week ${peFrom} and runs to the end.`;

      /* Bodyweight used to be optional. It isn't any more: the working
         load is a share of bodyweight plus added weight, and without the
         first half of that there is nothing to take a share of. */
      const bwOK = isFinite(parseFloat(form.bodyweight)) &&
                   parseFloat(form.bodyweight) >= 20 && parseFloat(form.bodyweight) <= 200;
      const loadsOK = CT.GRIPS.every(g => typeof loadOf(g.id) === 'number' && isFinite(loadOf(g.id)));
      const valid = form.name.trim().length > 1 && t.strength.length > 0 && t.endurance.length > 0 && bwOK && loadsOK;
      saveBtn.disabled = !valid;

      const base = t.strength.length + t.endurance.length;
      summary.textContent = !form.name.trim() ? (self ? 'Your name, to finish' : 'Give them a name to finish')
        : !bwOK ? (self ? 'Your bodyweight, so the loads can be worked out' : 'A bodyweight, so the loads can be worked out')
        : !loadsOK ? 'Set a working load for each grip'
        : !t.strength.length ? 'Pick at least one strength day'
        : !t.endurance.length ? 'Pick at least one endurance day'
        : `${form.weeks} weeks from ${dt.short(form.start)} · ${base} sessions a week, ${base + t.pe.length} once Power Endurance opens`;
    }

    async function create() {
      const c = CT.createClient({
        name: form.name,
        bodyweight: +parseFloat(form.bodyweight).toFixed(1),
        start: form.start,
        weeks: form.weeks,
        loads: { tfd: loadOf('tfd'), half: loadOf('half') },
        maxLoads: { tfd: form.max.tfd, half: form.max.half },
        workingPct: form.pct / 100,
        template: {
          strength: form.template.strength.slice(),
          endurance: form.template.endurance.slice(),
          pe: form.template.pe.slice()
        },
        note: form.note.trim()
      });

      /* The record goes up, then its plan, then — for anyone who isn't
         the coach themselves — the code that lets them reach it. Until
         all of that lands, the button says what it's doing. */
      let invite = null;
      if (CT.repo.enabled) {
        saveBtn.disabled = true;
        summary.textContent = self ? 'Setting up your block…' : 'Creating ' + c.name + '…';
        try {
          c.id = await CT.repo.createAthlete(c, { self });
          c.isSelf = self;
          if (!self) {
            invite = await CT.repo.issueInvite(c.id);
            /* On the optimistic copy too, so the roster and the code
               sheet both read right now rather than one snapshot later. */
            c.invitePin = invite.pin;
            c.inviteExpires = invite.expiresAt;
          }
        } catch (e) {
          saveBtn.disabled = false;
          summary.textContent = self ? 'Couldn’t set that up' : 'Couldn’t create ' + c.name;
          toast(self ? 'Couldn’t set up your block' : 'Couldn’t create that athlete', CT.fb.message(e));
          return;
        }
        if (c.bodyweight && c.bodyweight.length) CT.repo.saveBodyweight(c, c.bodyweight[0]);
        if (c.maxHang && c.maxHang.length) CT.repo.saveMaxHang(c, c.maxHang[0]);
      }

      S.addClient(c);
      CT.state.activeClient = c.id;

      /* A code is the one thing here the coach has to carry out of this
         screen and into a conversation, so it gets a screen of its own
         rather than a toast that leaves while they're finding a pen.

         Handing straight over to the next sheet rather than closing
         first: close() animates, and its tween would land a fifth of a
         second later and clear the host out from under the sheet that
         replaced it. open() already closes what's there, instantly. */
      if (invite) {
        CT.render(false);
        CT.views.inviteCode(c, { fresh: true });
        return;
      }

      CT.sheet.close();
      CT.render(false);
      toast(self ? 'Your block is set up' : c.name + ' is set up',
        `${c.targets.strength} strength and ${c.targets.endurance} endurance a week, starting ${dt.short(c.block.start)}.`);
    }

    CT.sheet.open({
      eyebrow: self ? 'Your training' : 'New client',
      title: self ? 'Set up your own block' : 'Onboard an athlete',
      sub: self
        ? 'The same four things you set for everyone else — you just happen to be picking them for yourself'
        : 'Four things: who they are, when the block runs, what they hang, and which days they train',
      body: el('div', { class: 'sheet__bd', style: 'gap:26px' }, [
        section(self ? 'You' : 'Athlete', [
          el('div', { class: 'formgrid' }, [
            field('Name', nameInput),
            field('Starting bodyweight', el('div', { class: 'row', style: 'gap:9px' }, [
              bwInput, el('span', { class: 'readout__u', style: 'flex:none', text: 'kg' })
            ]), self ? 'The working loads are worked out from this. You can update it any time.'
                     : 'The working loads are worked out from this. They can update it any time.')
          ])
        ]),
        section('Block', [
          el('div', { class: 'formgrid' }, [
            field('Starts', startInput, 'Blocks run Monday to Sunday.'),
            field('Length', weeksInput)
          ]),
          phaseNote
        ]),
        section('Max hang', [
          el('p', { class: 'tiny', style: 'margin-top:-4px',
            text: self ? 'What you can hold once, added to bodyweight, on a 20 mm edge for seven seconds.'
                       : 'What they can hold once, added to bodyweight, on a 20 mm edge for seven seconds.' }),
          el('div', { class: 'formgrid' }, maxRows)
        ]),
        section('Working load', [
          el('p', { class: 'tiny', style: 'margin-top:-4px', text:
            'Training sits under the max, at a share of the total load on the fingers — bodyweight included, ' +
            'because it is on the edge whether or not anyone writes it down. Both numbers are editable.' }),
          el('div', { class: 'formgrid' }, [
            field('Share of max', el('div', { class: 'row', style: 'gap:9px' }, [
              pctInput, el('span', { class: 'readout__u', style: 'flex:none', text: '% of total' })
            ])),
            null
          ]),
          el('div', { class: 'formgrid' }, loadRows),
          el('p', { class: 'tiny', text: 'Two clean sessions in a row earns +2.5 kg from wherever this starts.' })
        ]),
        section('Training days', [
          el('p', { class: 'tiny', style: 'margin-top:-4px',
            text: self ? 'What you pick here becomes your weekly target.'
                       : 'What you pick here becomes their weekly target.' }),
          ...rows
        ]),
        section('First note', [ field(self ? 'Note to yourself' : 'Note from the coach', noteInput) ])
      ]),
      footer: el('div', { class: 'sheet__ft' }, [ summary, saveBtn ])
    });
    sync();
  };
})();
