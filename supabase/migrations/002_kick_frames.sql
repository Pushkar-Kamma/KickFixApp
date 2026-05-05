-- KickFix — kick_frames table for storing landmark replays
-- Run this in Supabase SQL editor.

create table if not exists public.kick_frames (
  id uuid primary key default gen_random_uuid(),
  kick_id uuid not null references public.kicks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Compact landmark frames: array of { i: [[x,y,z,vis,pres],...33], w: [...], t: ms }
  frames jsonb not null,
  peak_frame_idx int not null,
  chamber_frame_idx int not null,
  leg text not null check (leg in ('Left', 'Right'))
);

create index if not exists kick_frames_kick_id_idx on public.kick_frames(kick_id);
create index if not exists kick_frames_user_id_idx on public.kick_frames(user_id);

-- RLS: users can only see + insert their own
alter table public.kick_frames enable row level security;

create policy "users can read own kick_frames"
  on public.kick_frames for select
  using (auth.uid() = user_id);

create policy "users can insert own kick_frames"
  on public.kick_frames for insert
  with check (auth.uid() = user_id);

create policy "users can delete own kick_frames"
  on public.kick_frames for delete
  using (auth.uid() = user_id);
