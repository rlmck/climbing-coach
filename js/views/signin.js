/* ═══════════════════════════════════════════════════════════════
   views/signin.js — the only screen you see before there's anything
   to show you.

   For an athlete it is six digits and nothing else: no address, no
   password, no confirmation email, no second screen. Their coach reads
   them a code, they type it once, and the anonymous account underneath
   remembers them from then on. Someone opening this in a gym car park
   with cold hands has one thing to get right, and their phone's keypad
   is already up.

   Coaches are the exception and are treated as one — an account with a
   name on it, tucked behind a quiet link, because a coach signs in far
   less often than the twelve people they look after.

   Entering a code needs a connection. It's the one thing here that
   does, and the screen says so, because "no internet" on a training app
   usually means "you've lost your session" and here it doesn't.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion } = CT.ui;

  const LEN = 6;

  const brand = () => el('div', { class: 'authcard__brand' }, [
    el('span', { class: 'mark', html:
      '<svg viewBox="0 0 24 24" fill="none"><path d="M3 20.5 9.2 6.2a1 1 0 0 1 1.83-.02L14 12.5l2.1-3.8a1 1 0 0 1 1.78.05L21 20.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
    el('span', { class: 'rail__wordmark', text: 'Coach' })
  ]);

  CT.views.signin = function (host, opts) {
    opts = opts || {};
    let mode = 'code';                            // 'code' | 'coach' | 'reset'
    let busy = false;

    const error = el('p', { class: 'authcard__err', hidden: true });
    const note  = el('p', { class: 'tiny' });

    function fail(msg) {
      error.textContent = msg;
      error.hidden = false;
      motion.shake(error);
    }
    function clearError() { error.hidden = true; }

    /* ═══════════════ the code ═══════════════
       One real input behind six drawn boxes. A single field is what
       makes paste, autofill and every mobile keyboard work without
       being taught to; the boxes are what make it read as a code. */
    const boxes = [];
    for (let i = 0; i < LEN; i++) boxes.push(el('span', { class: 'pinbox' }));

    const pinInput = el('input', {
      class: 'pinpad__in', type: 'text', inputmode: 'numeric', pattern: '[0-9]*',
      maxlength: String(LEN), autocomplete: 'one-time-code',
      'aria-label': 'Your six-digit code', spellcheck: 'false',
      oninput: e => {
        const v = e.target.value.replace(/\D/g, '').slice(0, LEN);
        e.target.value = v;
        paint();
        clearError();
        /* Six digits is the whole form. Waiting for a button press
           after the last one is a step that exists only to be tapped. */
        if (v.length === LEN) redeem();
      },
      onfocus: paint,
      onblur: paint
    });

    function paint() {
      const v = pinInput.value;
      const focused = document.activeElement === pinInput;
      boxes.forEach((b, i) => {
        b.textContent = v[i] || '';
        b.classList.toggle('is-filled', !!v[i]);
        b.classList.toggle('is-next', focused && i === Math.min(v.length, LEN - 1) && v.length < LEN);
      });
    }

    const pad = el('div', { class: 'pinpad', onclick: () => pinInput.focus() }, [
      el('div', { class: 'pinpad__boxes', 'aria-hidden': 'true' }, boxes),
      pinInput
    ]);

    const codeSubmit = el('button', { class: 'btn btn--primary', style: 'width:100%',
      onclick: () => redeem() }, [ icon('check'), 'Enter' ]);

    async function redeem() {
      if (busy) return;
      const pin = pinInput.value;
      if (pin.length !== LEN) return fail('Your code is six digits.');

      busy = true;
      codeSubmit.disabled = true;
      pad.classList.add('is-busy');
      const was = codeSubmit.textContent;
      codeSubmit.textContent = 'One moment…';

      try {
        /* The account this code attaches to. Usually it already exists —
           boot mints one the first time the app is opened — but a coach
           signing out on a shared phone leaves this screen with nobody
           signed in, and typing a code should still work. */
        if (!CT.fb.auth.currentUser) await CT.fb.fn.signInAnon(CT.fb.auth);
        await CT.repo.redeemPin(pin);
        await CT.reenter();
        return;                                   // the app has replaced this screen
      } catch (e) {
        fail(CT.fb.message(e));
        pinInput.value = '';
        paint();
        setTimeout(() => pinInput.focus({ preventScroll: true }), 40);
      } finally {
        busy = false;
        codeSubmit.disabled = false;
        pad.classList.remove('is-busy');
        codeSubmit.textContent = was;
      }
    }

    /* ═══════════════ the coach ═══════════════ */
    const emailInput = el('input', { class: 'input', type: 'email', id: 'authEmail',
      autocomplete: 'username', placeholder: 'you@example.com', oninput: clearError });
    const passInput = el('input', { class: 'input', type: 'password', id: 'authPass',
      autocomplete: 'current-password', placeholder: '••••••••', oninput: clearError });
    const passField = el('div', { class: 'field' }, [ el('label', { for: 'authPass', text: 'Password' }), passInput ]);
    const coachSubmit = el('button', { class: 'btn btn--primary', style: 'width:100%', onclick: () => coachGo() });

    async function coachGo() {
      if (busy) return;
      const email = emailInput.value.trim(), pass = passInput.value;
      if (!email) return fail('Enter your email address.');
      if (mode !== 'reset' && pass.length < 6) return fail('Passwords are at least six characters.');

      busy = true;
      coachSubmit.disabled = true;
      const was = coachSubmit.textContent;
      coachSubmit.textContent = mode === 'reset' ? 'Sending…' : 'One moment…';

      try {
        const { auth, fn } = CT.fb;
        if (mode === 'reset') {
          await fn.resetPassword(auth, email);
          setMode('coach');
          CT.ui.toast('Check your email', 'A link to set a new password is on its way to ' + email + '.');
        } else {
          /* Replaces whatever anonymous account was sitting here. That
             account was never anybody, so there is nothing to lose. */
          await fn.signIn(auth, email, pass);
        }
      } catch (e) {
        fail(CT.fb.message(e));
      } finally {
        busy = false;
        coachSubmit.disabled = false;
        coachSubmit.textContent = was;
      }
    }

    /* ═══════════════ the card ═══════════════ */
    const title = el('h1', { class: 'authcard__t' });
    const sub   = el('p', { class: 'authcard__s' });
    const codePane  = el('div', { class: 'stack', style: 'gap:18px;margin-top:26px' }, [ pad, error, codeSubmit, note ]);
    const coachPane = el('div', { class: 'stack', style: 'gap:14px;margin-top:26px' }, [
      el('div', { class: 'field' }, [ el('label', { for: 'authEmail', text: 'Email' }), emailInput ]),
      passField, coachSubmit, note
    ]);

    const swap   = el('button', { class: 'btn btn--quiet btn--sm', onclick: () => setMode(mode === 'code' ? 'coach' : 'code') });
    const forgot = el('button', { class: 'btn btn--quiet btn--sm', text: 'Forgot password',
      onclick: () => setMode(mode === 'reset' ? 'coach' : 'reset') });

    function setMode(m) {
      mode = m;
      clearError();
      const isCode = m === 'code';

      codePane.hidden  = !isCode;
      coachPane.hidden = isCode;
      /* error and note live in whichever pane is showing */
      (isCode ? codePane : coachPane).insertBefore(error, isCode ? codeSubmit : coachSubmit);
      (isCode ? codePane : coachPane).appendChild(note);

      passField.hidden = m === 'reset';
      coachSubmit.textContent = m === 'reset' ? 'Send reset link' : 'Sign in';

      title.textContent = isCode ? (opts.lost ? 'Ask for a new code' : 'Enter your code')
        : m === 'reset' ? 'Reset your password' : 'Coach sign-in';
      sub.textContent = isCode
        ? (opts.lost
            /* Their coach reissued, which unhooked this device. Said
               plainly, because the alternative — an empty dashboard —
               reads as the app being broken. */
            ? 'Your coach has issued a new code since you last opened this, so this phone has been signed out of your training. Nothing has been lost; the new code puts it back.'
            : 'Your coach has a six-digit code for you. You’ll only need it once — this phone remembers you afterwards.')
        : m === 'reset' ? 'We’ll email you a link to set a new password.'
        : 'The one account here with an address on it.';

      note.textContent = isCode
        ? 'Entering your code is the one thing here that needs a connection. Logging sessions doesn’t.'
        : m === 'reset' ? '' : 'Athletes don’t need this — they use a code.';

      swap.textContent = isCode ? 'I’m a coach' : 'I have a code';
      swap.hidden = m === 'reset';
      forgot.hidden = isCode;
      forgot.textContent = m === 'reset' ? 'Back to sign in' : 'Forgot password';

      setTimeout(() => (isCode ? pinInput : emailInput).focus({ preventScroll: true }), 60);
    }

    const card = el('div', { class: 'authcard' }, [
      brand(), title, sub, codePane, coachPane,
      el('div', { class: 'authcard__ft' }, [ swap, forgot ])
    ]);

    /* Enter submits from anywhere in the form */
    card.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      mode === 'code' ? redeem() : coachGo();
    });

    host.appendChild(el('div', { class: 'authwrap' }, [ card ]));
    setMode(opts.mode || 'code');
    if (opts.error) fail(opts.error);
    paint();
    motion.pop(card, .97);
  };

  /* ═══════════════ signed in, and still nowhere to go ═══════════════
     Only reachable on a coach's account whose profile was never created
     in the console — an athlete in this position is shown the code
     screen instead, because for them there is something to do about it.

     Deliberately not a failed sign-in. They did sign in; telling someone
     their password was wrong when it wasn't sends them round a loop. */
  CT.views.noAccess = function (host, user) {
    const who = (user && user.email) || 'this account';

    const card = el('div', { class: 'authcard' }, [
      brand(),
      el('h1', { class: 'authcard__t', text: 'This account isn’t set up' }),
      el('p', { class: 'authcard__s', html:
        `You’re signed in as <b>${who}</b>, but there’s no coach profile against it.` }),
      el('p', { class: 'authcard__s', text:
        'Coach accounts are created deliberately, in the Firebase console — nothing in the app will mint one. If you’re an athlete, you want a code from your coach instead.' }),

      el('div', { class: 'stack', style: 'gap:10px;margin-top:26px' }, [
        el('button', { class: 'btn btn--primary', style: 'width:100%',
          onclick: () => location.reload() }, [ icon('spark'), 'Check again' ]),
        el('button', { class: 'btn btn--ghost', style: 'width:100%',
          text: 'Sign out', onclick: () => CT.signOut() })
      ])
    ]);

    host.appendChild(el('div', { class: 'authwrap' }, [ card ]));
    motion.pop(card, .97);
  };
})();
