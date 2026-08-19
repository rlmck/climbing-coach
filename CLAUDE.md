# Working on Coach

What the app *is* and why it's shaped that way is in [README.md](README.md),
at length and with the reasoning intact. Read it rather than re-deriving
it. This file holds only what's true of **editing** the repo, which is
why none of it is in there.

## No build step, and no tests

No `package.json`, no bundler, no test runner. `index.html` loads plain
`<script>` tags in dependency order and every file hangs itself off one
`CT` global. So:

- **"Run the tests" has no answer here.** Verifying a change means
  driving the app: `python -m http.server 5177`.
- Blank `apiKey` in `js/config.js` and it runs on the seeded mock world
  with no network — the fast way to exercise a flow, and the only way to
  reach Maks's and Jade's fixtures.
- A new `js/…` file needs **three** edits, not one: a `<script>` tag in
  `index.html`, an entry in `SHELL` in `sw.js`, and a line in the
  README's Layout block. Miss the second and the file isn't there
  offline, which is the one place it matters most.

## Shipping

Pushing to GitHub does not publish the app. Both of these, every time:

```bash
firebase deploy --only firestore:rules,hosting
```

- **Bump `CACHE` in `sw.js`** (`coach-v32` → `coach-v33`) whenever a file
  in `SHELL` changes. It's how a phone knows to take the new one.
- Deploy the rules whenever `firestore.rules` changes — including when
  the change only adds a value to a whitelist. Rules that aren't deployed
  are a feature that silently fails on every write.
- `node tools/build-crags.mjs` after editing `routes_with_length.csv`.
  Never hand-edit `js/crags.data.js`.

## Invariants

The places where the code is deliberately awkward and an innocent-looking
edit is wrong:

- **Nothing derived is stored.** Prescribed loads and clean streaks are
  replayed from the sessions, on the client. Caching one in Firestore
  creates a number that can disagree with the sessions behind it.
- **Blank is not zero.** An unfilled metres box, an unmeasured route, a
  grade nobody would defend — all stored as absent, and every reader has
  to tell that from a real zero. Ask the formatter whether there's
  anything to show, not the raw number.
- **`members[]` is the only thing access control reads** for anything
  under an athlete. `routeLengths` is the sole exception and has its own
  shape.
- **The load cell's arithmetic is never re-done.** `js/cftest.js` adds
  the bookkeeping the export leaves out and nothing else.
- **A block and a phase are plans, not fences.** Code that refuses a log
  for being out of phase or outside the block dates is a bug. The only
  refusal is the future.
- **Old documents are migrated on read**, in `repo.js`, never rewritten.
- **Charts measure their own labels.** A character count is the wrong
  unit; only the chart knows how many pixels it has.

## Prose

**The README is the spec, not a summary of it — update it in the commit
that changes the behaviour.** It once went sixteen commits and two whole
modules out of date, which is what this line is here for.

Commit messages follow what's already in `git log`: a sentence-case
imperative subject naming the *intent* — "Let the chart measure its own
labels instead of guessing" — and never a `feat:` prefix. The body says
what was actually wrong, what the fix does, and closes on what was
verified and where. Comments do the same job in place: they explain why
the awkward thing is the right one, next to it.

Verify on the installed PWA with real touch input as well as on desktop.
A thumb drifts a few pixels and a mouse doesn't; narrowing a browser
window reproduces none of that.
