/* ═══════════════════════════════════════════════════════════════
   store.js — in-memory state, derived selectors, mutations.
   No persistence: reload returns to the seeded world.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, dt = CT.dt;

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

    setUser(id) {
      state.viewAs = id;
      if (id !== 'coach') state.activeClient = id;
      state.weekOffset = 0;
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
       session keeps the load it was really performed at. */
    replay(c, excludeId) {
      const list = S.hangSessions(c).filter(s => s.id !== excludeId);
      const out = {};
      CT.GRIPS.forEach(g => {
        let weight = (c.startLoads || c.prescribed)[g.id], streak = 0;
        list.forEach(ses => {
          weight = ses.weights[g.id];
          streak = ses.reps[g.id].every(Boolean) ? streak + 1 : 0;
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
      const done = reps.every(r => r !== null);
      const clean = done && reps.every(r => r === true);
      const failed = reps.some(r => r === false);
      let streak = base.streak, weight = base.weight, earned = false;
      if (failed) streak = 0;
      else if (clean) {
        streak = base.streak + 1;
        if (streak >= CT.PROTOCOL.cleanTarget) { streak = 0; weight = base.weight + CT.PROTOCOL.increment; earned = true; }
      }
      return { done, clean, failed, streak, weight, earned, wasStreak: base.streak, baseWeight: base.weight };
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

    /* ── mutations ───────────────────────────────────────── */
    /* Logging a session on any date within the block. Attaches to a matching
       open slot on that date if one exists, otherwise creates one so the
       calendar and the log always agree. */
    logSession(c, session) {
      session.id = 'ses_' + Math.random().toString(36).slice(2, 9);
      c.sessions.push(session);

      let slot = c.slots.find(s => s.date === session.date && s.type === session.type && !s.sessionId);
      if (!slot) {
        slot = { id:'slot_' + Math.random().toString(36).slice(2,9), week: S.weekOf(c, session.date),
                 type: session.type, date: session.date, status:'completed', sessionId:null, adhoc:true };
        c.slots.push(slot);
      }
      slot.sessionId = session.id;
      slot.status = 'completed';

      if (session.type === 'strength') S.recomputeStrength(c);
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
        if (slot.adhoc) c.slots.splice(c.slots.indexOf(slot), 1);
        else slot.status = slot.date < dt.iso(dt.today()) ? 'missed' : 'suggested';
      }
      if (ses.type === 'strength') S.recomputeStrength(c);
      return true;
    },

    deleteBodyweight(c, iso) {
      const i = c.bodyweight.findIndex(b => b.date === iso);
      if (i < 0) return false;
      c.bodyweight.splice(i, 1);
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
      return true;
    },

    /* Only ever an unlogged slot. A completed one is removed by deleting
       the session behind it, which also puts the loads back. */
    removeSlot(c, slotId) {
      const i = c.slots.findIndex(s => s.id === slotId);
      if (i < 0 || c.slots[i].sessionId) return false;
      c.slots.splice(i, 1);
      return true;
    },

    /* Planning a future day places a placeholder, not a record — there is
       nothing to log until the session has actually happened. */
    addPlannedSlot(c, iso, type) {
      if (S.dayIsFull(c, iso)) return null;
      const slot = { id: 'slot_' + Math.random().toString(36).slice(2,9), week: S.weekOf(c, iso),
                     type, date: iso, status: 'suggested', sessionId: null };
      c.slots.push(slot);
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
          diff++;
        }
      }
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

    /* one reading per day — weighing yourself twice replaces the entry */
    logBodyweight(c, iso, kg) {
      const found = c.bodyweight.find(b => b.date === iso);
      if (found) found.kg = kg;
      else {
        c.bodyweight.push({ date: iso, kg });
        c.bodyweight.sort((a,b) => a.date < b.date ? -1 : 1);
      }
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
    latestMaxHang(c) { return c.maxHang[c.maxHang.length-1] || null; },
    latestCF(c) { return c.criticalForce[c.criticalForce.length-1] || null; }
  };
})();
