# Timesheet App

An internal timesheet app for logging project hours. Built with **Next.js 14**, **Supabase** (auth + database), and **Tailwind CSS**. Deployable to Vercel in minutes.

## Features
- Email/password login (Supabase Auth)
- Log hours against projects with a description
- View, edit, and delete past entries
- Project breakdown bar chart
- Export entries to CSV
- Responsive, polished UI

---

## Setup Guide

### 1. Supabase — create your project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Once created, go to **Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Supabase — create the database table

In your Supabase project, go to **SQL Editor** and run this:

```sql
create table timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  project text not null,
  description text not null,
  hours numeric(5,2) not null,
  created_at timestamptz default now()
);

-- Row-level security: users can only see/edit their own entries
alter table timesheet_entries enable row level security;

create policy "Users can manage their own entries"
  on timesheet_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### 3. Supabase — create user accounts

Go to **Authentication → Users** and click **Invite user** to add employee emails. They will receive a magic link to set their password.

### 4. Local development

```bash
# Clone / navigate into the project
cd timesheet-app

# Install dependencies
npm install

# Create your local env file
cp .env.example .env.local
# Then edit .env.local with your Supabase URL and anon key

# Run locally
npm run dev
# Visit http://localhost:3000
```

### 5. Deploy to Vercel

1. Push this project to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo
3. In **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy** — done! ✓

---

## Project Structure

```
timesheet-app/
├── app/
│   ├── layout.tsx          # Root layout + fonts
│   ├── globals.css         # Global styles
│   ├── page.tsx            # Redirects to /login or /dashboard
│   ├── login/page.tsx      # Login page
│   └── dashboard/page.tsx  # Main timesheet UI
├── lib/
│   ├── supabase.ts         # Browser Supabase client
│   └── supabase-server.ts  # Server Supabase client
├── .env.example            # Environment variable template
└── README.md
```
