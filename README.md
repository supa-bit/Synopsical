# Synopsical

Your personal encyclopedia, synced to the cloud. Write entries on one device,
read them on any other. Plain files, no build step, two free services.

This is a cloud version of the original single-page app — the same features,
with the data moved out of the browser and into a real database.

| File | What it is |
|---|---|
| `index.html` | The page |
| `style.css` | Look and feel — seven themes built in |
| `app.js` | Everything the app does |
| `lib/*.mjs` | Pure logic pulled out of `app.js` so it can be unit-tested — see "Testing" below |
| `config.js` | **You edit this** — your two Supabase keys go here |
| `supabase-schema.sql` | Database setup — run once |
| `supabase-schema-02-profiles.sql` | Adds the multi-user/plan foundation — run once, after the first |
| `CNAME` | Tells GitHub Pages to serve this site at synopsical.com |
| `email-templates/*.html` | Paste into Supabase's email settings — never served by the app itself |
| `package.json` | No dependencies, nothing to `npm install` — just marks `app.js`/`newsletter.js` as ES modules for Node, and gives `npm test`/`npm run check` somewhere to live |
| `tests/*.test.mjs` | Unit tests for `lib/*.mjs` — see "Testing" below |
| `scripts/serve.mjs` | `npm start` — local dev server, needed now that `app.js` is a module (see "Changing it later" below) |
| `scripts/check.mjs` | Pre-push structural sanity check — see "Before pushing" below |
| `.githooks/pre-push` | Runs `check.mjs` + the tests automatically on `git push`, once enabled |
| `.github/workflows/check.yml` | Runs the same two in GitHub Actions on every push |

---

## What changed from the original

| | Original | Now |
|---|---|---|
| Where data lives | Your browser only | Your own Supabase database |
| Between devices | Nothing carried over | Everything syncs |
| Storage limit | About 5 MB, then silent failure | 500 MB on the free tier |
| Images | Stored inside the page's storage, filling it fast | Uploaded to file storage |
| Sign-in | None | Email and password |
| Search | Matched raw substrings | Proper indexed full-text search |
| Themes | Saved on that one device | Follow your account |

Everything else works as it did: entries with categories, custom fields, tags,
links between entries with a label, faceplates, and the link map.

---

## Step 1 — Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up.
2. Click **New Project**. Any name will do. Save the database password
   somewhere safe — you probably will not need it again, but do not lose it.
3. Wait about two minutes while it starts up.

## Step 2 — Set up the database

1. In your project, open **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `supabase-schema.sql` from this folder, copy all of it, paste it in,
   and click **Run**.
4. You should see *Success. No rows returned.*

That creates your tables and locks them down so only your account can read or
write your entries.

## Step 3 — Paste in your keys

1. In Supabase, go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `config.js` and paste them in:

```js
window.SYNOPSICAL_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
};
```

The anon key is meant to be public — it is safe in this file. The security
comes from the rules the SQL script installed, which tie every row to your
account.

### Optional: skip the confirmation email

By default Supabase emails you a link to click before a new account can sign
in. For a private app that is an extra step you may not want. Turn it off
under **Authentication → Providers → Email → Confirm email**.

### Optional: send email as you@synopsical.com instead of Supabase

By default every auth email (confirm-signup, reset-password) is sent by
Supabase's own shared address, not synopsical.com. Two separate things
control what a recipient actually sees, and both need to be done — doing
only one leaves the emails half-branded:

1. **The template (what the email says)** — already written for you in
   `email-templates/`. In the Supabase dashboard, go to
   **Authentication → Email Templates**, and for each of **Confirm signup**
   and **Reset password**, paste in the matching file's contents (open the
   `.html` file, copy everything, paste into that template's body field,
   save). This is why the emails look like the rest of the site instead of
   Supabase's own default template — it does nothing about the sender.

