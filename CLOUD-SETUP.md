# Cloud Backup setup (one time, ~5 minutes, free)

The app can automatically back up your data to **your own** free [Supabase](https://supabase.com)
project. Everything is **encrypted on your phone before upload** with a passphrase only you
know — Supabase (or anyone who breaches it) only ever sees an unreadable blob.

## 1. Create the project

1. Go to <https://supabase.com> → **Start your project** → sign up (GitHub login is easiest).
2. **New project** → any name (e.g. `finance-backup`), pick a region near you, generate a
   database password (you won't need it again — the app never uses it). Free plan is fine.
3. Wait ~1 minute while it provisions.

## 2. Create the backup table

In the left sidebar open **SQL Editor** → **New query**, paste this, hit **Run**:

```sql
create table public.cloud_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload text not null,
  updated_at timestamptz not null default now()
);

alter table public.cloud_backups enable row level security;

create policy "users manage their own backup"
  on public.cloud_backups for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## 3. Turn off email confirmation

The app signs you in with **email + password** — no emails involved. (Supabase's built-in
mailer no longer lets you customize sign-in emails without setting up your own SMTP, so
code-by-email flows are impractical on the free defaults.) One toggle makes password
sign-up work instantly:

1. Sidebar → **Authentication** → under *Configuration* → **Sign In / Providers**.
2. Open the **Email** provider.
3. Turn **OFF** “Confirm email” → **Save**.

Optional but recommended: under **URL Configuration**, set **Site URL** to
`https://ivann9963.github.io/Personal-Finance/` (any auth links then land in the app).

## 4. Copy the two values into the app

1. Sidebar → **Project Settings** (gear) → **API Keys**.
2. Copy the **Publishable key** (`sb_publishable_…`) — older projects show a "Legacy" tab
   with an **anon** `eyJ…` key instead; either works. It's safe to be public — the SQL
   policy above is what protects your row. **Never use a secret / service_role key.**
3. Your **Project URL** is `https://<Project ID>.supabase.co` — the Project ID is on
   *Project Settings → General* (the URL is also shown on the *Data API* page).
4. In the Finance app: **Settings → Cloud Backup** → paste both → **Save & Continue**.

## 5. Sign in and pick a passphrase

1. First time: enter your email, choose a **password** → **Create Account**. Every time
   after that (including on a new phone): same email + password → **Sign In**.
2. Choose an **encryption passphrase** (min 8 chars) and **write it down** — it never leaves
   your device, and without it a cloud backup cannot be decrypted by anyone, including you.
   (Yes, that's two secrets: the password unlocks your *account*; the passphrase unlocks
   your *data*. The server knows neither your data nor the passphrase.)
3. Done. The app backs up automatically a few seconds after every change (toggleable), and
   **Back Up Now / Restore** buttons live in Settings → Cloud Backup.

## New phone?

Install the app → Settings → Cloud Backup → same project URL + anon key → sign in with the
same email + password → **Restore** → enter your passphrase. You're back exactly where you
were.

## Notes

- Free tier limits (500 MB database, 50k monthly active users) are absurdly above what one
  person's ~50 KB backup needs.
- The backup is a single row per user — each upload replaces the previous one.
- Your sign-in session lives only on the device; signing out stops backups but deletes nothing.
