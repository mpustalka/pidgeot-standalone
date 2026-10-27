-- Free-play rewards, prize points, prize catalog, redemptions, and admin audit.
-- Apply after 0001. No crypto or cash-deposit tables are created.
create table if not exists public.pidgeot_game_settings (
  id boolean primary key default true check (id),
  daily_free_rounds integer not null default 5 check (daily_free_rounds between 0 and 1000),
  daily_free_coins bigint not null default 2 check (daily_free_coins between 0 and 1000000),
  daily_login_points bigint not null default 2 check (daily_login_points between 0 and 1000000),
  daily_rewards_enabled boolean not null default true,
  free_rounds_enabled boolean not null default true,
  free_coins_enabled boolean not null default true,
  login_bonus_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.pidgeot_game_settings(id) values(true) on conflict(id) do nothing;

alter table public.pidgeot_wallets add column if not exists prize_points bigint not null default 0 check(prize_points >= 0);

create table if not exists public.pidgeot_daily_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_date date not null default (timezone('utc', now()))::date,
  free_rounds integer not null default 0 check(free_rounds >= 0),
  free_coins bigint not null default 0 check(free_coins >= 0),
  login_points bigint not null default 0 check(login_points >= 0),
  created_at timestamptz not null default now(),
  unique(user_id, claim_date)
);

create table if not exists public.pidgeot_prizes (
  id uuid primary key default gen_random_uuid(),
  title text not null check(char_length(title) between 1 and 120),
  description text not null default '',
  image_url text,
  points_cost bigint not null check(points_cost > 0),
  stock integer not null default 0 check(stock >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.pidgeot_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prize_id uuid not null references public.pidgeot_prizes(id),
  points_cost bigint not null check(points_cost > 0),
  status text not null default 'pending' check(status in ('pending','approved','rejected','fulfilled','cancelled')),
  shipping_name text,
  shipping_address text,
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create table if not exists public.pidgeot_admin_audit (
  id bigint generated always as identity primary key,
  admin_user_id uuid references auth.users(id),
  action text not null,
  target_user_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pidgeot_claim_user_date_idx on public.pidgeot_daily_claims(user_id,claim_date desc);
create index if not exists pidgeot_redemption_user_idx on public.pidgeot_redemptions(user_id,created_at desc);
create index if not exists pidgeot_redemption_status_idx on public.pidgeot_redemptions(status,created_at desc);

alter table public.pidgeot_game_settings enable row level security;
alter table public.pidgeot_daily_claims enable row level security;
alter table public.pidgeot_prizes enable row level security;
alter table public.pidgeot_redemptions enable row level security;
alter table public.pidgeot_admin_audit enable row level security;
create policy "settings readable by signed in users" on public.pidgeot_game_settings for select to authenticated using(true);
create policy "claims self read" on public.pidgeot_daily_claims for select to authenticated using(auth.uid()=user_id);
create policy "enabled prizes readable" on public.pidgeot_prizes for select to authenticated using(enabled=true);
create policy "redemptions self read" on public.pidgeot_redemptions for select to authenticated using(auth.uid()=user_id);
-- Mutations are deliberately server-side only. Use trusted Edge Functions/RPC with service role.

create or replace function public.pidgeot_claim_daily_reward()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid(); s public.pidgeot_game_settings%rowtype; today_utc date := (timezone('utc',now()))::date;
  inserted_id bigint;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into s from public.pidgeot_game_settings where id=true;
  if not found or not s.daily_rewards_enabled then raise exception 'Daily rewards are disabled'; end if;
  insert into public.pidgeot_daily_claims(user_id,claim_date,free_rounds,free_coins,login_points)
  values(uid,today_utc,case when s.free_rounds_enabled then s.daily_free_rounds else 0 end,
    case when s.free_coins_enabled then s.daily_free_coins else 0 end,
    case when s.login_bonus_enabled then s.daily_login_points else 0 end)
  on conflict(user_id,claim_date) do nothing returning id into inserted_id;
  if inserted_id is null then raise exception 'Already claimed today'; end if;
  update public.pidgeot_wallets set balance=balance+(case when s.free_coins_enabled then s.daily_free_coins else 0 end),
    prize_points=prize_points+(case when s.login_bonus_enabled then s.daily_login_points else 0 end),updated_at=now()
    where user_id=uid;
  if not found then raise exception 'Wallet not found'; end if;
  insert into public.pidgeot_ledger(user_id,kind,amount)
  values(uid,'seed_credit',case when s.free_coins_enabled then s.daily_free_coins else 0 end);
  return jsonb_build_object('claimed',true,'free_rounds',case when s.free_rounds_enabled then s.daily_free_rounds else 0 end,
    'free_coins',case when s.free_coins_enabled then s.daily_free_coins else 0 end,
    'login_points',case when s.login_bonus_enabled then s.daily_login_points else 0 end);
end $$;
revoke all on function public.pidgeot_claim_daily_reward() from public;
grant execute on function public.pidgeot_claim_daily_reward() to authenticated;
