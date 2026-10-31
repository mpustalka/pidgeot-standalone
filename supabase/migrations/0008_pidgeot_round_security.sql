
-- 0008_pidgeot_round_security.sql
-- Apply AFTER migrations 0001 through 0007.
-- This migration does not delete or recreate existing game data.

do $$
begin
  if (
    select count(*)
    from public.pidgeot_rounds
    where status in ('betting', 'flying')
  ) > 1 then
    raise exception
      'Multiple live rounds exist. Resolve them before applying migration 0008.';
  end if;
end;
$$;

-- The constant index key allows only one live round total,
-- not one betting round plus one flying round.
create unique index if not exists pidgeot_one_live_round_idx
on public.pidgeot_rounds ((true))
where status in ('betting', 'flying');

-- Do not let browser clients read server_seed or the unrevealed
-- crash_multiplier directly from the rounds table.
revoke select on public.pidgeot_rounds from anon, authenticated;

-- The round RPC exposes only safe fields. The crash multiplier is
-- returned only after the round has ended.
drop function if exists public.pidgeot_get_current_round();

create function public.pidgeot_get_current_round()
returns table (
  id uuid,
  round_number bigint,
  status text,
  betting_opens_at timestamptz,
  starts_at timestamptz,
  crashed_at timestamptz,
  crash_multiplier numeric,
  server_seed_hash text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id,
    r.round_number,
    r.status,
    r.betting_opens_at,
    r.starts_at,
    r.crashed_at,
    case
      when r.status in ('crashed', 'settled')
        then r.crash_multiplier
      else null
    end,
    r.server_seed_hash
  from public.pidgeot_rounds r
  order by r.round_number desc
  limit 1;
$$;

revoke all on function public.pidgeot_get_current_round() from public;
grant execute on function public.pidgeot_get_current_round()
to authenticated;
