/* ═══════════════════════════════════════════════════════════════
   logs/cfupload.js — the coach puts a critical-force test on the
   record. Not a log flow: nothing here is typed in from memory,
   it is a file off the device being read and confirmed.

   The device writes one file per hand and puts the athlete's name
   and the grip only in the filename, so everything this sheet
   shows is a guess until the coach agrees with it. The one thing
   it will not do is guess quietly — a name that doesn't match the
   athlete whose screen you're on is said out loud, because
   uploading Jade's test onto Maks is the mistake worth catching.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast } = CT.ui, S = CT.store, dt = CT.dt;

  CT.views.cfUpload = function (c) {
    /* what's been read so far, and what wouldn't read at all */
    let tests = [];
    let rejects = [];

    const list = el('div', { class: 'stack', style: 'gap:12px' });
    const summary = el('p', { class: 'sub' });
    const saveBtn = el('button', { class: 'btn btn--primary', disabled: true, onclick: save },
      [ icon('check'), 'Add to record' ]);

    const input = el('input', {
      type: 'file', accept: '.json,application/json', multiple: true,
      style: 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none',
      onchange: e => { take([...e.target.files]); e.target.value = ''; }
    });

    const drop = el('button', { class: 'drop', type: 'button', onclick: () => input.click() }, [
      icon('chart', 'drop__i'),
      el('span', { class: 'drop__t', text: 'Choose the test files' }),
      el('span', { class: 'drop__d', text: 'One file per hand. Pick both at once and they pair themselves.' })
    ]);

    /* Desktop drag-and-drop, which is how these files actually arrive —
       straight out of a download folder. The phone gets the file picker,
       which is the only thing it has. */
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault(); drop.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
      e.preventDefault(); drop.classList.remove('is-over');
    }));
    drop.addEventListener('drop', e => {
      take([...(e.dataTransfer ? e.dataTransfer.files : [])]);
    });

    /* ── reading the files ───────────────────────────────── */
    function take(files) {
      const json = files.filter(f => /\.json$/i.test(f.name));
      rejects = rejects.concat(files.filter(f => !/\.json$/i.test(f.name))
        .map(f => ({ file: f.name, why: 'Not a .json file' })));
      if (!json.length) { paint(); return; }

      Promise.all(json.map(f => f.text()
        .then(txt => CT.cf.parse(f.name, JSON.parse(txt)))
        .catch(err => { rejects.push({ file: f.name, why: message(err) }); return null; })
      )).then(parsed => {
        const ok = parsed.filter(Boolean);
        /* Re-group everything each time, so dropping the second hand
           after the first joins them rather than filing them apart. */
        const carried = tests.flatMap(t => CT.cf.HANDS
          .filter(h => t.hands[h])
          .map(h => ({ file: t.source[h], athlete: t.athlete, grip: t.grip, gripGuessed: t.gripGuessed,
                       hand: h, date: t.date, bodyweight: t.bodyweight, hand_: t.hands[h] })));
        const seen = new Set(carried.map(p => p.file));
        tests = CT.cf.group(carried.concat(ok.filter(p => !seen.has(p.file))));
        paint();
      });
    }

    function message(err) {
      if (err instanceof SyntaxError) return 'Not readable as JSON';
      return err && err.message ? err.message : 'Could not be read';
    }

    /* ── one test, ready to be corrected ─────────────────── */
    function testCard(t, i) {
      const grip = CT.cf.gripOf(t.grip);
      const hands = CT.cf.hands(t);
      const clash = c.criticalForce.find(x => x.date === t.date && x.grip === t.grip);
      const mismatch = nameClash(t.athlete);
      /* Two staged tests on one date and grip would land on the same
         record, and the second would quietly win. Said out loud and
         blocked, because the usual cause is a file that belongs to
         somebody else. */
      const twin = tests.some((o, j) => j !== i && o.date === t.date && o.grip === t.grip);

      const dateInput = el('input', { class: 'input', type: 'date', value: t.date,
        oninput: e => { if (e.target.value) { t.date = e.target.value; paint(); } } });

      const gripSelect = el('select', { class: 'input', onchange: e => { t.grip = e.target.value; t.gripGuessed = false; paint(); } },
        CT.cf.gripChoices().map(g => el('option', { value: g.id, selected: g.id === t.grip, text: g.name })));

      return el('div', { class: 'cfup' }, [
        el('div', { class: 'cfup__hd' }, [
          el('div', {}, [
            el('p', { class: 'eyebrow', text: 'Test ' + (i + 1) }),
            el('h4', { class: 'cfup__t', text: grip.name + ' · ' + dt.short(t.date) }),
            el('p', { class: 'tiny', text: hands.length === 2
              ? 'Both hands' + (t.bodyweight ? ' · ' + t.bodyweight + ' kg bodyweight' : '')
              : (hands[0] ? cap(hands[0].hand) + ' hand only' : 'No usable hand') })
          ]),
          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { tests.splice(i, 1); paint(); } },
            [ icon('x'), 'Remove' ])
        ]),

        el('div', { class: 'cfup__hands' }, hands.map(h => {
          const S_ = CT.charts.HAND[h.hand];
          return el('div', { class: 'cfup__hand' }, [
            el('span', { class: 'cfup__dot', style: 'background:' + S_.color }),
            el('div', {}, [
              el('p', { class: 'cfup__hn', text: cap(h.hand) }),
              el('p', { class: 'cfup__hv', text: h.cf.toFixed(1) + ' kg' }),
              el('p', { class: 'tiny', text: h.reps.length + ' reps · ' +
                (h.flagged.length ? h.flagged.length + ' flagged' : 'none flagged') })
            ])
          ]);
        })),

        el('div', { class: 'cfup__fields' }, [
          el('div', { class: 'field' }, [ el('label', { text: 'Date' }), dateInput ]),
          el('div', { class: 'field' }, [
            el('label', { text: 'Grip' }), gripSelect,
            t.gripGuessed ? el('p', { class: 'tiny', text: 'Not recognised from the filename — pick the right one.' }) : null
          ])
        ]),

        mismatch ? note('warn', `The filename says ${mismatch}, and you're on ${c.name}'s record. ` +
                                `Check you've picked the right files before saving.`) : null,
        twin ? note('warn', `Another test here is also ${grip.short.toLowerCase()} on ${dt.short(t.date)}, and only one ` +
                            `can be kept. Change a date or a grip, or remove the one that doesn't belong.`) : null,
        clash && !twin ? note('info', `${c.name} already has a ${grip.short.toLowerCase()} test on ${dt.short(t.date)}. ` +
                              `Saving replaces it.`) : null,
        ...CT.cf.caveats(t).map(cv => note(cv.tone, cv.text))
      ]);
    }

    /* The filename's name against the athlete whose screen this is.
       Loose on purpose — first names, any case — because a false
       alarm on every upload trains you to ignore the real one. */
    function nameClash(guess) {
      if (!guess) return null;
      const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
      const g = norm(guess);
      if (!g) return null;
      const mine = [c.name, c.full].filter(Boolean).flatMap(n => String(n).split(/\s+/)).map(norm);
      const whole = [c.name, c.full].filter(Boolean).map(norm);
      if (whole.some(w => w === g) || mine.some(w => w && (w === g || g.startsWith(w) || w.startsWith(g)))) return null;
      return CT.cf.prettify(guess);
    }

    function note(tone, text) {
      return el('p', { class: 'cfup__note cfup__note--' + tone }, [
        icon(tone === 'warn' ? 'info' : 'info', 'cfup__ni'), el('span', { text })
      ]);
    }

    const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

    /* ── paint ───────────────────────────────────────────── */
    function paint() {
      CT.ui.clear(list);
      tests.forEach((t, i) => list.appendChild(testCard(t, i)));
      rejects.forEach((r, i) => list.appendChild(
        el('div', { class: 'cfup cfup--bad' }, [
          el('div', { class: 'cfup__hd' }, [
            el('div', {}, [
              el('p', { class: 'eyebrow', text: 'Skipped' }),
              el('h4', { class: 'cfup__t', text: r.file }),
              el('p', { class: 'tiny', text: r.why })
            ]),
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { rejects.splice(i, 1); paint(); } },
              [ icon('x'), 'Dismiss' ])
          ])
        ])
      ));

      const n = tests.length;
      const hands = tests.reduce((a, t) => a + CT.cf.hands(t).length, 0);
      const twins = tests.some((t, i) => tests.some((o, j) => j !== i && o.date === t.date && o.grip === t.grip));
      summary.textContent = twins ? 'Two tests on the same date and grip — settle that first'
        : !n ? 'Nothing chosen yet'
        : `${n} test${n > 1 ? 's' : ''} · ${hands} hand${hands > 1 ? 's' : ''}`;
      saveBtn.disabled = !n || twins;
      drop.querySelector('.drop__t').textContent = n ? 'Add more files' : 'Choose the test files';
      motion.enter(list);
    }

    function save() {
      const n = tests.length;
      tests.forEach(t => S.saveCFTest(c, {
        id: (c.criticalForce.find(x => x.date === t.date && x.grip === t.grip) || {}).id || null,
        date: t.date, grip: t.grip, bodyweight: t.bodyweight,
        hands: t.hands, source: t.source
      }));
      CT.sheet.close();
      CT.render(false);
      toast(n > 1 ? n + ' tests added' : 'Test added',
        `On ${c.name}'s progress screen now.`);
    }

    paint();

    CT.sheet.open({
      eyebrow: c.name,
      title: 'Upload a critical force test',
      sub: 'Straight off the device. Nothing is typed in.',
      body: el('div', { class: 'sheet__bd' }, [ input, drop, list ]),
      footer: el('div', { class: 'sheet__ft' }, [ summary, saveBtn ])
    });
  };
})();
