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

    const sw = CT.ui.clear(CT.ui.$('#switcher'));
    const people = [CT.world.coach, ...S.clients()];
    people.forEach(p => {
      sw.appendChild(el('button', {
        class: 'who', 'aria-pressed': String(CT.state.viewAs === p.id),
        onclick: () => {
          if (CT.state.viewAs === p.id) return;
          S.setUser(p.id);
          CT.go(p.id === 'coach' ? 'clients' : 'dashboard');
        }
      }, [
        el('span', { class: 'who__av', text: p.initials }),
        el('span', { class: 'who__name', text: p.name }),
        el('span', { class: 'who__role', text: p.role === 'coach' ? 'Coach' : 'Client' })
      ]));
    });

    /* quick logging belongs to the athlete, not the coach */
    const c = S.client();
    CT.ui.$('.rail__log').style.display = S.isCoach() ? 'none' : '';
    CT.ui.$$('.quick').forEach(b => {
      const type = b.dataset.log;
      b.style.display = (type === 'pe' && !S.inPEPhase(c)) ? 'none' : '';
      b.onclick = () => CT.openLog(type, {});
    });
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
    const coachViewing = S.isCoach() && CT.state.route !== 'clients';

    bar.appendChild(el('button', {
      class: 'btn btn--quiet railtoggle', 'aria-label': 'Menu',
      onclick: () => toggleRail()
    }, [ icon('people') ]));

    bar.appendChild(el('h1', { class: 'h-page', text: coachViewing ? `${c.name} · ${r.title}` : r.title }));

    if (CT.state.route !== 'clients') {
      bar.appendChild(el('span', { class: 'chip', style: 'margin-left:2px',
        text: `Week ${S.currentWeek(c)}/${c.block.weeks}` }));
    }

    bar.appendChild(el('span', { class: 'topbar__spacer' }));

    if (coachViewing) {
      bar.appendChild(el('div', { class: 'seg' }, S.clients().map(cl =>
        el('button', { text: cl.name, 'aria-pressed': String(cl.id === CT.state.activeClient),
          onclick: () => { CT.state.activeClient = cl.id; render(); } })
      )));
    }
  }

  /* ── the view ───────────────────────────────────────────── */
  function renderView(animated) {
    const host = CT.ui.$('#view');
    const c = S.client();
    const build = node => {
      /* coach context bar sits above the client's own screens */
      if (S.isCoach() && CT.state.route !== 'clients') {
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
    if (S.isCoach()) {
      toast('Coaches don’t log sessions', `Switch to ${c.name} in the corner to log on their behalf.`);
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

  /* ── boot ───────────────────────────────────────────────── */
  function boot() {
    lockGestures();
    const main = CT.ui.$('#main'), bar = CT.ui.$('#topbar');
    main.addEventListener('scroll', () => bar.classList.toggle('is-stuck', main.scrollTop > 4), { passive: true });
    CT.ui.$('#railScrim').addEventListener('click', () => toggleRail(false));

    render(false);

    /* First paint: the shell settles, then the content arrives.
       The rail is skipped on phones — there it's a drawer whose open and
       closed states are CSS transforms, and an inline transform left by a
       tween would outrank them and strand it off-screen. */
    if (motion.on) {
      const phone = window.matchMedia('(max-width: 900px)').matches;
      if (!phone) {
        gsap.from('.rail', { x: -14, opacity: 0, duration: .6, ease: 'power3.out', clearProps: 'transform,opacity' });
      }
      gsap.from('.topbar > *', { y: -8, opacity: 0, duration: .5, stagger: .05,
        ease: 'power3.out', delay: .1, clearProps: 'transform,opacity' });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
