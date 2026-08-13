# Synopsical

Your personal encyclopedia, synced to the cloud. Write entries on one device,
read them on any other. Plain files, no build step, two free services.

This is a cloud version of the original single-page app — the same features,
with the data moved out of the browser and into a real database.

| File | What it is |
|---|---|
| `index.html` | The page |
| `style.css` | Look and feel — six themes built in |
| `app.js` | Everything the app does |
| `config.js` | **You edit this** — your two Supabase keys go here |
| `supabase-schema.sql` | Database setup — run once |
| `supabase-schema-02-profiles.sql` | Adds the multi-user/plan foundation — run once, after the first |
| `CNAME` | Tells GitHub Pages to serve this site at synopsical.com |
| `email-templates/confirm-signup.html` | Paste into Supabase's email settings — never served by the app itself |

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

Edit the files and re-upload them. GitHub Pages redeploys within a minute or
two. There is no build step and nothing to install.

## If something goes wrong

- **Stuck on "Almost there"** — `config.js` still has empty values, or the file
  did not upload.
- **"Invalid API key"** — the anon key was copied incompletely. It is long.
- **Signed in but no entries, and saving fails** — the SQL script did not finish.
  Run it again; it is safe to run twice.
- **Images do not appear** — check that the `faceplates` storage bucket exists
  under **Storage** in Supabase. The SQL script creates it.
