-- KickFix — account deletion RPC
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run.
--
-- This creates a Postgres function `delete_my_account()` that an authenticated
-- user can call to permanently delete their own account + all related data.
--
-- The function is `security definer` so it can call the privileged
-- `auth.admin.delete_user()` indirectly. It only ever deletes the row matching
-- the current `auth.uid()`, so users can't delete anyone else.
--
-- Cascade behavior: when auth.users row is removed, the foreign keys with
-- `on delete cascade` on profiles/sessions/kicks/kick_frames clear the data.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- Delete the auth user. FK cascades handle the rest.
  delete from auth.users where id = uid;
end;
$$;

-- Grant execute to any signed-in user. RLS doesn't apply to functions but
-- the function itself only operates on the caller's uid, so it's safe.
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
