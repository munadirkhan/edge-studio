-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Feedback table
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  type        text,
  rating      int,
  message     text not null,
  user_email  text,
  created_at  timestamptz default now()
);
alter table public.feedback enable row level security;
create policy "Anyone can insert feedback" on public.feedback for insert with check (true);
create policy "Service role reads feedback" on public.feedback for select to service_role using (true);

-- Jobs table
create table if not exists public.jobs (
  id          uuid primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  status      text not null default 'queued',
  stage       text,
  url         text not null,
  title       text,
  error       text,
  created_at  timestamptz default now()
);

-- Clips table
create table if not exists public.clips (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid references public.jobs(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  rank         int,
  viral_score  int,
  title        text,
  hook         text,
  reason       text,
  caption      text,
  start_sec    float,
  end_sec      float,
  duration     int,
  download_url text,
  thumbnail_url text,
  created_at   timestamptz default now()
);

-- RLS: users can only see their own data
alter table public.jobs  enable row level security;
alter table public.clips enable row level security;

create policy "Users see own jobs"  on public.jobs  for all using (auth.uid() = user_id);
create policy "Users see own clips" on public.clips for all using (auth.uid() = user_id);

-- Allow service role to insert/update (backend uses service role key)
create policy "Service role full access jobs"  on public.jobs  for all to service_role using (true) with check (true);
create policy "Service role full access clips" on public.clips for all to service_role using (true) with check (true);
