-- Admin controls for Pidgeot Flight. Apply after migrations 0001 and 0002.
create or replace function public.pidgeot_is_admin()
returns boolean language sql stable security definer set search_path=public as $$
 select lower(coalesce(auth.jwt()->>'email',''))='admin@evileevee.com'
$$;
revoke all on function public.pidgeot_is_admin() from public;
grant execute on function public.pidgeot_is_admin() to authenticated;

alter table public.pidgeot_ledger drop constraint if exists pidgeot_ledger_kind_check;
alter table public.pidgeot_ledger add constraint pidgeot_ledger_kind_check check(kind in ('seed_credit','bet_debit','cashout_credit','bet_refund','admin_coin_adjustment'));
create table if not exists public.pidgeot_points_ledger(
 id bigint generated always as identity primary key,user_id uuid not null references auth.users(id) on delete cascade,
 amount bigint not null,reason text not null check(char_length(reason) between 3 and 500),
 admin_user_id uuid references auth.users(id),created_at timestamptz not null default now());
alter table public.pidgeot_points_ledger enable row level security;
create policy "points ledger self read" on public.pidgeot_points_ledger for select to authenticated using(auth.uid()=user_id);

create or replace function public.pidgeot_admin_list_users()
returns table(user_id uuid,email text,username text,coins bigint,points bigint,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if not public.pidgeot_is_admin() then raise exception 'Admin access required'; end if;
 return query select u.id,u.email,p.username,w.balance,w.prize_points,u.created_at from auth.users u
 left join public.pidgeot_profiles p on p.user_id=u.id left join public.pidgeot_wallets w on w.user_id=u.id
 order by u.created_at desc limit 500;
end $$;
revoke all on function public.pidgeot_admin_list_users() from public;
grant execute on function public.pidgeot_admin_list_users() to authenticated;

create or replace function public.pidgeot_admin_adjust_balance(target_user uuid,coin_delta bigint,point_delta bigint,adjustment_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare admin_id uuid:=auth.uid(); w public.pidgeot_wallets%rowtype;
begin
 if not public.pidgeot_is_admin() then raise exception 'Admin access required'; end if;
 if target_user is null or (coin_delta=0 and point_delta=0) then raise exception 'Choose a user and nonzero adjustment'; end if;
 if char_length(trim(coalesce(adjustment_reason,'')))<3 then raise exception 'Reason must be at least 3 characters'; end if;
 if abs(coalesce(coin_delta,0))>1000000 or abs(coalesce(point_delta,0))>1000000 then raise exception 'Adjustment exceeds limit'; end if;
 update public.pidgeot_wallets set balance=balance+coin_delta,prize_points=prize_points+point_delta,updated_at=now()
 where user_id=target_user and balance+coin_delta>=0 and prize_points+point_delta>=0 returning * into w;
 if not found then raise exception 'Wallet not found or adjustment would make balance negative'; end if;
 if coin_delta<>0 then insert into public.pidgeot_ledger(user_id,kind,amount) values(target_user,'admin_coin_adjustment',coin_delta); end if;
 if point_delta<>0 then insert into public.pidgeot_points_ledger(user_id,amount,reason,admin_user_id) values(target_user,point_delta,trim(adjustment_reason),admin_id); end if;
 insert into public.pidgeot_admin_audit(admin_user_id,action,target_user_id,details) values(admin_id,'balance_adjustment',target_user,jsonb_build_object('coin_delta',coin_delta,'point_delta',point_delta,'reason',trim(adjustment_reason)));
 return jsonb_build_object('coins',w.balance,'points',w.prize_points);
end $$;
revoke all on function public.pidgeot_admin_adjust_balance(uuid,bigint,bigint,text) from public;
grant execute on function public.pidgeot_admin_adjust_balance(uuid,bigint,bigint,text) to authenticated;

create or replace function public.pidgeot_admin_update_settings(free_rounds integer,free_coins bigint,login_points bigint,rewards_on boolean,rounds_on boolean,coins_on boolean,login_on boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare admin_id uuid:=auth.uid();
begin
 if not public.pidgeot_is_admin() then raise exception 'Admin access required'; end if;
 if free_rounds not between 0 and 1000 or free_coins not between 0 and 1000000 or login_points not between 0 and 1000000 then raise exception 'Reward value out of range'; end if;
 update public.pidgeot_game_settings set daily_free_rounds=free_rounds,daily_free_coins=free_coins,daily_login_points=login_points,daily_rewards_enabled=rewards_on,free_rounds_enabled=rounds_on,free_coins_enabled=coins_on,login_bonus_enabled=login_on,updated_at=now(),updated_by=admin_id where id=true;
 insert into public.pidgeot_admin_audit(admin_user_id,action,details) values(admin_id,'settings_updated',jsonb_build_object('daily_free_rounds',free_rounds,'daily_free_coins',free_coins,'daily_login_points',login_points,'rewards_enabled',rewards_on,'rounds_enabled',rounds_on,'coins_enabled',coins_on,'login_enabled',login_on));
 return jsonb_build_object('updated',true);
end $$;
revoke all on function public.pidgeot_admin_update_settings(integer,bigint,bigint,boolean,boolean,boolean,boolean) from public;
grant execute on function public.pidgeot_admin_update_settings(integer,bigint,bigint,boolean,boolean,boolean,boolean) to authenticated;
