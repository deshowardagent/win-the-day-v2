# Connecting the board to Supabase

The old shared store (jsonblob) deleted the board's data and now refuses to create new ones.
This is the replacement. Takes about three minutes.

## 1. Make the project

1. Go to <https://supabase.com> → sign in → **New project**.
2. Name it `win-the-day`, pick any region close to you, set a database password (you won't
   need it again — save it anyway).
3. Wait ~2 min for it to provision.

## 2. Make the table

Left sidebar → **SQL Editor** → **New query** → paste this and hit **Run**:

```sql
create table if not exists public.entries (
  id         text primary key,   -- "<person>_<date>", e.g. liv_2026-08-13
  ts         bigint not null default 0,
  payload    jsonb  not null,
  updated_at timestamptz not null default now()
);

alter table public.entries enable row level security;

-- The board has no accounts: anyone with the link is a participant. Read/write is open,
-- deliberately, exactly like the old store. Note there is NO delete policy — nothing can
-- wipe the board the way the last one got wiped.
create policy "board read"   on public.entries for select to anon using (true);
create policy "board insert" on public.entries for insert to anon with check (true);
create policy "board update" on public.entries for update to anon using (true) with check (true);
```

## 3. Get the two values

Left sidebar → **Project Settings** → **API**. Copy:

- **Project URL** — looks like `https://abcdefghijkl.supabase.co`
- **anon / public** key — the long one labelled `anon`, *not* `service_role`

The `anon` key is designed to be public and ships in client-side code. **Never** paste the
`service_role` key here — that one bypasses every policy above.

## 4. Paste them in

Top of the sync section in `app.js`:

```js
const SUPABASE_URL = '';       // ← Project URL, no trailing slash
const SUPABASE_ANON_KEY = '';  // ← anon / public key
```

Commit and push; GitHub Pages rebuilds in ~40 seconds. The red banner disappears and the
header reads `shared board · live` once a sync round-trips.

## 5. Get everyone's existing logs back up

Anything logged since Aug 5 only exists in each person's own browser. The moment the board
connects, each device pushes whatever it still has. So tell the group:

> Open the board **on the same phone/browser you've been logging on**, and don't clear your
> history first. Your logs will upload themselves. If you've been using more than one device,
> open the one you used most.

Anything on a device that's since been cleared is gone — there is no server copy to restore.

## Checking it later

Table Editor → `entries` should show one row per person per day. If the banner ever comes
back, the store is unreachable again and logs are piling up locally — the **export** button
in the header saves a JSON copy of that device's ledger.
