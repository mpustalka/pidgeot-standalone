
'use client';

import { useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

type Profile = {
  username: string;
  created_at: string;
};

type Wallet = {
  balance: number;
  prize_points: number;
  updated_at?: string;
};

type Settings = {
  daily_free_rounds: number;
  daily_free_coins: number;
  daily_login_points: number;
  daily_rewards_enabled: boolean;
  free_rounds_enabled: boolean;
  free_coins_enabled: boolean;
  login_bonus_enabled: boolean;
};

type Claim = {
  claim_date: string;
  free_rounds: number;
  free_coins: number;
  login_points: number;
};

const card =
  'rounded-2xl border border-white/10 bg-[#171a21] p-5 shadow-lg  sm:p-6';

function nextUtcMidnight() {
  const now = new Date();
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
}

function countdownText(ms: number) {
  if (ms <= 0) return 'Resetting…';

  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}

export default function ProfilePage() {
  const [user, setUser] = useState<{
    id: string;
    email?: string;
    created_at?: string;
  } | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lastClaim, setLastClaim] = useState<Claim | null>(null);

  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState('…');

  const loadProfile = useCallback(async () => {
    const db = createClient();

    const { data: authData, error: authError } =
      await db.auth.getUser();

    if (authError || !authData.user) {
      setLoading(false); return;
      return;
    }

    const currentUser = authData.user;
    setUser({
      id: currentUser.id,
      email: currentUser.email,
      created_at: currentUser.created_at,
    });

    const [
      profileResult,
      walletResult,
      settingsResult,
      claimsResult,
    ] = await Promise.all([
      db
        .from('pidgeot_profiles')
        .select('username, created_at')
        .eq('user_id', currentUser.id)
        .maybeSingle(),

      db
        .from('pidgeot_wallets')
        .select('balance, prize_points, updated_at')
        .eq('user_id', currentUser.id)
        .maybeSingle(),

      db
        .from('pidgeot_game_settings')
        .select(
          'daily_free_rounds, daily_free_coins, daily_login_points, daily_rewards_enabled, free_rounds_enabled, free_coins_enabled, login_bonus_enabled'
        )
        .eq('id', true)
        .maybeSingle(),

      db
        .from('pidgeot_daily_claims')
        .select('claim_date, free_rounds, free_coins, login_points')
        .eq('user_id', currentUser.id)
        .order('claim_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const errors = [
      profileResult.error,
      walletResult.error,
      settingsResult.error,
      claimsResult.error,
    ].filter(Boolean);

    if (errors.length) {
      console.error('Profile loading error:', errors);
      setMessage(
        'Some account information could not load. Please try again.'
      );
    }

    setProfile(profileResult.data);
    setWallet(walletResult.data);
    setSettings(settingsResult.data);
    setLastClaim(claimsResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = nextUtcMidnight() - Date.now();
      setCountdown(countdownText(remaining));
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const todayUtc = new Date().toISOString().slice(0, 10);
  const claimedToday = lastClaim?.claim_date === todayUtc;
  const rewardsEnabled = settings?.daily_rewards_enabled === true;

  async function claimDailyRewards() {
    setClaiming(true);
    setMessage('');

    const db = createClient();
    const { data, error } = await db.rpc('pidgeot_claim_daily_reward');

    setClaiming(false);

    if (error) {
      if (error.message.toLowerCase().includes('already claimed')) {
        setMessage('You have already claimed today’s rewards.');
      } else {
        setMessage(`Could not claim daily rewards: ${error.message}`);
      }

      await loadProfile();
      return;
    }

    const reward = data as {
      claimed?: boolean;
      free_rounds?: number;
      free_coins?: number;
      login_points?: number;
    } | null;

    if (reward?.claimed) {
      setMessage(
        `Rewards claimed! +${reward.free_coins ?? 0} coins, ` +
        `+${reward.login_points ?? 0} prize points, ` +
        `${reward.free_rounds ?? 0} free rounds.`
      );
    } else {
      setMessage('The reward request completed. Refreshing your wallet…');
    }

    await loadProfile();
    window.dispatchEvent(new Event("wallet-updated"));
  }

  async function signOut() {
    const db = createClient();
    const { error } = await db.auth.signOut();
    if (error) setMessage(error.message);
  }

  if (loading) {
    return (
      <section className="grid  place-items-center bg-[#14161c]    p-6">
        <p className="font-bold text-amber-300">
          Loading your flight deck…
        </p>
      </section>
    );
  }

  return (
    <section className=" bg-[#14161c]    px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="overflow-hidden rounded-2xl bg-[#14161c]    p-7 text-white  sm:p-10">
          <p className="text-sm font-bold uppercase tracking-[.25em] text-pink-100">
            Your flight deck
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-3xl">
            Welcome back, {profile?.username || 'Pilot'}!
          </h1>
          <p className="mt-3 max-w-2xl text-white/90">
            Check your credits, collect your daily rewards, and see what
            you can redeem in the prize hangar.
          </p>
        </header>

        {message && (
          <div
            role="status"
            className="rounded-2xl border border-white/10 bg-[#171a21] p-4 text-sm font-medium text-amber-300"
          >
            {message}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <div className={card}>
            <p className="font-semibold text-white/50">Available game coins</p>
            <p className="mt-2 text-4xl font-black text-amber-300">
              {wallet ? Number(wallet.balance).toLocaleString() : '—'}
            </p>
            <p className="mt-2 text-sm text-white/50">
              Available for flights and Prize Shop redemptions.
            </p>
            {!wallet && (
              <p className="mt-3 text-sm text-rose-700">
                No wallet record was found. Please contact the site admin.
              </p>
            )}
          </div>

          <div className={card}>
            <p className="font-semibold text-white/50">Reward points (legacy)</p>
            <p className="mt-2 text-4xl font-black text-amber-300">
              {wallet ? Number(wallet.prize_points ?? 0).toLocaleString() : '—'}
            </p>
            <p className="mt-2 text-sm text-white/50">
              Prize Shop purchases use your game coins.
            </p>
            <a
              href="#prizes"
              className="mt-4 inline-block font-bold text-amber-300 underline"
            >
              Browse prizes →
            </a>
          </div>
        </section>

        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-amber-300">
                Daily hangar bonus
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {claimedToday ? 'Come back tomorrow!' : 'Your daily rewards'}
              </h2>
              <p className="mt-2 text-white/50">
                {claimedToday
                  ? 'You have collected today’s reward. Your next daily claim becomes available at midnight UTC.'
                  : 'Claim your configured free coins, prize points, and free-round allowance.'}
              </p>
            </div>

            <div className="min-w-36 rounded-2xl bg-white/5 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                {claimedToday ? 'Next claim in' : 'Daily reset in'}
              </p>
              <p className="mt-2 font-mono text-xl font-black text-amber-300">
                {countdown}
              </p>
              <p className="mt-1 text-xs text-amber-300">UTC</p>
            </div>
          </div>

          {settings && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-sm text-white/50">Daily coins</p>
                <p className="mt-1 text-2xl font-black text-amber-300">
                  {settings.free_coins_enabled
                    ? settings.daily_free_coins
                    : 0}
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-sm text-white/50">Reward points (legacy)</p>
                <p className="mt-1 text-2xl font-black text-amber-300">
                  {settings.login_bonus_enabled
                    ? settings.daily_login_points
                    : 0}
                </p>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <p className="text-sm text-white/50">Free rounds</p>
                <p className="mt-1 text-2xl font-black text-amber-800">
                  {settings.free_rounds_enabled
                    ? settings.daily_free_rounds
                    : 0}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={claimDailyRewards}
            disabled={
              claiming ||
              claimedToday ||
              !rewardsEnabled ||
              !wallet
            }
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {claiming
              ? 'Claiming rewards…'
              : claimedToday
                ? '✓ Daily rewards claimed'
                : !rewardsEnabled
                  ? 'Daily rewards are currently disabled'
                  : 'Claim daily rewards'}
          </button>

          <p className="mt-3 text-xs text-white/50">
            Daily claims reset at 00:00 UTC. Each daily reward can be claimed once.
            Free-round allowances are recorded separately and must be
            consumed by the game when that feature is connected.
          </p>
        </section>

        <section className={card}>
          <div className="flex items-center justify-between"><h2 className="text-2xl font-black">Pilot account</h2><button onClick={signOut} className="flight-button">Log out</button></div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-white/50">Username</dt>
              <dd className="mt-1 font-bold">
                {profile?.username || 'Not set'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/50">Email</dt>
              <dd className="mt-1 break-all font-bold">
                {user?.email || 'Unavailable'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/50">Account created</dt>
              <dd className="mt-1 font-bold">
                {profile?.created_at || user?.created_at
                  ? new Date(
                      profile?.created_at || user?.created_at || ''
                    ).toLocaleDateString()
                  : 'Unavailable'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/50">Last daily claim</dt>
              <dd className="mt-1 font-bold">
                {lastClaim?.claim_date || 'No claims yet'}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-white/50">Account ID</dt>
              <dd className="mt-1 break-all font-mono text-xs">
                {user?.id}
              </dd>
            </div>
          </dl>
        </section>


      </div>
    </section>
  );
}
