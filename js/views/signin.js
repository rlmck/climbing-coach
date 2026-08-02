/* ═══════════════════════════════════════════════════════════════
   views/signin.js — the only screen you see signed out.

   Deliberately one field at a time and one button. An athlete opens
   this in a gym car park with cold hands; anything clever here is
   something to get wrong.

   Signing in needs a connection — it's the one thing in the app that
   does. Everything after it works offline, and the screen says so,
   because "no internet" on a training app usually means "you've lost
   your session", and here it doesn't.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const CT = window.CT, { el, icon, motion } = CT.ui;

  CT.views.signin = function (host, opts) {
    opts = opts || {};
    let mode = opts.mode || 'in';                 // 'in' | 'up' | 'reset'
    let busy = false;

    const emailInput = el('input', { class: 'input', type: 'email', id: 'authEmail',
      autocomplete: 'username', placeholder: 'you@example.com', oninput: clearError });
    const passInput = el('input', { class: 'input', type: 'password', id: 'authPass',
      autocomplete: 'current-password', placeholder: '••••••••', oninput: clearError });
    const nameInput = el('input', { class: 'input', type: 'text', id: 'authName',
      autocomplete: 'name', placeholder: 'Your name', oninput: clearError });

    const error = el('p', { class: 'authcard__err', hidden: true });
    const note = el('p', { class: 'tiny' });
    const submit = el('button', { class: 'btn btn--primary', style: 'width:100%', onclick: go });
    const passField = el('div', { class: 'field' }, [ el('label', { for: 'authPass', text: 'Password' }), passInput ]);
    const nameField = el('div', { class: 'field' }, [ el('label', { for: 'authName', text: 'Name' }), nameInput ]);

    const swap = el('button', { class: 'btn btn--quiet btn--sm', onclick: () => {
      setMode(mode === 'in' ? 'up' : 'in');
    }});
    const forgot = el('button', { class: 'btn btn--quiet btn--sm', text: 'Forgot password',
      onclick: () => setMode(mode === 'reset' ? 'in' : 'reset') });

    function clearError() { error.hidden = true; }

    function setMode(m) {
      mode = m;
      clearError();
      nameField.hidden = m !== 'up';
      passField.hidden = m === 'reset';
      passInput.setAttribute('autocomplete', m === 'up' ? 'new-password' : 'current-password');
      submit.textContent = m === 'in' ? 'Sign in' : m === 'up' ? 'Create account' : 'Send reset link';
      swap.textContent = m === 'up' ? 'I already have an account' : 'Create an account';
      swap.hidden = m === 'reset';
      forgot.textContent = m === 'reset' ? 'Back to sign in' : 'Forgot password';
      note.textContent =
        m === 'up' ? 'If your coach has invited you, use the email they invited. Their plan is waiting on it.'
        : m === 'reset' ? 'We’ll email you a link to set a new password.'
        : 'Signing in is the one thing here that needs a connection. Logging sessions doesn’t.';
      motion.pop(submit, .98);
    }

    function fail(msg) {
      error.textContent = msg;
      error.hidden = false;
      motion.shake(error);
    }

    async function go() {
      if (busy) return;
      const email = emailInput.value.trim();
      const pass = passInput.value;
      const name = nameInput.value.trim();

      if (!email) return fail('Enter your email address.');
      if (mode !== 'reset' && pass.length < 6) return fail('Passwords are at least six characters.');
      if (mode === 'up' && name.length < 2) return fail('Tell us your name — your coach sees it.');

      busy = true;
      submit.disabled = true;
      const was = submit.textContent;
      submit.textContent = mode === 'reset' ? 'Sending…' : 'One moment…';

      try {
        const { auth, fn } = CT.fb;
        if (mode === 'reset') {
          await fn.resetPassword(auth, email);
          setMode('in');
          CT.ui.toast('Check your email', 'A link to set a new password is on its way to ' + email + '.');
        } else if (mode === 'up') {
          const cred = await fn.signUp(auth, email, pass);
          await fn.updateProfile(cred.user, { displayName: name });
          /* An invite can only be claimed from a verified address, so the
             email goes out now rather than after they've been told they
             can't get in. onAuthStateChanged takes it from here. */
          try { await fn.sendVerification(cred.user); }
          catch (e) { console.warn('[auth] verification email:', e.code || e.message); }
        } else {
          await fn.signIn(auth, email, pass);
        }
      } catch (e) {
        fail(CT.fb.message(e));
      } finally {
        busy = false;
        submit.disabled = false;
        submit.textContent = was;
      }
    }

    const card = el('div', { class: 'authcard' }, [
      el('div', { class: 'authcard__brand' }, [
        el('span', { class: 'mark', html:
          '<svg viewBox="0 0 24 24" fill="none"><path d="M3 20.5 9.2 6.2a1 1 0 0 1 1.83-.02L14 12.5l2.1-3.8a1 1 0 0 1 1.78.05L21 20.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
        el('span', { class: 'rail__wordmark', text: 'Coach' })
      ]),
      el('h1', { class: 'authcard__t', text: 'Finger strength, on a plan' }),
      el('p', { class: 'authcard__s', text: 'Prescribed loads, logged sessions, and a coach who can see both.' }),

      el('div', { class: 'stack', style: 'gap:14px;margin-top:26px' }, [
        nameField,
        el('div', { class: 'field' }, [ el('label', { for: 'authEmail', text: 'Email' }), emailInput ]),
        passField,
        error,
        submit,
        note
      ]),

      el('div', { class: 'authcard__ft' }, [ swap, forgot ])
    ]);

    /* Enter submits from anywhere in the form */
    card.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });

    host.appendChild(el('div', { class: 'authwrap' }, [ card ]));
    setMode(mode);
    motion.pop(card, .97);
    setTimeout(() => emailInput.focus({ preventScroll: true }), 120);
  };

  /* ═══════════════ signed in, address not confirmed ═══════════════
     The last step before an invite can be claimed. Nobody enjoys this
     screen, so it does the two useful things — resend, and re-check —
     and explains why it exists rather than just demanding compliance. */
  CT.views.verifyEmail = function (host, user) {
    const email = (user && user.email) || 'your address';
    const status = el('p', { class: 'tiny' });
    let busy = false;

    const resend = el('button', { class: 'btn btn--ghost', style: 'width:100%',
      text: 'Send it again', onclick: async () => {
        if (busy) return;
        busy = true; resend.disabled = true;
        try {
          await CT.fb.fn.sendVerification(user);
          status.textContent = 'Sent again to ' + email + '. It can take a minute.';
        } catch (e) {
          status.textContent = CT.fb.message(e);
        } finally { busy = false; resend.disabled = false; }
      }});

    /* The verified flag lives in the identity token, so it has to be
       reissued before the rules will see it — reloading the user isn't
       enough on its own. */
    const recheck = el('button', { class: 'btn btn--primary', style: 'width:100%',
      onclick: async () => {
        if (busy) return;
        busy = true; recheck.disabled = true;
        status.textContent = 'Checking…';
        try {
          await user.reload();
          await user.getIdToken(true);
          if (user.emailVerified) { location.reload(); return; }
          status.textContent = 'Not confirmed yet. Open the link in the email, then try again.';
        } catch (e) {
          status.textContent = CT.fb.message(e);
        } finally { busy = false; recheck.disabled = false; }
      }}, [ icon('check'), 'I’ve confirmed it' ]);

    const card = el('div', { class: 'authcard' }, [
      el('div', { class: 'authcard__brand' }, [
        el('span', { class: 'mark', html:
          '<svg viewBox="0 0 24 24" fill="none"><path d="M3 20.5 9.2 6.2a1 1 0 0 1 1.83-.02L14 12.5l2.1-3.8a1 1 0 0 1 1.78.05L21 20.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
        el('span', { class: 'rail__wordmark', text: 'Coach' })
      ]),
      el('h1', { class: 'authcard__t', text: 'Confirm your email' }),
      el('p', { class: 'authcard__s', html: `We’ve sent a link to <b>${email}</b>. Open it, then come back here.` }),
      el('p', { class: 'authcard__s', text:
        'Your coach’s plan is waiting on this address, and confirming it is what proves the address is yours.' }),
      el('div', { class: 'stack', style: 'gap:10px;margin-top:26px' }, [ recheck, resend, status ]),
      el('div', { class: 'authcard__ft' }, [
        el('button', { class: 'btn btn--quiet btn--sm', text: 'Sign in on a different address',
          onclick: () => CT.signOut() })
      ])
    ]);

    host.appendChild(el('div', { class: 'authwrap' }, [ card ]));
    motion.pop(card, .97);
  };

  /* ═══════════════ signed in, and still nowhere to go ═══════════════
     An account exists but no coach has invited this address, so there is
     nothing to show and nothing to create. Say that plainly and offer
     the two things that actually help: check the address, or leave.

     Deliberately not a failed sign-in — they did sign in. Telling someone
     their password was wrong when it wasn't sends them round a loop. */
  CT.views.noInvite = function (host, user) {
    const email = (user && user.email) || 'this address';

    const card = el('div', { class: 'authcard' }, [
      el('div', { class: 'authcard__brand' }, [
        el('span', { class: 'mark', html:
          '<svg viewBox="0 0 24 24" fill="none"><path d="M3 20.5 9.2 6.2a1 1 0 0 1 1.83-.02L14 12.5l2.1-3.8a1 1 0 0 1 1.78.05L21 20.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
        el('span', { class: 'rail__wordmark', text: 'Coach' })
      ]),
      el('h1', { class: 'authcard__t', text: 'No invite on this address' }),
      el('p', { class: 'authcard__s', html:
        `You’re signed in as <b>${email}</b>, but no coach has set up an athlete on it.` }),
      el('p', { class: 'authcard__s', text:
        'Coach is invite-only. Ask your coach to add you — using exactly the address above — and sign in again. Nothing else is needed at your end.' }),

      el('div', { class: 'stack', style: 'gap:10px;margin-top:26px' }, [
        el('button', { class: 'btn btn--primary', style: 'width:100%',
          onclick: () => location.reload() }, [ icon('spark'), 'Check again' ]),
        el('button', { class: 'btn btn--ghost', style: 'width:100%',
          text: 'Sign in on a different address', onclick: () => CT.signOut() })
      ])
    ]);

    host.appendChild(el('div', { class: 'authwrap' }, [ card ]));
    motion.pop(card, .97);
  };
})();