2. **The sender (who it's actually from)** — controlled by
   **Project Settings → Auth → SMTP Settings** (labeled "Custom SMTP" in
   some Supabase versions). Supabase's built-in mailer can only ever send
   from its own address; getting `noreply@synopsical.com` (or whatever
   address you want) in the "From" field requires connecting your own
   SMTP credentials from an actual email-sending service — Supabase
   doesn't send email on your domain's behalf without one. If you don't
   already have an email-sending account, a transactional-email provider
   (not a regular inbox) is the normal way to do this — Resend, Postmark,
   and Amazon SES are common choices with free tiers. Whichever you pick,
   the flow is the same shape:
   - Create an account with the provider, add `synopsical.com` as a
     sending domain.
   - The provider gives you DNS records (usually an SPF `TXT` record and
     one or more DKIM `CNAME`/`TXT` records) — add those at your domain
     registrar. This step proves to receiving mail servers that the
     provider is allowed to send as your domain, and is what keeps these
     emails out of spam folders.
   - Once the provider shows the domain as verified, it gives you SMTP
     host/port/username/password — enter those in Supabase's SMTP
     Settings, along with the sender address and name you want shown
     (e.g. `no-reply@synopsical.com`, "Synopsical").
   - Send yourself a test reset-password email afterward to confirm both
     the sender address and the new template actually show up correctly —
     Supabase's SMTP test button (if present) only confirms the
     connection works, not that a real send looks right.

## Step 4 — Open it

Double-click `index.html`, or put it online:

1. Create a free [GitHub](https://github.com) account.
2. Make a new **public** repository, for example `synopsical`.
3. Upload everything in this folder, including the `CNAME` file and the
   `email-templates` folder (drag and drop works on github.com).
4. Go to **Settings → Pages**, choose **Deploy from a branch**, branch `main`,
   folder `/ (root)`, and save.

You get a link like `https://yourname.github.io/synopsical/` that works on any
device. Add it to your phone's home screen for one-tap access.

The first time you open it, choose **Create one** to make your account.

---

## Using it

- **New entry** — title and category are required. Everything else is optional:
  a summary for the list view, notes for the real content, custom fields for
  structured details, tags, links to other entries, and a source.
- **Faceplate** — the coloured badge on each entry. Either two or three
  initials, or an uploaded image.
- **Linked entries** — search for another entry, then optionally describe how
  they relate. The label shows on both entries.
- **Link map** — a force-directed picture of how entries connect. Drag a node
  to move it, click one to open it. It draws the hundred most-linked entries;
  past that a map of this kind stops being readable, so the rest are left out
  rather than drawn into an unreadable mat.
- **Search** — searches titles, categories, summaries and notes.
- **Appearance** — six themes, three font choices, and individual colour
  control. Saved to your account, so it follows you.
- **Export everything** — one JSON file with every entry, field, tag and link.
  Take it and go whenever you like.

---

## Costs

Both free tiers cover personal use comfortably.

- **Supabase free tier** — 500 MB database, 1 GB file storage, 5 GB bandwidth a
  month. Thousands of entries will use a small fraction of that.
- **GitHub Pages** — free and unlimited for public repositories.

Supabase pauses free projects after a week with no activity; opening the app
wakes it up again. If you outgrow the free tier you get plenty of warning.

## Changing it later

Edit the files, commit, and `git push`. GitHub Pages redeploys from `main`
within a minute or two. There is no build step and nothing to install.

**Testing a change locally: don't just open `index.html` directly anymore.**
`app.js` is now `type="module"` (see "Testing" below), and browsers refuse
to load a module script from a `file://` URL — it'll show a blank or broken
app with a CORS error in the console, even though the exact same file works
fine once GitHub Pages serves it over `https://`. Run a real local server
instead, one command, nothing to install:

```
npm start
```

Then open the `http://localhost:8080/` it prints — not the file path.
(`info.html` and `pricing.html` don't load `app.js`, so those two still
open fine directly from disk if you only need to check one of them.)

## Before pushing

There's no build step, no bundler, and no TypeScript — which means nothing
automatically stops a typo or a broken reference from going straight to the
live site the moment it's pushed, unless something's specifically set up to
catch it. Two things are:

**`scripts/check.mjs`** — a zero-dependency Node script that catches
structural breakage:

- a JS syntax error in `app.js`, `newsletter.js`, `config.js`, or `lib/*.mjs`
- a `$('some-id')` / `getElementById('some-id')` call in the JS with no
  matching `id="some-id"` anywhere in the HTML (and not created at runtime
  by the JS itself)
- an `import '...'` in the JS pointing at a module file that isn't there
- a `<script src="…">` or `<link href="…">` pointing at a local file that
  isn't actually there
- a duplicate `id` in the same HTML file

**`tests/*.test.mjs`** (`npm test`, or `node --test tests/*.test.mjs`) —
real unit tests for the pure logic that's been pulled out of `app.js` into
`lib/*.mjs` (see "Testing" below). Structural checks can't tell you the
import parser still handles a blank line in the middle of a header block
correctly; these do.

Run either directly any time:

```
node scripts/check.mjs
```

```
node --test tests/*.test.mjs
```

Or enable both as a `git push` hook, once per clone, so they run
automatically and block a bad push:

```
git config core.hooksPath .githooks
```

(`git push --no-verify` skips it for one push if you ever need to.)

Both also run in GitHub Actions on every push to `main`
(`.github/workflows/check.yml`) — this doesn't block the Pages deploy
(Pages redeploys off the push itself, independent of this), but it does
put a red/green check on the commit so a broken push is visible on GitHub
even if it slipped past the local hook.

Neither catches everything — there's no substitute for actually opening the
app and clicking through a change — but together they close the gap where a
plain typo, a rename-and-forget-the-other-half-of-it, or a quietly-wrong
edge case in the parsing logic silently ships.

## Testing

`app.js` is one large classic-script file that calls `boot()` the moment it
loads — great for the browser, impossible to unit test directly, since
importing it would also boot the whole app (Supabase client, auth, DOM
wiring included). The fix isn't a bundler, it's native ES modules, which
browsers have supported natively for years:

- Pure, side-effect-free logic — parsing, formatting, scoring, anything
  that's just data in and data out — lives in its own file under `lib/`,
  exported normally (`export function ...`).
- `app.js` imports it (`import { thing } from './lib/thing.mjs'`), and its
  `<script>` tag in `index.html` is `type="module"` so the browser's native
  `import` resolves it. No bundler, no build step — this is just what ES
  modules are.
- `tests/*.test.mjs` imports the exact same file directly, using Node's
  built-in `node:test` (no test framework dependency either), and tests it
  in complete isolation from the DOM/Supabase/the rest of the app.

`lib/import-parser.mjs` (the Import screen's text → draft parsing) is the
first piece done this way — see `tests/import-parser.test.mjs` for the
pattern. The plan is to keep doing this incrementally as each area gets
touched anyway, rather than as one big refactor: next time you're in the
tag/category logic, the export logic, the link-suggestion scoring, etc.,
that's the moment to pull the pure part of it into `lib/` and give it real
tests, not a separate project on its own.

## If something goes wrong

- **Stuck on "Almost there"** — `config.js` still has empty values, or the file
  did not upload.
- **"Invalid API key"** — the anon key was copied incompletely. It is long.
- **Signed in but no entries, and saving fails** — the SQL script did not finish.
  Run it again; it is safe to run twice.
- **Images do not appear** — check that the `faceplates` storage bucket exists
  under **Storage** in Supabase. The SQL script creates it.
