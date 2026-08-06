/* ═══════════════════════════════════════════════════════════════
   app.js — shell, routing, user switching.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion, toast, milestone } = CT.ui, S = CT.store, dt = CT.dt;

  const ROUTES = {
    clients:   { label: 'Clients',   icon: 'people',    coachOnly: true,  title: 'Clients' },
    dashboard: { label: 'Dashboard', icon: 'dashboard', title: 'Dashboard' },
    schedule:  { label: 'Schedule',  icon: 'calendar',  title: 'Schedule' },
    progress:  { label: 'Progress',  icon: 'chart',     title: 'Progress' }
  };

  /* ── navigation ─────────────────────────────────────────── */
  CT.go = function (route) {
    if (ROUTES[route] && ROUTES[route].coachOnly && !S.isCoach()) route = 'dashboard';
    /* changing page abandons whatever was open on top of it */
    if (CT.sheet) CT.sheet.close(true);
    CT.state.route = route;
    if (route === 'schedule') CT.state.weekOffset = 0;
    render();
    CT.ui.$('#main').scrollTop = 0;
    toggleRail(false);
  };

  function renderRail() {
    const nav = CT.ui.clear(CT.ui.$('#railNav'));
    Object.entries(ROUTES).forEach(([key, r]) => {
      if (r.coachOnly && !S.isCoach()) return;
      nav.appendChild(el('button', {
        class: 'navlink', onclick: () => CT.go(key),
        'aria-current': CT.state.route === key ? 'page' : null
      }, [ icon(r.icon), r.label ]));
    });

    /* Signed in, an athlete is only ever themselves — there is nobody to
       switch to and no pretending otherwise.

       A coach who trains is one entry, not two. Their own athlete
       record is what their dashboard, plan and progress screens are
       already built from, so "you" and "coach" are the same row: it
       selects their own training if they've set a block up, and their
       roster if they haven't. */
    const role = CT.repo.enabled && CT.repo.profile ? CT.repo.profile.role : null;
    const isClient = role === 'client';
    /* Signed in as a coach, picking an athlete changes whose record is
       on screen and nothing about who you are. With no backend there is
       no signed-in anybody, and the switcher's job is the older one of
       becoming each mock person in turn. */
    const isCoachAcct = role === 'coach';

    const sw = CT.ui.clear(CT.ui.$('#switcher'));
    const mine = S.selfAthlete();
    const people = isClient
      ? S.clients().map(p => ({ id: p.id, initials: p.initials, name: p.name, role: 'You' }))
      : [{ id: 'coach', initials: CT.world.coach.initials, name: CT.world.coach.name,
           role: mine ? 'You · coach' : 'Coach' }]
          .concat(S.roster().map(p => ({ id: p.id, initials: p.initials, name: p.name, role: 'Client' })));

    const selected = isClient ? CT.state.viewAs
      : !S.isCoach() ? CT.state.viewAs
      : S.viewingSelf() || CT.state.route === 'clients' ? 'coach' : CT.state.activeClient;

    people.forEach(p => {
      sw.appendChild(el('button', {
        class: 'who', 'aria-pressed': String(selected === p.id),
        disabled: isClient || null,
        onclick: () => {
          if (isClient) return;
          if (p.id === 'coach') {
            S.setUser('coach');
            /* their own training if there is any, otherwise the roster —
               there is nothing else the coach's own view could be */
            if (mine && S.setViewing(mine.id)) CT.go('dashboard');
            else CT.go('clients');
            return;
          }
          if (!isCoachAcct) { S.setUser(p.id); CT.go('dashboard'); return; }
          if (S.isCoach() && CT.state.activeClient === p.id && CT.state.route !== 'clients') return;
          S.setUser('coach');
          S.setViewing(p.id);
          CT.go('dashboard');
        }
      }, [
        el('span', { class: 'who__av', text: p.initials }),
        el('span', { class: 'who__name', text: p.name }),
        el('span', { class: 'who__role', text: p.role })
      ]));
    });

    /* The prototype's disclaimer is only honest in mock mode. Against a
       real backend the opposite is true: everything here is saved. */
    CT.ui.$('#mockNote').hidden = CT.CONFIG.live;

    /* Which build is on this device. Reported by the worker that served
       it rather than by the page, because the page is exactly what would
       be lying if something were stale. */
    const bn = CT.ui.$('#buildNote');
    bn.hidden = !CT.build;
    if (CT.build) bn.textContent = CT.build;

    /* Signed out is a state worth being able to reach; and when a write
       hasn't landed yet, say so rather than leaving it to be discovered. */
    const foot = CT.ui.$('.rail__foot');
    CT.ui.$$('.rail__auth', foot).forEach(n => n.remove());
    if (CT.repo.enabled) {
      foot.appendChild(el('div', { class: 'rail__auth' }, [
        el('p', { id: 'syncDot', class: 'rail__sync' + (CT.repo.syncing ? ' is-syncing' : '') },
          [ el('span', { class: 'rail__syncdot' }),
            el('span', { text: CT.repo.syncing ? 'Saving…' : 'All saved' }) ]),
        deviceButton(),
        signOutButton()
      ]));
    }

    /* quick logging belongs to whoever's record is on screen — which is
       the coach's own, when that's what they're looking at */
    const c = S.client();
    CT.ui.$('.rail__log').style.display = (!S.canLog() || !c) ? 'none' : '';
    CT.ui.$$('.quick').forEach(b => {
      const type = b.dataset.log;
      b.style.display = (!c || (type === 'pe' && !S.inPEPhase(c))) ? 'none' : '';
      b.onclick = () => CT.openLog(type, {});
    });
  }

  /* Because an athlete's account *is* this browser, a laptop is not the
     same person signing in again — it is a second account, a stranger
     to the record, and the code that let the phone in was spent the day
     it was typed. So the way to a second screen is six more digits
     minted from the screen that already works.

     A coach needs none of this: theirs is the one account with an
     address on it and they sign in on the laptop the ordinary way. */
  function deviceButton() {
    const anon = CT.repo.user && CT.repo.user.isAnonymous;
    const c = anon && S.client();
    if (!c) return null;
    return el('button', { class: 'btn btn--quiet btn--sm',
      style: 'width:100%;justify-content:flex-start', text: 'Use on another device',
      onclick: () => { toggleRail(false); CT.views.deviceCode(c, { mine: true }); } });
  }

  /* An athlete's account has no address and no password on it — this
     device is the whole of their identity. Signing out throws it away,
     and the way back is a code: a device code from another screen they
     still hold, or a fresh one from their coach if this was the only
     one. Either way it is not a thing they can undo by themselves in
     the next ten seconds, so the button arms first and says so. A coach
     can sign back in whenever they like, so theirs stays a button.

     Same arm-then-confirm as removing a session from a plan. */
  function signOutButton() {
    const anon = CT.repo.user && CT.repo.user.isAnonymous;
    const b = el('button', { class: 'btn btn--quiet btn--sm',
      style: 'width:100%;justify-content:flex-start', text: 'Sign out' });
    if (!anon) { b.onclick = () => CT.signOut(); return b; }

    let armed = false, timer = null;
    b.onclick = () => {
      if (armed) { CT.signOut(); return; }
      armed = true;
      b.textContent = 'Tap again — you’ll need a new code';
      b.classList.add('is-armed');
      motion.pop(b, .97);
      clearTimeout(timer);
      timer = setTimeout(() => {
        armed = false;
        b.textContent = 'Sign out';
        b.classList.remove('is-armed');
      }, 4000);
    };
    return b;
  }

  /* Phone navigation. Same routes as the rail, plus the log action that
     lives in the sidebar on desktop. CSS hides it above 900px. */
  function renderTabs() {
    const bar = CT.ui.clear(CT.ui.$('#tabbar'));
    const tab = (key, label, ic) => el('button', {
      class: 'tab', onclick: () => CT.go(key),
      'aria-current': CT.state.route === key ? 'page' : null
    }, [ icon(ic), el('span', { text: label }) ]);

    if (S.isCoach()) {
      bar.appendChild(tab('clients', 'Clients', 'people'));
      bar.appendChild(tab('dashboard', 'Home', 'dashboard'));
      /* The log button is only ever offered where a log can land */
      if (S.canLog()) bar.appendChild(el('button', {
        class: 'tab tab--log', 'aria-label': 'Log a session',
        onclick: () => CT.openLog(null, {})
      }, [ icon('plus') ]));
      bar.appendChild(tab('schedule', 'Plan', 'calendar'));
      bar.appendChild(tab('progress', 'Progress', 'chart'));
      return;
    }

    bar.appendChild(tab('dashboard', 'Home', 'dashboard'));
    bar.appendChild(tab('schedule', 'Plan', 'calendar'));
    bar.appendChild(el('button', {
      class: 'tab tab--log', 'aria-label': 'Log a session',
      onclick: () => CT.openLog(null, {})
    }, [ icon('plus') ]));
    bar.appendChild(tab('progress', 'Progress', 'chart'));
    bar.appendChild(el('button', {
      class: 'tab', 'aria-label': 'Switch user',
      onclick: () => toggleRail(true)
    }, [ icon('people'), el('span', { text: 'You' }) ]));
  }

  function toggleRail(open) {
    const rail = CT.ui.$('#rail'), scrim = CT.ui.$('#railScrim');
    const show = open === undefined ? !rail.classList.contains('is-open') : open;
    rail.classList.toggle('is-open', show);
    scrim.hidden = !show;
  }
  CT.toggleRail = toggleRail;

  function renderTopbar() {
    const bar = CT.ui.clear(CT.ui.$('#topbar'));
    const r = ROUTES[CT.state.route] || ROUTES.dashboard;
    const c = S.client();
    /* Looking at somebody else's record — as opposed to their own,
       which needs no framing at all */
    const coachViewing = S.isCoach() && CT.state.route !== 'clients' && !S.viewingSelf();

    bar.appendChild(el('button', {
      class: 'btn btn--quiet railtoggle', 'aria-label': 'Menu',
      onclick: () => toggleRail()
    }, [ icon('people') ]));

    bar.appendChild(el('h1', { class: 'h-page', text: coachViewing && c ? `${c.name} · ${r.title}` : r.title }));

    if (CT.state.route !== 'clients' && c) {
      bar.appendChild(el('span', { class: 'chip', style: 'margin-left:2px',
        text: `Week ${S.currentWeek(c)}/${c.block.weeks}` }));
    }

    bar.appendChild(el('span', { class: 'topbar__spacer' }));

    /* Whose record these screens are showing. The coach's own sits at
       the front labelled "You", because that is the one they'll be
       coming back to. */
    if (S.isCoach() && CT.state.route !== 'clients') {
      const mine = S.selfAthlete();
      const entries = (mine ? [{ id: mine.id, label: 'You' }] : [])
        .concat(S.roster().map(cl => ({ id: cl.id, label: cl.name })));
      if (entries.length > 1) {
        bar.appendChild(el('div', { class: 'seg' }, entries.map(e =>
          el('button', { text: e.label, 'aria-pressed': String(e.id === CT.state.activeClient),
            onclick: () => { if (S.setViewing(e.id)) render(); } })
        )));
      }
    }
  }

  /* ── the view ───────────────────────────────────────────── */
  function renderView(animated) {
    const host = CT.ui.$('#view');
    const c = S.client();
    const build = node => {
      /* Nobody to show. A coach hasn't onboarded anyone yet; an athlete
         is signed in but their coach hasn't invited this address, or
         hasn't finished setting them up. */
      if (!c && CT.state.route !== 'clients') {
        const coachSide = S.isCoach();
        node.appendChild(el('div', { class: 'card empty' }, [
          el('h3', { text: coachSide ? 'No athletes yet' : 'Nothing here yet' }),
          el('p', { text: coachSide
            ? 'Onboard an athlete from the Clients screen and their block appears here.'
            : 'Your coach hasn’t set up a block on this email address yet. It’ll appear here the moment they do — no need to sign in again.' }),
          coachSide
            ? el('button', { class: 'btn btn--primary', style: 'margin-top:16px',
                text: 'Go to Clients', onclick: () => CT.go('clients') })
            : null
        ]));
        return;
      }

      /* Coach context bar sits above a *client's* screens. Their own
         training needs no explaining to them, so it stays off there. */
      if (S.isCoach() && CT.state.route !== 'clients' && !S.viewingSelf()) {
        node.appendChild(el('div', { class: 'asbar', style: 'margin:0 0 16px' }, [
          el('span', { class: 'asbar__pill', text: 'Coach view' }),
          el('span', { text: `You're looking at ${c.full}'s ${ROUTES[CT.state.route].title.toLowerCase()}. Logging is disabled here.` }),
          el('button', { text: 'Back to clients', onclick: () => CT.go('clients') })
        ]));
      }
      const inner = el('div');
      node.appendChild(inner);
      const view = CT.state.route === 'clients' ? CT.views.coach
                 : CT.views[CT.state.route] || CT.views.dashboard;
      view(inner, c);
    };
    if (animated) motion.swap(host, build);
    else { CT.ui.clear(host); build(host); }
  }

  function render(animated) {
    renderRail();
    renderTabs();
    renderTopbar();
    renderView(animated !== false);
  }
  CT.render = render;

  /* ── log entry points ───────────────────────────────────── */
  CT.openLog = function (type, opts) {
    const c = S.client();
    if (!c) {
      toast('No block set up yet', 'There’s nothing to log against until your coach starts one.');
      return;
    }
    /* You log on your own record. A coach has one of those too — this
       only ever stops them typing into somebody else's. */
    if (!S.canLog()) {
      const mine = S.selfAthlete();
      toast(`This is ${c.name}’s record`, mine
        ? 'Switch to your own training in the corner to log a session.'
        : 'Set up your own block from the Clients screen to log your training.');
      return;
    }
    opts = opts || {};
    if (opts.sessionId) {                      // editing an existing session
      const ses = S.session(c, opts.sessionId);
      if (!ses) return;
      type = ses.type;
    }
    if (!type)                    CT.views.chooseLog(c, opts);
    else if (type === 'strength') CT.views.strengthLog(c, opts);
    else                          CT.views.sessionLog(c, type, opts);
  };

  /* after any save: refresh, then celebrate quietly if a week just landed */
  CT.afterLog = function (c, streakBefore) {
    render(false);
    const now = S.streak(c);
    if (now <= streakBefore) return;
    const isMilestone = S.milestones.includes(now);
    setTimeout(() => {
      if (isMilestone) milestone(now, 'weeks on target', 'Every week since ' + dt.mini(S.weekStart(c, S.currentWeek(c) - now + 1)));
      else toast(`Week ${S.currentWeek(c)} complete`, `${now} ${now === 1 ? 'week' : 'weeks'} on target.`);
    }, 700);
  };

  /* ── installed app ──────────────────────────────────────────
     Only when launched from the home screen. A browser tab keeps its
     pinch zoom and its pull-to-refresh — taking those away from a page
     someone is merely visiting would be hostile. */
  function lockGestures() {
    const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];
    const installed = window.navigator.standalone === true ||
      (window.matchMedia && modes.some(m => window.matchMedia(`(display-mode: ${m})`).matches));
    if (!installed) return;

    document.documentElement.classList.add('is-pwa');

    const vp = CT.ui.$('meta[name="viewport"]');
    if (vp) vp.setAttribute('content',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');

    /* iOS honours neither `user-scalable` nor `touch-action` for pinch in
       standalone, so the gesture events get refused directly. */
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(t =>
      document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  }

  /* ── which screen the whole app is on ────────────────────
     Three states, and only ever one of them: the sign-in card, a quiet
     loading state, or the app itself. */
  function screen(name, build) {
    const authHost = CT.ui.$('#authHost'), app = CT.ui.$('#app'), tabs = CT.ui.$('#tabbar');
    const showApp = name === 'app';
    app.hidden = !showApp;
    tabs.hidden = !showApp;
    authHost.hidden = showApp;
    if (!showApp) { CT.ui.clear(authHost); build(authHost); }
  }

  function showSignIn(opts) {
    if (CT.sheet) CT.sheet.close(true);
    screen('auth', host => CT.views.signin(host, opts || {}));
  }

  function showLoading(text) {
    screen('auth', host => host.appendChild(
      el('div', { class: 'authwrap' }, [
        el('div', { class: 'authcard authcard--quiet' }, [
          el('p', { class: 'eyebrow', text: 'Coach' }),
          el('p', { class: 'authcard__s', style: 'margin-top:10px', text: text || 'Loading…' })
        ])
      ])
    ));
  }

  /* ── who the signed-in person is ─────────────────────────
     A coach lands on their roster; an athlete lands on their own
     dashboard and never sees anyone else's. */
  function enterApp() {
    const p = CT.repo.profile;
    if (p) {
      const ids = Object.keys(CT.world.clients);
      if (p.role === 'client') {
        /* null, not 'coach' — an athlete whose record their coach hasn't
           finished must not fall through into the coach's screens */
        const mine = p.athleteId && CT.world.clients[p.athleteId] ? p.athleteId : ids[0] || null;
        CT.state.viewAs = mine;
        CT.state.activeClient = mine;
        if (CT.state.route === 'clients') CT.state.route = 'dashboard';
      } else {
        CT.state.viewAs = 'coach';
        /* A coach lands on their own training if they have any — their
           dashboard is their dashboard. Failing that, on the first
           athlete they coach. */
        const mine = S.selfAthlete(), roster = S.roster();
        if (!CT.state.activeClient || !CT.world.clients[CT.state.activeClient]) {
          CT.state.activeClient = (mine && mine.id) || (roster[0] && roster[0].id) || ids[0] || null;
        }
        CT.state.route = ids.length ? CT.state.route : 'clients';
      }
    }
    screen('app');
    render(false);
    firstPaint();
  }

  function firstPaint() {
    /* The shell settles, then the content arrives. The rail is skipped on
       phones — there it's a drawer whose open and closed states are CSS
       transforms, and an inline transform left by a tween would outrank
       them and strand it off-screen. */
    if (!motion.on) return;
    const phone = window.matchMedia('(max-width: 900px)').matches;
    if (!phone) {
      gsap.from('.rail', { x: -14, opacity: 0, duration: .6, ease: 'power3.out', clearProps: 'transform,opacity' });
    }
    gsap.from('.topbar > *', { y: -8, opacity: 0, duration: .5, stagger: .05,
      ease: 'power3.out', delay: .1, clearProps: 'transform,opacity' });
  }

  CT.signOut = async function () {
    try { await CT.fb.fn.signOut(CT.fb.auth); }
    catch (e) { toast('Couldn’t sign out', CT.fb.message(e)); }
  };

  /* ── which of the three states this account is in ─────────
     Called by the auth listener, and again by hand the moment a code is
     spent: nothing about the *account* changed there, so Firebase has
     no reason to fire, but everything about what it can reach did. */
  async function onUser(user) {
    if (!user) {
      CT.repo.stop();
      /* An athlete's identity is this device. There is no address to
         type and no password to forget — the account is minted here,
         before they've done anything, so that the code they're about to
         enter has somewhere to attach itself. It then lives in IndexedDB
         and is why they only enter it once.

         One account per device, not per visit: a restored session skips
         this entirely. */
      showLoading('Opening your training…');
      try { await CT.fb.fn.signInAnon(CT.fb.auth); }
      catch (e) {
        console.error('[boot] anonymous sign-in:', e);
        showSignIn({ mode: 'code', error: CT.fb.message(e) });
      }
      return;                       // the listener fires again with the new account
    }

    showLoading('Loading your training…');
    let profile = null;
    try {
      profile = await CT.repo.start(user);
    } catch (e) {
      console.error('[boot] repo start:', e);
      toast('Couldn’t load your training', CT.fb.message(e));
    }

    /* Signed in with nowhere to land. For an athlete that means no code
       has been spent on this device, and the code screen is both the
       explanation and the fix. For a named account it means no coach
       profile was ever created, which only a console can put right —
       showing that person a keypad would send them round a loop. */
    if (!profile) {
      if (CT.sheet) CT.sheet.close(true);
      screen('auth', h => user.isAnonymous
        ? CT.views.signin(h, {})
        : CT.views.noAccess(h, user));
      return;
    }

    /* A profile, and nothing it can reach. Since a profile is only ever
       written by spending a code, this means the coach has since issued
       another one and this device is no longer the athlete it was. The
       remedy is the new code, so ask for it — an empty dashboard would
       just be a dead end wearing the app's clothes.

       Gated on the roster having actually answered: an empty world
       four seconds into a cold start with no signal is a slow query,
       not a revoked athlete, and must not throw anyone out. */
    if (profile.role === 'client' && CT.repo.rosterLoaded && !Object.keys(CT.world.clients).length) {
      if (CT.sheet) CT.sheet.close(true);
      screen('auth', h => CT.views.signin(h, { lost: true }));
      return;
    }

    enterApp();
  }

  /* The sign-in screen calls this once a code has been redeemed. */
  CT.reenter = () => onUser(CT.fb.auth.currentUser);

  /* Ask the worker serving this page what it is. No answer — no worker
     yet, or a browser that has never installed one — is not a failure
     and simply shows nothing. */
  function readBuild() {
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!sw) return;
    let done = false;
    const ch = new MessageChannel();
    ch.port1.onmessage = e => {
      if (done) return;
      done = true;
      CT.build = (e.data && e.data.version) || null;
      if (CT.ui.$('#buildNote')) renderRail();
    };
    setTimeout(() => { done = true; }, 2000);
    try { sw.postMessage({ type: 'version' }, [ch.port2]); } catch (e) { /* no worker to ask */ }
  }

  /* ── boot ───────────────────────────────────────────────── */
  async function boot() {
    lockGestures();
    readBuild();
    const main = CT.ui.$('#main'), bar = CT.ui.$('#topbar');
    main.addEventListener('scroll', () => bar.classList.toggle('is-stuck', main.scrollTop > 4), { passive: true });
    CT.ui.$('#railScrim').addEventListener('click', () => toggleRail(false));

    /* No backend configured: the seeded world, in memory, as ever. */
    if (!CT.CONFIG.live) { enterApp(); return; }

    showLoading('Opening your training…');
    try {
      await CT.fb.init();
    } catch (e) {
      console.error('[boot] firebase init:', e);
      showLoading('Couldn’t reach the server. Reload when you have a connection.');
      return;
    }

    /* Fires on load with the restored session, and again on every sign-in
       and sign-out for the life of the tab. */
    CT.fb.fn.onAuthStateChanged(CT.fb.auth, onUser);

    /* The sync indicator lives in the rail, so it repaints with it. */
    CT.repo.onSync = () => { if (CT.ui.$('#syncDot')) renderRail(); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
