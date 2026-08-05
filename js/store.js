/* ═══════════════════════════════════════════════════════════════
   store.js — in-memory state, derived selectors, mutations.
   No persistence: reload returns to the seeded world.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, dt = CT.dt;

  /* The persistence seam. repo.js replaces this wholesale when it loads;
     until then — and permanently, if no backend is configured — every
     call is a no-op and the app runs on the seeded world in memory,
     exactly as the prototype always did. */
  CT.repo = CT.repo || {
    enabled: false,
    newId: () => 'loc_' + Math.random().toString(36).slice(2, 10),
    saveSession() {}, deleteSession() {}, saveSlot() {}, deleteSlot() {},
    saveBodyweight() {}, deleteBodyweight() {}, saveMaxHang() {}, deleteMaxHang() {}, saveAthlete() {},
    saveCFTest() {}, deleteCFTest() {},
    createAthlete: async c => c.id
  };

  const state = CT.state = {
    viewAs: 'maks',          // 'coach' | 'maks' | 'jade'
    activeClient: 'maks',    // whose data is on screen
    route: 'dashboard',
    weekOffset: 0            // schedule view, 0 = this week
  };

  const S = CT.store = {

    /* ── identity ────────────────────────────────────────── */
    me()        { return state.viewAs === 'coach' ? CT.world.coach : CT.world.clients[state.viewAs]; },
    isCoach()   { return state.viewAs === 'coach'; },
    client(id)  { return CT.world.clients[id || state.activeClient]; },
    clients()   { return Object.values(CT.world.clients); },

    /* A coach who trains has an athlete record of their own, sitting in
       the same collection as everybody else's because it is the same
       kind of thing. It is not a second account and not a second person
       in the switcher: it is what the coach's own dashboard, plan and
       progress screens are built from. The roster leaves it out. */
    selfAthlete() { return Object.values(CT.world.clients).find(c => c.isSelf) || null; },
    roster()      { return Object.values(CT.world.clients).filter(c => !c.isSelf); },

    /* Is the coach looking at their own training rather than
       somebody's they coach? Everything that separates the two — the
       context bar, the quick-log buttons, whether a log sheet will
       open at all — hangs off this one answer. */
    viewingSelf() {
      if (!S.isCoach()) return false;
      const c = S.client();
      return !!(c && c.isSelf);
    },
    /* Logging is yours to do on your own record and nobody else's. */
    canLog() { return !S.isCoach() || S.viewingSelf(); },

    setUser(id) {
      state.viewAs = id;
      if (id !== 'coach') state.activeClient = id;
      state.weekOffset = 0;
    },

    /* Coach-side navigation between athletes — including back to
       themselves, which is an athlete record like any other. */
    setViewing(id) {
      if (!id || !CT.world.clients[id]) return false;
      state.activeClient = id;
      state.weekOffset = 0;
      return true;
    },

    /* ── block / phase ───────────────────────────────────── */
    weekOf(c, iso) {
      const n = Math.floor(dt.diff(iso, c.block.start) / 7) + 1;
      return Math.max(1, Math.min(c.block.weeks, n));
    },
    currentWeek(c) { return S.weekOf(c, dt.iso(dt.today())); },
    phaseOfWeek(c, w) { return w >= c.block.peFromWeek ? 'Power Endurance' : 'Base'; },
    phase(c) { return S.phaseOfWeek(c, S.currentWeek(c)); },
    inPEPhase(c) { return S.phase(c) === 'Power Endurance'; },
    weekStart(c, w) { return dt.addISO(c.block.start, (w - 1) * 7); },

    /* ── slots / sessions ────────────────────────────────── */
    slotsInWeek(c, w) {
      const a = S.weekStart(c, w), b = dt.addISO(a, 6);
      return c.slots.filter(s => s.date >= a && s.date <= b).sort((x,y) => x.date < y.date ? -1 : 1);
    },
    slotsOn(c, iso) { return c.slots.filter(s => s.date === iso); },

    /* A day holds two planned sessions at most — a third stops fitting the
       day cell and stops being a day anyone would actually train. This
       governs the planner only: logging what you really did is never
       blocked by it. */
    maxPerDay: 2,
    dayIsFull(c, iso, exceptSlotId) {
      return S.slotsOn(c, iso).filter(s => s.id !== exceptSlotId).length >= S.maxPerDay;
    },
    sessionsOn(c, iso) { return c.sessions.filter(s => s.date === iso); },
    session(c, id) { return c.sessions.find(s => s.id === id); },
    lastSession(c) {
      return c.sessions.slice().sort((a,b) => a.date < b.date ? 1 : -1)[0] || null;
    },
    strengthSessions(c) {
      return c.sessions.filter(s => s.type === 'strength').sort((a,b) => a.date < b.date ? -1 : 1);
    },
    /* sessions logged before limit bouldering existed are all hangboard */
    strengthMode(ses) { return ses.mode || 'hangs'; },

    /* What was actually hung on a grip. Six hangs, three a side, used to
       be the only shape a session could have — now the athlete sets the
       count per grip and may leave one out entirely, so every reader has
       to cope with an absent grip rather than assume three of them. */
    repsOf(ses, gripId) {
      const r = ses && ses.reps && ses.reps[gripId];
      return Array.isArray(r) ? r : [];
    },
    repCount(ses) {
      return CT.GRIPS.reduce((a, g) => a + S.repsOf(ses, g.id).length, 0);
    },
    cleanCount(ses) {
      return CT.GRIPS.reduce((a, g) => a + S.repsOf(ses, g.id).filter(r => r === true).length, 0);
    },
    /* only the hangboard carries a prescribed load, so only it replays */
    hangSessions(c) {
      return S.strengthSessions(c).filter(s => S.strengthMode(s) === 'hangs');
    },

    /* live slot status — recomputed so backdated logs update the calendar */
    slotStatus(c, slot) {
      if (slot.sessionId) return 'completed';
      return slot.date < dt.iso(dt.today()) ? 'missed' : 'suggested';
    },

    /* ── weekly target progress ──────────────────────────── */
    weekProgress(c, w) {
      const slots = S.slotsInWeek(c, w);
      const t = c.targets, pe = w >= c.block.peFromWeek;
      const count = type => slots.filter(s => s.type === type && S.slotStatus(c,s) === 'completed').length;
      const req = { strength: t.strength, endurance: t.endurance, pe: pe ? t.pe : 0 };
      const got = { strength: count('strength'), endurance: count('endurance'), pe: count('pe') };
      const need = req.strength + req.endurance + req.pe;
      const have = Math.min(got.strength, req.strength) + Math.min(got.endurance, req.endurance) + Math.min(got.pe, req.pe);
      return { req, got, need, have, hit: have >= need, pct: need ? have / need : 1 };
    },

    /* consecutive completed weeks that met their minimum, up to last full week */
    streak(c) {
      const cur = S.currentWeek(c);
      let n = 0;
      for (let w = cur - 1; w >= 1; w--) {
        if (S.weekProgress(c, w).hit) n++; else break;
      }
      if (S.weekProgress(c, cur).hit) n++;    // current week counts once it's met
      return n;
    },
    milestones: [4, 8, 12, 16, 24],
    nextMilestone(n) { return S.milestones.find(m => m > n) || null; },

    /* ── strength progression ────────────────────────────── */
    /* A session is clean for a grip when all reps passed. Two clean in a row
       earns +2.5 kg on that grip and resets the counter. Any failed rep resets.

       State is replayed from the session list rather than accumulated, so
       editing or deleting an old session lands the athlete on the load they
       should actually be on. Recorded weights are never rewritten — each
       session keeps the load it was really performed at.

       `loadsFrom` is where the replay starts. Normally that is the
       beginning of the block, but a coach who re-tests a max and resets
       the working loads needs the new number to actually take — and it
       could not, because the last session's recorded weight would
       overwrite it on the very next replay. So a reset moves the
       starting line: sessions before that date are history, and only
       what happens on or after it steers the load from there. */
    replay(c, excludeId) {
      const from = c.loadsFrom || null;
      const list = S.hangSessions(c)
        .filter(s => s.id !== excludeId)
        .filter(s => !from || s.date >= from);
      const out = {};
      CT.GRIPS.forEach(g => {
        let weight = (c.startLoads || c.prescribed)[g.id], streak = 0;
        list.forEach(ses => {
          const reps = S.repsOf(ses, g.id);
          /* A session that skipped this grip says nothing about it —
             not a clean streak, not a reset, and not a load. Reading a
             weight off it would drag the prescription sideways for work
             that never happened. */
          if (!reps.length) return;
          /* The load that was actually hung, which is not always the one
             that was prescribed — an athlete who went heavier or lighter
             carries on from where they really are. */
          if (typeof (ses.weights || {})[g.id] === 'number') weight = ses.weights[g.id];
          streak = reps.every(Boolean) ? streak + 1 : 0;
          if (streak >= CT.PROTOCOL.cleanTarget) { streak = 0; weight += CT.PROTOCOL.increment; }
        });
        out[g.id] = { weight, streak };
      });
      return out;
    },
    recomputeStrength(c) {
      const st = S.replay(c, null);
      CT.GRIPS.forEach(g => { c.prescribed[g.id] = st[g.id].weight; c.cleanStreak[g.id] = st[g.id].streak; });
      return st;
    },

    gripState(c, gripId, excludeId) {
      if (excludeId) return S.replay(c, excludeId)[gripId];
      return { weight: c.prescribed[gripId], streak: c.cleanStreak[gripId] };
    },
    /* `baseOverride` lets the edit flow project from the state this session
       started at, rather than from the athlete's state today */
    projectGrip(c, gripId, reps, baseOverride) {
      const base = baseOverride || S.gripState(c, gripId);
      /* No hangs on this grip is not a clean sweep of nothing — it is a
         grip that wasn't trained, and it moves neither the streak nor
         the load. `[].every()` is true, so this has to be said out loud
         or a skipped grip would earn its +2.5 kg for free. */
      if (!reps.length) {
        return { done: true, clean: false, failed: false, skipped: true,
                 streak: base.streak, weight: base.weight, earned: false,
                 wasStreak: base.streak, baseWeight: base.weight };
      }
      const done = reps.every(r => r !== null);
      const clean = done && reps.every(r => r === true);
      const failed = reps.some(r => r === false);
      let streak = base.streak, weight = base.weight, earned = false, skipped = false;
      if (failed) streak = 0;
      else if (clean) {
        streak = base.streak + 1;
        if (streak >= CT.PROTOCOL.cleanTarget) { streak = 0; weight = base.weight + CT.PROTOCOL.increment; earned = true; }
      }
      return { done, clean, failed, skipped, streak, weight, earned,
               wasStreak: base.streak, baseWeight: base.weight };
    },

    /* The working load the block opened on, and what it was derived
       from — 85% of the total on the fingers at a recorded max. Absent
       for athletes onboarded before the percentage existed, whose
       starting loads were simply typed in. */
    workingBasis(c) {
      if (!c.maxLoads || !c.refBodyweight) return null;
      const pct = c.workingPct || CT.PROTOCOL.workingPct;
      return { pct, bodyweight: c.refBodyweight, max: c.maxLoads, from: c.loadsFrom || null,
               loads: { tfd: CT.workingLoad(c.refBodyweight, c.maxLoads.tfd, pct),
                        half: CT.workingLoad(c.refBodyweight, c.maxLoads.half, pct) } };
    },

    /* Re-basing an athlete already mid-block: a max was tested, or the
       loads were set before the percentage existed and are simply
       wrong. Nothing logged is touched — the sessions keep the loads
       they were really performed at — but the replay starts again from
       here, so the new number is what the next session is prescribed
       and the clean-session count begins afresh at it. */
    setWorkingLoads(c, v) {
      const today = dt.iso(dt.today());
      c.maxLoads = { tfd: v.max.tfd, half: v.max.half };
      c.refBodyweight = v.bodyweight;
      c.workingPct = v.pct;
      c.startLoads = { tfd: v.loads.tfd, half: v.loads.half };
      c.loadsFrom = today;
      S.recomputeStrength(c);
      CT.repo.saveAthlete(c, {
        maxLoads: c.maxLoads, refBodyweight: c.refBodyweight, workingPct: c.workingPct,
        startLoads: c.startLoads, loadsFrom: c.loadsFrom
      });
      return c.prescribed;
    },

    /* Setting the loads by hand, with nothing behind them. Sometimes the
       arithmetic is not the point: a finger is sore, a max is months
       stale, or the coach simply knows what this athlete should be
       hanging this week. The prescription is then not a share of
       anything, so the basis goes with it rather than leaving the
       screens quoting a percentage of a number the load no longer
       follows from. The tests on the max-hang chart are untouched —
       those are what was measured, this is what is being trained at. */
    setLoadsDirect(c, loads) {
      const today = dt.iso(dt.today());
      c.startLoads = { tfd: loads.tfd, half: loads.half };
      c.maxLoads = null;
      c.workingPct = null;
      c.refBodyweight = null;
      c.loadsFrom = today;
      S.recomputeStrength(c);
      CT.repo.saveAthlete(c, {
        startLoads: c.startLoads, maxLoads: null, workingPct: null,
        refBodyweight: null, loadsFrom: c.loadsFrom
      });
      return c.prescribed;
    },

    /* A max hang is a test result. One per day, so the date is the
       document id — re-testing on a day that already has one corrects
       it rather than recording the same session twice. */
    logMaxHang(c, iso, loads) {
      const rec = Object.assign({ date: iso }, loads);
      const at = c.maxHang.findIndex(m => m.date === iso);
      if (at >= 0) c.maxHang[at] = rec; else c.maxHang.push(rec);
      c.maxHang.sort((a, b) => a.date < b.date ? -1 : 1);
      CT.repo.saveMaxHang(c, rec);
      return rec;
    },

    deleteMaxHang(c, iso) {
      const at = c.maxHang.findIndex(m => m.date === iso);
      if (at >= 0) c.maxHang.splice(at, 1);
      CT.repo.deleteMaxHang(c, iso);
    },

    /* ── rest-rule guidance (advisory only, never blocking) ── */
    /* All of this is advice about how to arrange training that is still
       ahead of you. Once the last day it concerns has been and gone there
       is nothing left to act on, so it stays quiet. */
    weekNudges(c, w) {
      const slots = S.slotsInWeek(c, w);
      const out = [];
      const todayISO = dt.iso(dt.today());
      const hard = slots.filter(s => s.type === 'strength' || s.type === 'pe')
                        .sort((a,b) => a.date < b.date ? -1 : 1);

      const rest = n => n === 1 ? '1 rest day' : n + ' rest days';
      for (let i = 1; i < hard.length; i++) {
        const a = hard[i-1], b = hard[i];
        const gap = dt.diff(b.date, a.date) - 1;                    // full rest days between
        if (gap >= 2) continue;
        if (b.date < todayISO) continue;                            // already trained through
        if (a.type === 'strength' && b.type === 'strength') {
          out.push({ tone:'warn', text:`Two <b>Strength</b> sessions on ${dt.dow(a.date)} and ${dt.dow(b.date)} — ${rest(gap)} between. Fingers usually want two.` });
        } else if (gap < 1) {
          out.push({ tone:'warn', text:`<b>${CT.TYPE[a.type].label}</b> and <b>${CT.TYPE[b.type].label}</b> back to back, ${dt.dow(a.date)} into ${dt.dow(b.date)}. Fine if you feel fresh — worth spacing if not.` });
        } else {
          out.push({ tone:'info', text:`<b>${CT.TYPE[a.type].label}</b> ${dt.dow(a.date)} and <b>${CT.TYPE[b.type].label}</b> ${dt.dow(b.date)} — ${rest(gap)} between. Both lean on the same tissue.` });
        }
      }

      /* four or more consecutive training days */
      const days = [...new Set(slots.map(s => s.date))].sort();
      let run = 1, best = 1, from = days[0];
      for (let i = 1; i < days.length; i++) {
        if (dt.diff(days[i], days[i-1]) === 1) { run++; if (run > best) { best = run; from = days[i-run+1]; } }
        else run = 1;
      }
      if (best >= 4 && dt.addISO(from, best - 1) >= todayISO) {
        out.push({ tone:'info', text:`<b>${best} training days in a row</b> from ${dt.dow(from)}. A rest day in the middle would land better.` });
      }

      return out.slice(0, 2);   // guidance, not a lecture
    },

    /* ── mutations ─────────────────────────────────────────
       Each of these does the same two things: change CT.world now, so
       the screen is right on the next frame, and hand the change to the
       repo to persist. With no backend configured the repo calls are
       no-ops and the app behaves exactly as the prototype did. Ids come
       from the repo so the local record and the stored document are one
       record, not two. */
    /* Logging a session on any date within the block. Attaches to a matching
       open slot on that date if one exists, otherwise creates one so the
       calendar and the log always agree. */
    logSession(c, session) {
      session.id = CT.repo.newId(c.id, 'sessions');
      c.sessions.push(session);

      let slot = c.slots.find(s => s.date === session.date && s.type === session.type && !s.sessionId);
      if (!slot) {
        slot = { id: CT.repo.newId(c.id, 'slots'), week: S.weekOf(c, session.date),
                 type: session.type, date: session.date, status:'completed', sessionId:null, adhoc:true };
        c.slots.push(slot);
      }
      slot.sessionId = session.id;
      slot.status = 'completed';

      if (session.type === 'strength') S.recomputeStrength(c);
      CT.repo.saveSession(c, session);
      CT.repo.saveSlot(c, slot);
      return { session, slot };
    },

    /* ── editing history ─────────────────────────────────── */
    updateSession(c, id, patch) {
      const ses = S.session(c, id);
      if (!ses) return null;
      const movedTo = patch.date && patch.date !== ses.date ? patch.date : null;
      Object.assign(ses, patch);

      const slot = c.slots.find(s => s.sessionId === id);
      if (slot && movedTo) { slot.date = movedTo; slot.week = S.weekOf(c, movedTo); }

      if (ses.type === 'strength') S.recomputeStrength(c);
      CT.repo.saveSession(c, ses);
      if (slot && movedTo) CT.repo.saveSlot(c, slot);
      return ses;
    },

    deleteSession(c, id) {
      const ses = S.session(c, id);
      if (!ses) return false;
      c.sessions.splice(c.sessions.indexOf(ses), 1);

      const slot = c.slots.find(s => s.sessionId === id);
      if (slot) {
        slot.sessionId = null;
        /* a slot invented to hold an unplanned session has nothing left to show */
        if (slot.adhoc) {
          c.slots.splice(c.slots.indexOf(slot), 1);
          CT.repo.deleteSlot(c, slot.id);
        } else {
          slot.status = slot.date < dt.iso(dt.today()) ? 'missed' : 'suggested';
          CT.repo.saveSlot(c, slot);
        }
      }
      if (ses.type === 'strength') S.recomputeStrength(c);
      CT.repo.deleteSession(c, id);
      return true;
    },

    deleteBodyweight(c, iso) {
      const i = c.bodyweight.findIndex(b => b.date === iso);
      if (i < 0) return false;
      c.bodyweight.splice(i, 1);
      CT.repo.deleteBodyweight(c, iso);
      return true;
    },

    /* every session, newest first — what the history list reads from */
    history(c) {
      return c.sessions.slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    },

    moveSlot(c, slotId, toISO) {
      const slot = c.slots.find(s => s.id === slotId);
      if (!slot) return false;
      if (slot.date !== toISO && S.dayIsFull(c, toISO, slotId)) return false;
      slot.date = toISO;
      slot.week = S.weekOf(c, toISO);
      const ses = slot.sessionId && S.session(c, slot.sessionId);
      if (ses) ses.date = toISO;
      CT.repo.saveSlot(c, slot);
      if (ses) CT.repo.saveSession(c, ses);
      return true;
    },

    /* Only ever an unlogged slot. A completed one is removed by deleting
       the session behind it, which also puts the loads back. */
    removeSlot(c, slotId) {
      const i = c.slots.findIndex(s => s.id === slotId);
      if (i < 0 || c.slots[i].sessionId) return false;
      c.slots.splice(i, 1);
      CT.repo.deleteSlot(c, slotId);
      return true;
    },

    /* Planning a future day places a placeholder, not a record — there is
       nothing to log until the session has actually happened. */
    addPlannedSlot(c, iso, type) {
      if (S.dayIsFull(c, iso)) return null;
      const slot = { id: CT.repo.newId(c.id, 'slots'), week: S.weekOf(c, iso),
                     type, date: iso, status: 'suggested', sessionId: null };
      c.slots.push(slot);
      CT.repo.saveSlot(c, slot);
      return slot;
    },

    /* Changing a target changes the plan with it — otherwise the week
       shows a target it has no sessions to reach. Only unlogged slots in
       the current week onwards move, so history and drags survive. */
    setTarget(c, key, n) {
      n = Math.max(0, Math.min(7, n));
      if (n === c.targets[key]) return;
      c.targets[key] = n;

      for (let w = S.currentWeek(c); w <= c.block.weeks; w++) {
        if (key === 'pe' && w < c.block.peFromWeek) continue;
        let diff = n - c.slots.filter(s => s.week === w && s.type === key).length;
        while (diff > 0) { S._addSlot(c, w, key); diff--; }
        while (diff < 0) {
          const spare = c.slots.filter(s => s.week === w && s.type === key && !s.sessionId).pop();
          if (!spare) break;
          c.slots.splice(c.slots.indexOf(spare), 1);
          CT.repo.deleteSlot(c, spare.id);
          diff++;
        }
      }
      CT.repo.saveAthlete(c, { targets: c.targets });
    },

    /* Spread across the week: the emptiest day takes it, earliest breaks a
       tie. Once every day is at capacity there is nowhere left to put one. */
    _addSlot(c, w, type) {
      const wkStart = S.weekStart(c, w);
      const count = iso => S.slotsOn(c, iso).length;
      let best = null;
      for (let d = 0; d < 7; d++) {
        const iso = dt.addISO(wkStart, d);
        if (best === null || count(iso) < count(best)) best = iso;
      }
      if (count(best) >= S.maxPerDay) return null;
      return S.addPlannedSlot(c, best, type);
    },

    addClient(c) { CT.world.clients[c.id] = c; return c; },

    /* one reading per day — weighing yourself twice replaces the entry,
       which is why the date is the document id */
    logBodyweight(c, iso, kg) {
      const found = c.bodyweight.find(b => b.date === iso);
      if (found) found.kg = kg;
      else {
        c.bodyweight.push({ date: iso, kg });
        c.bodyweight.sort((a,b) => a.date < b.date ? -1 : 1);
      }
      CT.repo.saveBodyweight(c, { date: iso, kg });
      return kg;
    },

    /* ── derived numbers for tiles ───────────────────────── */
    bodyweightTrend(c) {
      const b = c.bodyweight;
      if (!b.length) return { empty: true, latest: null, delta: 0, since: null };
      const latest = b[b.length-1].kg;
      if (b.length < 2) return { latest, delta: 0, since: b[0].date, single: true };
      const ref = b[Math.max(0, b.length-5)];
      return { latest, delta: +(latest - ref.kg).toFixed(1), since: ref.date };
    },
    /* ── critical force ──────────────────────────────────────
       Uploaded rather than logged, and always by the coach — the
       device is theirs. A test is keyed by date and grip, so
       re-uploading the same files corrects the record instead of
       doubling it. */
    saveCFTest(c, test) {
      const id = test.id || CT.repo.newId(c.id, 'criticalForce');
      const rec = Object.assign({}, test, { id });
      const at = c.criticalForce.findIndex(t => t.id === id ||
        (t.date === rec.date && t.grip === rec.grip));
      if (at >= 0) c.criticalForce[at] = rec; else c.criticalForce.push(rec);
      c.criticalForce.sort((a,b) => a.date < b.date ? -1 : 1);
      CT.repo.saveCFTest(c, rec);
      return rec;
    },

    deleteCFTest(c, id) {
      const at = c.criticalForce.findIndex(t => t.id === id);
      if (at < 0) return;
      c.criticalForce.splice(at, 1);
      CT.repo.deleteCFTest(c, id);
    },

    /* Grips that have ever been tested, newest test first — the app's
       own pair isn't the authority here, the data is. */
    cfGrips(c) {
      const seen = [];
      c.criticalForce.slice().reverse().forEach(t => { if (!seen.includes(t.grip)) seen.push(t.grip); });
      return seen;
    },

    latestMaxHang(c) { return c.maxHang[c.maxHang.length-1] || null; }
  };
})();
