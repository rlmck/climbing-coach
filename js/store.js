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
    /* No backend means no shared lengths — every route keeps whatever
       the guidebook shipped with, and a length typed against a blank
       one counts for that session and goes no further. */
    loadRouteLengths: async () => {}, saveRouteLength() {},
    saveProfile: () => null,
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
    /* A coach may log on any record they hold, their own included.
       Sessions happen in front of them — a hangboard session they
       counted the reps of, a 4×4 they timed — and the athlete who did
       it is on the wall rather than on their phone. Refusing the entry
       didn't protect anything; it just meant the session went in late
       or not at all.

       Nothing about reach changes. A coach is already a member of every
       record they created, and membership is the only check the sessions
       collection has ever made, so this is the app catching up with the
       rules rather than the rules being widened. An athlete is still
       only ever themselves.

       What a log still needs is somewhere to land, which is a question
       about the screen rather than about permission. The roster shows
       every athlete and singles out none of them: the record
       `activeClient` happens to be holding there is navigation state
       the screen has never said out loud, so a quick-log button on it
       would file against somebody the coach can't see. Everywhere else
       the record is named on screen and the button is honest. */
    logTarget() { return state.route === 'clients' ? null : S.client() || null; },

    /* Writing into somebody else's record rather than your own. Asked
       of the record being written to, not of whatever the navigation
       last selected — every sheet is handed the record it serves
       precisely so it can serve any of them, and two can be on screen
       at once. Falls back to the record on screen for the callers that
       are asking about the view itself. */
    forOther(c) {
      const r = c || S.client();
      return S.isCoach() && !!r && !r.isSelf;
    },

    /* "your" or "Maks’s" — the possessive the log flows need, in the
       two capitalisations a sentence needs it in. Both live here so
       that no call site has to reconstruct one from the other, and both
       resolve the record the same way `forOther` does. */
    whose(c) { const r = c || S.client(); return S.forOther(r) ? r.name + '’s' : 'your'; },
    Whose(c) { const r = c || S.client(); return S.forOther(r) ? r.name + '’s' : 'Your'; },

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
    /* Which week of the block a date falls in, counting past both ends:
       0 and below is before it opened, above `weeks` is after it shut.
       The schedule needs the honest number so it can walk to a session
       logged outside the block and actually find it there. */
    weekIndex(c, iso) {
      return Math.floor(dt.diff(iso, c.block.start) / 7) + 1;
    },
    /* The same question asked of the plan, which only has the weeks it
       has. Everything that indexes into targets, phases or the ribbon
       wants this one. */
    weekOf(c, iso) {
      return Math.max(1, Math.min(c.block.weeks, S.weekIndex(c, iso)));
    },
    inBlock(c, w) { return w >= 1 && w <= c.block.weeks; },
    currentWeek(c) { return S.weekOf(c, dt.iso(dt.today())); },

    /* Where the phases sit, asked of the length rather than of a stored
       number. `block.peFromWeek` used to be written alongside the dates
       and is still on every athlete onboarded before this — it is not
       read anywhere, because the moment an end date moves it is wrong.
       See CT.BLOCK for the shape it is derived from. */
    peFromWeek(c) { return CT.BLOCK.peFromWeek(c.block.weeks); },
    restFromWeek(c) { return CT.BLOCK.deloadFromWeek(c.block.weeks); },
    isRestWeek(c, w) { return w >= S.restFromWeek(c) && w <= c.block.weeks; },
    /* The Monday the block is aimed at — the day after it ends, never a
       day inside it. */
    peakDate(c) { return CT.BLOCK.peakAfter(c.block.end); },

    phaseOfWeek(c, w) {
      if (S.isRestWeek(c, w)) return 'Rest';
      return w >= S.peFromWeek(c) ? 'Power Endurance' : 'Base';
    },
    phase(c) { return S.phaseOfWeek(c, S.currentWeek(c)); },
    inPEPhase(c) { return S.phase(c) === 'Power Endurance'; },

    /* What the plan asks for in a given week, by type. One question with
       one answer, because three screens and the target editor were each
       working it out from `peFromWeek` on their own and the rest week
       would have had to be added to all four. */
    prescribed(c, w, type) {
      if (S.isRestWeek(c, w)) return 0;
      if (type === 'pe' && w < S.peFromWeek(c)) return 0;
      return c.targets[type] || 0;
    },
    weekStart(c, w) { return dt.addISO(c.block.start, (w - 1) * 7); },

    /* ── slots / sessions ────────────────────────────────── */
    slotsInWeek(c, w) {
      const a = S.weekStart(c, w), b = dt.addISO(a, 6);
      return c.slots.filter(s => s.date >= a && s.date <= b).sort((x,y) => x.date < y.date ? -1 : 1);
    },
    /* A day's sessions in the order they will be done. Two can share a
       day and which one comes first is a real decision — hangboarding
       before a route session is not the same afternoon as the other way
       round — so `order` records it rather than leaving it to whatever
       order the documents happened to arrive in.

       Blank is not zero here either. `order` is absent on everything
       planned before it existed, and absent means "never placed": those
       keep the order they arrived in, behind anything that was. One drag
       gives a day explicit positions for good. */
    slotsOn(c, iso) {
      const rank = s => typeof s.order === 'number' ? s.order : null;
      return c.slots.filter(s => s.date === iso).sort((a, b) => {
        const x = rank(a), y = rank(b);
        if (x === null) return y === null ? 0 : 1;
        return y === null ? -1 : x - y;
      });
    },

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
      const count = type => slots.filter(s => s.type === type && S.slotStatus(c,s) === 'completed').length;
      /* The rest week asks for nothing, so it needs nothing: `need` is
         0, `hit` is true, and a streak carries through it. Resting when
         the plan says rest is the week being done, not skipped. */
      const req = { strength: S.prescribed(c, w, 'strength'),
                    endurance: S.prescribed(c, w, 'endurance'),
                    pe: S.prescribed(c, w, 'pe') };
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

    /* Which day a session sits on, and where in that day. `index` is a
       position among the destination's sessions — 0 puts it first —
       and null appends, which is what moving a day left or right means.
       Passing the day it is already on is a reorder, not a move.

       Every slot whose position actually changed is written, and only
       those: renumbering a day of two costs at most two documents. */
    placeSlot(c, slotId, toISO, index) {
      const slot = c.slots.find(s => s.id === slotId);
      if (!slot) return false;
      const fromISO = slot.date;
      if (fromISO !== toISO && S.dayIsFull(c, toISO, slotId)) return false;

      slot.date = toISO;
      slot.week = S.weekOf(c, toISO);
      const ses = slot.sessionId && S.session(c, slot.sessionId);
      if (ses) ses.date = toISO;

      const line = S.slotsOn(c, toISO).filter(s => s.id !== slotId);
      const at = index == null ? line.length : Math.max(0, Math.min(line.length, index));
      line.splice(at, 0, slot);

      /* The slot itself is always written — its date moved even when its
         position in the day didn't. */
      const dirty = new Set([slot]);
      line.forEach((s, i) => { if (s.order !== i) { s.order = i; dirty.add(s); } });

      /* The day it left closes the gap behind it, so nothing keeps a
         position there is no longer anything holding open. */
      if (fromISO !== toISO) {
        S.slotsOn(c, fromISO).forEach((s, i) => { if (s.order !== i) { s.order = i; dirty.add(s); } });
      }

      dirty.forEach(s => CT.repo.saveSlot(c, s));
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
                     type, date: iso, status: 'suggested', sessionId: null,
                     /* Last in the day it lands on — a session added to a
                        day is one added after what's already there. One
                        past the highest rather than a count, because
                        removing a slot leaves the gap it was in, and two
                        sessions sharing a number is the one thing the
                        sort can't resolve. */
                     order: S.slotsOn(c, iso).reduce((n, s) => Math.max(n, (s.order || 0) + 1), 0) };
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
        S._fitWeek(c, w, key);
      }
      CT.repo.saveAthlete(c, { targets: c.targets });
    },

    /* Make one week hold what the plan asks of it for one type, without
       touching anything logged. Adding and removing are the same job
       from opposite ends, and both a target change and a change of end
       date need it. */
    _fitWeek(c, w, key) {
      let diff = S.prescribed(c, w, key) - c.slots.filter(s => s.week === w && s.type === key).length;
      while (diff > 0) { if (!S._addSlot(c, w, key)) break; diff--; }
      while (diff < 0) {
        const spare = c.slots.filter(s => s.week === w && s.type === key && !s.sessionId).pop();
        if (!spare) break;
        c.slots.splice(c.slots.indexOf(spare), 1);
        CT.repo.deleteSlot(c, spare.id);
        diff++;
      }
    },

    /* ── moving the peak ─────────────────────────────────────
       A coach knows the date before they know the length: the trip, the
       comp, the weekend the conditions come good. So the block is set by
       saying which Monday it is for, and the length falls out of that.

       Everything downstream follows — the phase is derived from the
       length, so pulling the peak two weeks in re-reads which weeks are
       power endurance and which is the rest, and the plan is re-fitted
       to match. Only unlogged slots from the current week on move, the
       same rule a target change follows: history is history, and a week
       somebody has already dragged into shape stays that shape.

       Weeks that fall off the far end lose their suggestions and keep
       their sessions. A block is a plan, not a fence — nothing logged is
       ever unlogged by a date moving. */
    setPeak(c, peakISO) {
      const weeks = CT.BLOCK.weeksTo(c.block.start, peakISO);
      if (!(weeks >= CT.BLOCK.minWeeks && weeks <= CT.BLOCK.maxWeeks)) return null;
      if (dt.diff(peakISO, c.block.start) % 7 !== 0) return null;   // must be a Monday of the block
      if (weeks === c.block.weeks) return null;

      const was = c.block.weeks;
      c.block.weeks = weeks;
      c.block.end = CT.BLOCK.endBefore(peakISO);
      /* No longer derived from, and no longer written — but an old
         record still carries it, and a stale number sitting next to the
         dates it disagrees with is worth clearing on the way past. */
      delete c.block.peFromWeek;

      /* Every week that could have changed shape: the ones still in the
         block from here on, plus the ones that just left it. */
      const last = Math.max(was, weeks);
      for (let w = S.currentWeek(c); w <= last; w++) {
        if (w > weeks) {
          c.slots.filter(s => s.week === w && !s.sessionId).forEach(spare => {
            c.slots.splice(c.slots.indexOf(spare), 1);
            CT.repo.deleteSlot(c, spare.id);
          });
          continue;
        }
        /* A week the block has only just grown into has nothing in it,
           so it is laid out from the template — the days the coach
           picked, not wherever the spreader happens to find room. */
        if (!S.isRestWeek(c, w) && !c.slots.some(s => s.week === w)) S._templateWeek(c, w);
        ['strength', 'endurance', 'pe'].forEach(key => S._fitWeek(c, w, key));
      }

      CT.repo.saveAthlete(c, { block: c.block });
      return weeks;
    },

    /* A week laid out the way onboarding lays one out: the template's
       day offsets, in the template's order. */
    _templateWeek(c, w) {
      const t = c.template || {};
      const wkStart = S.weekStart(c, w);
      ['strength', 'endurance', 'pe'].forEach(key => {
        if (!S.prescribed(c, w, key)) return;
        (t[key] || []).slice(0, S.prescribed(c, w, key))
          .forEach(o => S.addPlannedSlot(c, dt.addISO(wkStart, o), key));
      });
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
    /* Weekly volume by type, across the whole block. Counts every
       completed slot where it landed. Climbing folds into endurance
       here — both are what happens on route or boulder terrain, and
       the volume chart reads better as the three types the block is
       actually built from (see weekProgress) than as a fourth bar
       most weeks don't have. The drill-down (typeBreakdown) keeps the
       distinction, so nothing about it is actually lost. */
    blockVolume(c) {
      const weeks = [];
      let total = 0, activeWeeks = 0;
      for (let w = 1; w <= c.block.weeks; w++) {
        const slots = S.slotsInWeek(c, w).filter(s => S.slotStatus(c, s) === 'completed');
        const counts = { strength: 0, endurance: 0, pe: 0 };
        slots.forEach(s => {
          const key = s.type === 'climbing' ? 'endurance' : s.type;
          if (counts[key] != null) counts[key]++;
        });
        const wTotal = counts.strength + counts.endurance + counts.pe;
        if (wTotal) activeWeeks++;
        total += wTotal;
        weeks.push({ w, start: S.weekStart(c, w), counts, total: wTotal });
      }
      return { weeks, total, activeWeeks };
    },

    /* What one type's sessions actually were, across the same block
       weeks blockVolume counts — so a breakdown's total always matches
       the bar it was drilled down from.

       Strength has no modality and a different shape of detail
       entirely — reps and clean count per grip, not a session count —
       so it gets its own shape of answer (kind:'strength'). Everything
       else answers with a modality split (kind:'modality') plus
       whatever of metres/duration those sessions actually recorded.
       Selecting 'endurance' pulls in climbing sessions too — see
       blockVolume — labelled apart so the split survives the merge. */
    typeBreakdown(c, type) {
      if (type === 'strength') return S._strengthBreakdown(c);

      const includeTypes = type === 'endurance' ? ['endurance', 'climbing'] : [type];
      const groups = {};
      let total = 0, metres = 0, durationSec = 0, rpeSum = 0, rpeCount = 0;
      const bySet = {};
      for (let w = 1; w <= c.block.weeks; w++) {
        S.slotsInWeek(c, w).forEach(slot => {
          if (includeTypes.indexOf(slot.type) < 0 || !slot.sessionId || S.slotStatus(c, slot) !== 'completed') return;
          const ses = S.session(c, slot.sessionId);
          if (!ses) return;
          const fromClimbing = slot.type === 'climbing';
          const modKey = ses.modality || 'other';
          const mod = (CT.MODALITIES[slot.type] || []).find(x => x.id === modKey);
          const key = (fromClimbing ? 'climb:' : '') + modKey;
          if (!groups[key]) groups[key] = { label: (fromClimbing ? 'Climb — ' : '') + (mod ? mod.name : 'Other'), count: 0 };
          groups[key].count++;
          total++;
          const f = ses.fields || {};
          /* The distance box is optional and a blank one is not a
             zero — but a session whose rows came out of the guidebook
             knows how far it went whether or not anybody typed it, and
             a block total that counted only the typed ones would read
             as the honest sum of both. */
          if (typeof f.metres === 'number') metres += f.metres;
          else if (Array.isArray(f.climbs)) metres += CT.climbs.metres(f.climbs);
          if (typeof f.durationSec === 'number') durationSec += f.durationSec;
          const r = CT.rpeValue(f.rpe);
          if (r != null) { rpeSum += r; rpeCount++; }
          /* Only the modalities that log a list of climbs (routes,
             boulder 4×4s, long problems, and both climbing styles)
             have anything to add here. Traversing and intervals do
             record a grade, but it is the grade of the terrain being
             circuited rather than of anything sent, and a lap on it
             is not an ascent that should win "hardest". Kept apart by
             ladder for the same reason a route grade and a boulder
             grade aren't the same "hardest" either. */
          const climbed = CT.climbs.rowsOf(ses);
          if (climbed) (bySet[climbed.set] || (bySet[climbed.set] = [])).push(...climbed.rows);
        });
      }
      const rows = Object.keys(groups)
        .map(key => ({ key, label: groups[key].label, count: groups[key].count }))
        .sort((a, b) => b.count - a.count);
      const climbRows = Object.keys(bySet).reduce((a, k) => a.concat(bySet[k]), []);
      return {
        kind: 'modality', total, rows, metres, durationSec,
        climbs: CT.climbs.total(climbRows),
        venues: CT.climbs.venues(climbRows),
        hardestRoute: CT.climbs.hardest(bySet.route, 'route'),
        hardestBoulder: CT.climbs.hardest(bySet.boulder, 'boulder'),
        avgRpe: rpeCount ? +(rpeSum / rpeCount).toFixed(1) : null
      };
    },

    /* Reps and clean count per grip, hangboard sessions only — a limit
       day has no grip to report against, so it's summarised apart:
       how many, how many attempts, how many sent, and the hardest
       problem in the mix (CT.topGrade already answers "hardest" off a
       flat problem list, which is what a block's worth of sessions
       flattens down to). */
    _strengthBreakdown(c) {
      let total = 0, hangs = 0;
      const problems = [];
      const gripStats = {};
      CT.GRIPS.forEach(g => { gripStats[g.id] = { reps: 0, clean: 0 }; });
      for (let w = 1; w <= c.block.weeks; w++) {
        S.slotsInWeek(c, w).forEach(slot => {
          if (slot.type !== 'strength' || !slot.sessionId || S.slotStatus(c, slot) !== 'completed') return;
          const ses = S.session(c, slot.sessionId);
          if (!ses) return;
          total++;
          if (S.strengthMode(ses) === 'limit') {
            problems.push(...(ses.problems || []));
          } else {
            hangs++;
            CT.GRIPS.forEach(g => {
              const reps = S.repsOf(ses, g.id);
              gripStats[g.id].reps += reps.length;
              gripStats[g.id].clean += reps.filter(Boolean).length;
            });
          }
        });
      }
      /* How far the loads have moved, measured from wherever the
         replay starts them. That is normally the opening of the block,
         but a re-tested max moves the starting line (see replay) — so
         the date goes out alongside the number, and a fortnight's gain
         is never passed off as a block's. */
      const grips = CT.GRIPS.map(g => {
        const st = gripStats[g.id];
        const weight = (c.prescribed || {})[g.id];
        const startWeight = (c.startLoads || {})[g.id];
        return Object.assign({ id: g.id, name: g.name, short: g.short, weight,
          gained: (typeof weight === 'number' && typeof startWeight === 'number') ? +(weight - startWeight).toFixed(1) : null
        }, st);
      });
      const limit = { count: total - hangs,
        attempts: problems.reduce((a, p) => a + p.attempts, 0),
        sent: problems.filter(p => p.sent).length,
        topGrade: CT.topGrade(problems) };
      return { kind: 'strength', total, hangs, grips, limit,
        gainedFrom: c.loadsFrom && c.loadsFrom > c.block.start ? c.loadsFrom : null };
    },

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
