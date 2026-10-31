"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Minus, Plus, Volume2, VolumeX, ChevronDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import Image from "next/image"

interface BetPanel {
  betAmount: string
  betMode: "bet" | "auto"
  autoCashout: string
  autoCashoutEnabled: boolean
  betStatus: "none" | "pending" | "placed" | "cashed"
  betId: string | null
  cashedAmount: number
}

interface PidgeotRound {
  id: string
  round_number: number
  status: "betting" | "flying" | "crashed" | "settled"
  betting_opens_at: string
  starts_at: string | null
  crashed_at: string | null
  crash_multiplier: number | null
}

interface ActiveBet {
  id: string
  username: string
  betAmount: number
  cashout?: number
  cashedAt?: number
}

interface CrashHistory {
  multiplier: number
  color: string
}

interface MyGameHistory {
  id: string
  betAmount: number
  crashPoint: number
  cashedOut: boolean
  cashoutMultiplier: number | null
  winAmount: number
  profit: number
  createdAt: string
}

const CHIP_VALUES = [5, 10, 25, 50]

const DEMO_PLAYERS = [
  "Jollytherancher",
  "EeveeSxx",
  "ImGlob55",
  "Brainzr",
  "Herpesoh9",
  "PidgeotKillah",
  "Imatreecko",
  "MagnemiteCrutch",
  "MagicapCrusade",
  "JoshSlugma",
]

export function PidgeotFlightGame() {
  const [gameState, setGameState] = useState<"waiting" | "flying" | "crashed">("waiting")
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0)
  const [crashPoint, setCrashPoint] = useState(2.0)
  const [countdown, setCountdown] = useState(10)
  const [userBalance, setUserBalance] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [activeTab, setActiveTab] = useState<"all" | "my">("all")

  const [betPanels, setBetPanels] = useState<BetPanel[]>([
    {
      betAmount: "10",
      betMode: "bet",
      autoCashout: "2.00",
      autoCashoutEnabled: false,
      betStatus: "none",
      betId: null,
      cashedAmount: 0,
    },
    {
      betAmount: "10",
      betMode: "bet",
      autoCashout: "2.00",
      autoCashoutEnabled: false,
      betStatus: "none",
      betId: null,
      cashedAmount: 0,
    },
  ])

  const [showPanel2, setShowPanel2] = useState(false)
  const [crashHistory, setCrashHistory] = useState<CrashHistory[]>([])
  const [activeBets, setActiveBets] = useState<ActiveBet[]>([])
  const [myBets, setMyBets] = useState<ActiveBet[]>([])
  const [username, setUsername] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [myGameHistory, setMyGameHistory] = useState<MyGameHistory[]>([])

  const gameStateRef = useRef(gameState)
  const multiplierRef = useRef(currentMultiplier)
  const betPanelsRef = useRef(betPanels)
  const roundRef = useRef<PidgeotRound | null>(null)
  const controllerTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const flightTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastRoundId = useRef<string | null>(null)
  const autoCashoutInFlight = useRef<Set<string>>(new Set())

  const supabase = createClient()

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  useEffect(() => {
    multiplierRef.current = currentMultiplier
  }, [currentMultiplier])

  useEffect(() => {
    betPanelsRef.current = betPanels
  }, [betPanels])

  // Generate a simulated crash point.
  const generateCrashPoint = () => {
    const rand = Math.random()

    if (rand < 0.5) return 1.0 + Math.random() * 1.0
    if (rand < 0.8) return 2.0 + Math.random() * 2.0
    if (rand < 0.95) return 4.0 + Math.random() * 6.0

    return 10.0 + Math.random() * 40.0
  }

  const getMultiplierColor = (mult: number) => {
    if (mult < 2) return "#ff526b"
    if (mult < 10) return "#45e0a0"
    return "#bd83ff"
  }

  const getDisplayName = useCallback(() => {
    return username || "You"
  }, [username])

  const generateDemoBets = useCallback(() => {
    const numBets = Math.floor(Math.random() * 8) + 3
    const bets: ActiveBet[] = []
    const usedPlayers = new Set<string>()

    for (let i = 0; i < numBets; i++) {
      let player =
        DEMO_PLAYERS[Math.floor(Math.random() * DEMO_PLAYERS.length)]

      while (usedPlayers.has(player)) {
        player =
          DEMO_PLAYERS[Math.floor(Math.random() * DEMO_PLAYERS.length)]
      }

      usedPlayers.add(player)

      const amounts = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]

      bets.push({
        id: `demo-${i}-${Date.now()}`,
        username: player,
        betAmount: amounts[Math.floor(Math.random() * amounts.length)],
      })
    }

    return bets
  }, [])

 
  // Keep the database round controller synchronized for every open game client.
  useEffect(() => {
    let mounted = true

    const poll = async () => {
      try {
        const response = await fetch("/api/pidgeot/controller", {
          method: "POST",
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload.round) {
          throw new Error(payload.error || "Could not load the current round")
        }
        if (!mounted) return

        const round = payload.round as PidgeotRound
        roundRef.current = round

        if (lastRoundId.current !== round.id) {
          lastRoundId.current = round.id
          autoCashoutInFlight.current.clear()
          setActiveBets(generateDemoBets())
          setMyBets([])
          setBetPanels((prev) => prev.map((panel) => ({
            ...panel, betStatus: "none", betId: null, cashedAmount: 0,
          })))
        }

        if (round.status === "betting") {
          setGameState("waiting")
          setCurrentMultiplier(1)
          const opens = new Date(round.betting_opens_at).getTime()
          const starts = round.starts_at ? new Date(round.starts_at).getTime() : opens + 10000
          setCountdown(Math.max(0, Math.ceil((starts - Date.now()) / 1000)))
        } else if (round.status === "flying") {
          setGameState("flying")
          if (round.starts_at) {
            const elapsed = Math.max(0, Date.now() - new Date(round.starts_at).getTime())
            const multiplier = Math.floor((1 + elapsed / 3000) * 100) / 100
            setCurrentMultiplier(multiplier)
            setActiveBets((prev) => prev.map((bet) => {
              if (!bet.id.startsWith("demo-") || bet.cashout) return bet
              return Math.random() < 0.015 ? { ...bet, cashout: multiplier, cashedAt: multiplier } : bet
            }))
          }
        } else {
          setGameState("crashed")
          const crash = Number(round.crash_multiplier ?? 1)
          setCurrentMultiplier(crash)
          setCrashPoint(crash)
          setCrashHistory((prev) => prev[0]?.multiplier === crash ? prev : [
            { multiplier: crash, color: getMultiplierColor(crash) }, ...prev.slice(0, 14),
          ])
          void fetchUserBalance()
        }
      } catch (error) {
        console.error("Round synchronization failed:", error)
      }
    }

    void fetchUserBalance()
    void poll()
    controllerTimer.current = setInterval(() => { if (mounted) void poll() }, 1000)
    flightTimer.current = setInterval(() => {
      const round = roundRef.current
      if (!round || round.status !== "flying" || !round.starts_at) return
      const elapsed = Math.max(0, Date.now() - new Date(round.starts_at).getTime())
      const multiplier = Math.floor((1 + elapsed / 3000) * 100) / 100
      setCurrentMultiplier(multiplier)
      betPanelsRef.current.forEach((panel, index) => {
        if (panel.betStatus === "placed" && panel.betId && panel.betMode === "auto" &&
            panel.autoCashoutEnabled && multiplier >= Number(panel.autoCashout) &&
            !autoCashoutInFlight.current.has(panel.betId)) {
          autoCashoutInFlight.current.add(panel.betId)
          void cashoutBet(panel.betId, index)
        }
      })
    }, 100)

    return () => {
      mounted = false
      if (controllerTimer.current) clearInterval(controllerTimer.current)
      if (flightTimer.current) clearInterval(flightTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUserBalance = async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Failed to verify user:", authError.message);
      toast.error("Could not verify your login. Please sign in again.");
      return;
    }

    if (!user) {
      setUserBalance(0);
      setUsername(null);
      setUserId(null);
      toast.error("Please sign in to load your wallet.");
      return;
    }

    setUserId(user.id);
    setUsername(user.email?.split("@")[0] ?? "Pilot");

    const { data: profile, error: profileError } = await supabase
      .from("pidgeot_profiles")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to load profile:", profileError.message);
    }

    if (profile?.username) {
      setUsername(profile.username);
    }

    const { data: wallet, error: walletError } = await supabase
      .from("pidgeot_wallets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (walletError) {
      console.error("Failed to load Supabase wallet:", walletError.message);
      toast.error(`Wallet error: ${walletError.message}`);
      return;
    }

    if (!wallet) {
      setUserBalance(0);
      toast.error("No wallet found for this account.");
      return;
    }

    setUserBalance(Number(wallet.balance));
  };



  const cashoutBet = async (betId: string, panelIndex: number) => {
    try {
      const { data, error } = await supabase.rpc("pidgeot_cashout", { p_bet_id: betId })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      const payout = Number(row?.payout ?? row?.[0]?.payout)
      const cashoutMultiplier = Number(row?.cashout_multiplier ?? row?.[0]?.cashout_multiplier ?? multiplierRef.current)
      if (!Number.isFinite(payout)) throw new Error("Cashout did not return a payout")
      setBetPanels((prev) => prev.map((panel, i) => i === panelIndex ? { ...panel, betStatus: "cashed", cashedAmount: payout } : panel))
      setMyBets((prev) => prev.map((bet) => bet.id === betId ? { ...bet, cashout: cashoutMultiplier, cashedAt: cashoutMultiplier } : bet))
      setActiveBets((prev) => prev.map((bet) => bet.id === betId ? { ...bet, cashout: cashoutMultiplier, cashedAt: cashoutMultiplier } : bet))
      await fetchUserBalance()
      toast.success(`Cashed out at ${cashoutMultiplier.toFixed(2)}x · ${payout} coins`)
    } catch (error) {
      autoCashoutInFlight.current.delete(betId)
      console.error("Cashout failed:", error)
      toast.error(error instanceof Error ? error.message : "Cashout failed")
    }
  }

  const handlePlaceBet = useCallback(async (panelIndex: number) => {
    const panel = betPanelsRef.current[panelIndex]
    const round = roundRef.current
    if (!panel || !round || round.status !== "betting") { toast.error("Bets are closed"); return }
    if (panel.betStatus !== "none") return
    const amount = Number.parseInt(panel.betAmount, 10) || 0
    if (amount < 1 || amount > 50) { toast.error("Bet must be between 1 and 50 coins"); return }
    if (amount > userBalance) { toast.error("Insufficient balance"); return }
    const autoCashout = panel.betMode === "auto" && panel.autoCashoutEnabled ? Number(panel.autoCashout) : null
    if (autoCashout !== null && (!Number.isFinite(autoCashout) || autoCashout < 1.01)) { toast.error("Auto cashout must be at least 1.01x"); return }
    try {
      const { data, error } = await supabase.rpc("pidgeot_place_bet", { p_round_id: round.id, p_amount: amount, p_auto_cashout: autoCashout })
      if (error) throw error
      const bet = Array.isArray(data) ? data[0] : data
      const betId = bet?.id ?? bet?.bet_id
      if (!betId) throw new Error("Bet was accepted but no bet ID was returned")
      const newBet: ActiveBet = { id: betId, username: getDisplayName(), betAmount: amount }
      setBetPanels((prev) => prev.map((item, i) => i === panelIndex ? { ...item, betStatus: "placed", betId } : item))
      setMyBets((prev) => [...prev.filter((item) => item.id !== betId), newBet])
      setActiveBets((prev) => [...prev.filter((item) => item.id !== betId), newBet])
      await fetchUserBalance()
      toast.success(`Bet placed: ${amount} coins`)
    } catch (error) {
      console.error("Place bet failed:", error)
      toast.error(error instanceof Error ? error.message : "Could not place bet")
    }
  }, [userBalance, getDisplayName])

  const handleCashout = useCallback(async (panelIndex: number) => {
    const panel = betPanelsRef.current[panelIndex]
    if (!panel?.betId || panel.betStatus !== "placed") return
    if (roundRef.current?.status !== "flying") { toast.error("The round is no longer flying"); return }
    if (autoCashoutInFlight.current.has(panel.betId)) return
    autoCashoutInFlight.current.add(panel.betId)
    await cashoutBet(panel.betId, panelIndex)
  }, [])

  const handleCancelBet = useCallback(async (panelIndex: number) => {
    const panel = betPanelsRef.current[panelIndex]
    if (!panel?.betId || panel.betStatus !== "placed") return
    if (roundRef.current?.status !== "betting") { toast.error("This bet can no longer be cancelled"); return }
    try {
      const { error } = await supabase.rpc("pidgeot_cancel_bet", { p_bet_id: panel.betId })
      if (error) throw error
      const betId = panel.betId
      setBetPanels((prev) => prev.map((item, i) => i === panelIndex ? { ...item, betStatus: "none", betId: null, cashedAmount: 0 } : item))
      setMyBets((prev) => prev.filter((bet) => bet.id !== betId))
      setActiveBets((prev) => prev.filter((bet) => bet.id !== betId))
      await fetchUserBalance()
      toast.success("Bet cancelled and refunded")
    } catch (error) {
      console.error("Cancel bet failed:", error)
      toast.error(error instanceof Error ? error.message : "Could not cancel bet")
    }
  }, [])

  const updateBetAmount = (index: number, value: string | number) => {
    setBetPanels((prev) => {
      const updated = [...prev]
      const numValue = Number(value)
      const cappedValue = numValue > 50 ? "50" : value.toString()

      updated[index] = {
        ...updated[index],
        betAmount: cappedValue,
      }

      return updated
    })
  }

  const modifyBetAmount = (index: number, delta: number) => {
    setBetPanels((prev) => {
      const updated = [...prev]
      const current = Number.parseInt(updated[index].betAmount) || 0
      const newAmount = current + delta

      updated[index] = {
        ...updated[index],
        betAmount: Math.max(1, Math.min(50, newAmount)).toString(),
      }

      return updated
    })
  }

  const renderBetPanel = (index: number) => {
    const panel = betPanels[index]

    if (!panel) return null

    const canBet = gameState === "waiting" && panel.betStatus === "none"
    const canCashout = gameState === "flying" && panel.betStatus === "placed"
    const isCashed = panel.betStatus === "cashed"

    return (
      <div
        key={index}
        className="space-y-3 rounded-xl border border-white/[0.07] bg-[#111116] p-3 sm:p-4"
      >
        {/* Bet / Auto toggle */}
        <div className="relative flex h-9 gap-1 overflow-hidden rounded-lg bg-black/50 p-1">
          <div
            className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-md bg-[#292932] transition-transform duration-200 ${
              panel.betMode === "auto" ? "translate-x-full" : ""
            }`}
          />

          <button
            type="button"
            onClick={() => {
              setBetPanels((prev) => {
                const updated = [...prev]

                updated[index] = {
                  ...updated[index],
                  betMode: "bet",
                  autoCashoutEnabled: false,
                }

                return updated
              })
            }}
            disabled={!canBet}
            className="relative z-10 flex-1 rounded-md text-sm font-semibold text-white disabled:opacity-40"
          >
            Bet
          </button>

          <button
            type="button"
            onClick={() => {
              setBetPanels((prev) => {
                const updated = [...prev]

                updated[index] = {
                  ...updated[index],
                  betMode: "auto",
                }

                return updated
              })
            }}
            disabled={!canBet}
            className="relative z-10 flex-1 rounded-md text-sm font-semibold text-white/65 disabled:opacity-40"
          >
            Auto
          </button>
        </div>

        {/* Amount */}
        <div>
          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/40">
            Bet amount
          </label>

          <div className="flex h-11 items-center justify-between rounded-lg border border-white/[0.08] bg-black/40 px-3">
            <button
              type="button"
              onClick={() => modifyBetAmount(index, -10)}
              disabled={!canBet}
              aria-label="Decrease bet"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.06] text-white/70 transition hover:bg-white/10 disabled:opacity-30"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            <input
              type="number"
              value={panel.betAmount}
              onChange={(e) => updateBetAmount(index, e.target.value)}
              disabled={!canBet}
              min="1"
              max="50"
              aria-label="Bet amount in coins"
              className="w-20 bg-transparent text-center text-base font-bold text-white outline-none disabled:opacity-50"
            />

            <button
              type="button"
              onClick={() => modifyBetAmount(index, 10)}
              disabled={!canBet}
              aria-label="Increase bet"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.06] text-white/70 transition hover:bg-white/10 disabled:opacity-30"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Quick bet chips */}
        <div className="grid grid-cols-4 gap-2">
          {CHIP_VALUES.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => updateBetAmount(index, chip)}
              disabled={!canBet}
              className={`rounded-md border py-2 text-xs font-semibold transition disabled:opacity-30 ${
                Number(panel.betAmount) === chip
                  ? "border-[#ff426d]/40 bg-[#ff426d]/10 text-[#ff7593]"
                  : "border-white/[0.06] bg-white/[0.025] text-white/55 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Action button */}
        {canCashout ? (
          <button
            type="button"
            onClick={() => handleCashout(index)}
            className="w-full rounded-lg border border-[#ffb15c]/30 bg-gradient-to-b from-[#ff9f43] to-[#e96b20] px-3 py-3 text-white shadow-[0_5px_24px_rgba(255,122,35,0.15)] transition hover:brightness-110 active:scale-[0.99]"
          >
            <span className="block text-base font-black tracking-wide">
              CASH OUT
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-white/90">
              {Math.floor(
                currentMultiplier * Number.parseInt(panel.betAmount),
              ).toLocaleString()}{" "}
              coins · {currentMultiplier.toFixed(2)}x
            </span>
          </button>
        ) : isCashed ? (
          <div className="flex min-h-[58px] flex-col items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
            <span className="text-xs font-bold uppercase tracking-wider">
              Cashed out
            </span>
            <span className="mt-1 text-lg font-black">
              {panel.cashedAmount.toLocaleString()} coins
            </span>
          </div>
        ) : panel.betStatus === "placed" && gameState === "waiting" ? (
          <div className="space-y-2">
            <div className="flex min-h-[46px] items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/10 text-xs font-semibold text-sky-200">
              Bet placed · {panel.betAmount} coins
            </div>

            <button
              type="button"
              onClick={() => handleCancelBet(index)}
              className="w-full rounded-md bg-white/[0.06] py-2 text-xs font-semibold text-white/60 transition hover:bg-red-500/10 hover:text-red-300"
            >
              Cancel bet
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handlePlaceBet(index)}
            disabled={!canBet}
            className="w-full rounded-lg border border-emerald-400/20 bg-gradient-to-b from-[#27bd77] to-[#148653] px-3 py-3 text-white shadow-[0_5px_20px_rgba(25,170,105,0.12)] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <span className="block text-base font-black tracking-wide">
              PLACE BET
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-white/80">
              {panel.betAmount} coins
            </span>
          </button>
        )}

        {/* Auto cashout options */}
        {panel.betMode === "auto" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
            <span className="text-xs text-white/50">Auto cashout</span>

            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={panel.autoCashoutEnabled}
                onChange={(e) =>
                  setBetPanels((prev) => {
                    const updated = [...prev]

                    updated[index] = {
                      ...updated[index],
                      autoCashoutEnabled: e.target.checked,
                    }

                    return updated
                  })
                }
                disabled={!canBet}
                className="peer sr-only"
              />

              <span className="h-5 w-9 rounded-full bg-white/10 transition peer-checked:bg-emerald-500/70 peer-disabled:opacity-30" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </label>

            <input
              type="number"
              value={panel.autoCashout}
              onChange={(e) =>
                setBetPanels((prev) => {
                  const updated = [...prev]

                  updated[index] = {
                    ...updated[index],
                    autoCashout: e.target.value,
                  }

                  return updated
                })
              }
              disabled={!panel.autoCashoutEnabled || !canBet}
              min="1.1"
              step="0.1"
              aria-label="Auto cashout multiplier"
              className="w-20 rounded-md border border-white/[0.08] bg-black/40 px-2 py-1.5 text-center text-sm text-white outline-none focus:border-emerald-400/40 disabled:text-white/25"
            />

            <span className="text-xs text-white/50">x</span>
          </div>
        )}
      </div>
    )
  }

  const displayBets = activeTab === "all" ? activeBets : myBets
  const displayName = getDisplayName()

  const fetchMyGameHistory = useCallback(async () => {
    const storageKey = `pidgeot_history_${userId || "guest"}`
    const existing = localStorage.getItem(storageKey)

    if (existing) {
      try {
        const history = JSON.parse(existing)
        setMyGameHistory(history.slice(0, 10))
      } catch (err) {
        console.error("Failed to parse game history:", err)
      }
    }
  }, [userId])

  useEffect(() => {
    if (userId) {
      fetchMyGameHistory()
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return (
    <div className="flex h-full flex-col bg-[#08080b] text-white lg:flex-row">
      {/* Left: player bets */}
      <aside className="hidden w-[255px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0b0b0f] lg:flex">
        <div className="flex border-b border-white/[0.07] p-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`flex-1 rounded-md px-2 py-2 text-xs font-bold transition ${
              activeTab === "all"
                ? "bg-white/[0.08] text-white"
                : "text-white/40 hover:text-white/75"
            }`}
          >
            All bets <span className="text-white/45">{activeBets.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("my")}
            className={`flex-1 rounded-md px-2 py-2 text-xs font-bold transition ${
              activeTab === "my"
                ? "bg-white/[0.08] text-white"
                : "text-white/40 hover:text-white/75"
            }`}
          >
            My bets <span className="text-white/45">{myBets.length}</span>
          </button>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_48px_48px] gap-2 border-b border-white/[0.05] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/30">
          <span>Player</span>
          <span className="text-right">Bet</span>
          <span className="text-right">Cashout</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {displayBets.length === 0 ? (
            <div className="mt-8 text-center text-xs text-white/35">
              No bets yet
            </div>
          ) : (
            <div className="space-y-1">
              {displayBets.map((bet) => (
                <div
                  key={bet.id}
                  className={`grid grid-cols-[minmax(0,1fr)_48px_48px] items-center gap-2 rounded-md px-2 py-2 text-[11px] ${
                    bet.cashout
                      ? "border border-emerald-400/10 bg-emerald-500/[0.07]"
                      : "bg-white/[0.025]"
                  }`}
                >
                  <span
                    className={`truncate ${
                      bet.username === displayName
                        ? "font-bold text-amber-300"
                        : "text-white/65"
                    }`}
                  >
                    {bet.username === displayName
                      ? `${bet.username} (You)`
                      : bet.username}
                  </span>

                  <span className="text-right font-semibold text-white/65">
                    {bet.betAmount}
                  </span>

                  {bet.cashout ? (
                    <span className="text-right font-bold text-emerald-300">
                      {bet.cashout.toFixed(2)}x
                    </span>
                  ) : (
                    <span className="text-right text-white/25">—</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.07] px-3 py-2 text-[10px] text-white/25">
          All player activity
        </div>
      </aside>

      {/* Main game column */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Recent crash results */}
        <div className="flex h-11 shrink-0 items-center gap-2 overflow-hidden border-b border-white/[0.07] bg-[#0b0b0f] px-3">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-white/35">
            History
          </span>

          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-hide">
            {crashHistory.map((crash, i) => (
              <span
                key={`${crash.multiplier}-${i}`}
                className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold"
                style={{
                  color:
                    crash.multiplier < 2
                      ? "#ff657f"
                      : crash.multiplier < 10
                        ? "#45e0a0"
                        : "#c59aff",
                  backgroundColor:
                    crash.multiplier < 2
                      ? "rgba(255,82,107,.12)"
                      : crash.multiplier < 10
                        ? "rgba(67,220,160,.12)"
                        : "rgba(189,131,255,.12)",
                }}
              >
                {crash.multiplier.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>

        {/* Crash arena: chart background + Pidgeot artwork */}
        <section className="relative flex min-h-[310px] flex-1 flex-col overflow-hidden border-b border-white/[0.07] bg-[#09090d] sm:min-h-[360px] lg:min-h-[440px]">
          {/* Ambient lighting */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 55% 68%, rgba(112,25,105,.24), transparent 52%), radial-gradient(ellipse at 20% 15%, rgba(28,54,100,.12), transparent 45%)",
            }}
          />

          {/* Chart grid and rising crash curve */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 1000 520"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="pidgeotFlightFill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#ff2457" stopOpacity=".28" />
                <stop offset="100%" stopColor="#ff2457" stopOpacity="0" />
              </linearGradient>

              <linearGradient
                id="pidgeotFlightLine"
                x1="0"
                y1="1"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor="#ff5478" />
                <stop offset="100%" stopColor="#ff174d" />
              </linearGradient>
            </defs>

            {Array.from({ length: 9 }, (_, i) => (
              <line
                key={`grid-v-${i}`}
                x1={i * 125}
                y1="0"
                x2={i * 125}
                y2="520"
                stroke="#ffffff"
                strokeOpacity=".045"
              />
            ))}

            {Array.from({ length: 6 }, (_, i) => (
              <line
                key={`grid-h-${i}`}
                x1="0"
                y1={i * 100}
                x2="1000"
                y2={i * 100}
                stroke="#ffffff"
                strokeOpacity=".055"
              />
            ))}

            <path
              d="M 0 510 C 160 505, 260 480, 390 435 S 625 350, 735 230 S 880 95, 1000 20 L 1000 520 L 0 520 Z"
              fill="url(#pidgeotFlightFill)"
            />

            <path
              d="M 0 510 C 160 505, 260 480, 390 435 S 625 350, 735 230 S 880 95, 1000 20"
              fill="none"
              stroke="url(#pidgeotFlightLine)"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Balance badge */}
          <div className="absolute left-3 top-3 z-20 rounded-lg border border-white/10 bg-black/60 px-3 py-2 backdrop-blur-md">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Balance
            </div>
            <div className="mt-0.5 text-sm font-bold text-white">
              {userBalance.toLocaleString()}{" "}
              <span className="text-amber-400">COINS</span>
            </div>
          </div>

          {/* Sound toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled((enabled) => !enabled)}
            aria-label={soundEnabled ? "Mute sound" : "Enable sound"}
            className="absolute right-3 top-3 z-20 rounded-lg border border-white/10 bg-black/60 p-2 text-white/65 transition hover:bg-white/10 hover:text-white"
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>

          {/* Pidgeot stays visible for every game phase */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-4 pt-12 text-center">
            {gameState === "waiting" && (
              <>
                <div className="relative mb-1 h-28 w-32 sm:h-36 sm:w-40 lg:mb-2 lg:h-48 lg:w-52">
                  <Image
                    src="/images/pidgeot-fly.gif"
                    alt="Pidgeot ready to take flight"
                    fill
                    className="object-contain drop-shadow-[0_0_26px_rgba(255,180,60,0.22)]"
                    unoptimized
                    priority
                  />
                </div>

                <div className="text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
                  {countdown}s
                </div>

                <div className="mt-2 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/55 sm:text-xs">
                  Bets are open
                </div>

                <p className="mt-2 text-xs text-white/40">
                  Place your bet before Pidgeot takes off
                </p>
              </>
            )}

            {gameState === "flying" && (
              <>
                <div className="relative mb-0 h-28 w-36 animate-fly-up sm:h-36 sm:w-44 lg:h-48 lg:w-60">
                  <Image
                    src="/images/pidgeot-fly.gif"
                    alt="Pidgeot soaring through the sky"
                    fill
                    className="object-contain drop-shadow-[0_0_30px_rgba(255,55,100,0.4)]"
                    style={{ transform: "rotate(-18deg)" }}
                    unoptimized
                    priority
                  />
                </div>

                <div className="text-5xl font-black leading-none tracking-tight text-white drop-shadow-[0_0_24px_rgba(255,23,77,0.24)] sm:text-7xl lg:text-[100px]">
                  {currentMultiplier.toFixed(2)}x
                </div>

                <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.28em] text-white/50 sm:text-xs">
                  Pidgeot is flying
                </div>
              </>
            )}

            {gameState === "crashed" && (
              <>
                <div className="relative mb-0 h-28 w-36 animate-shake sm:h-36 sm:w-44 lg:h-48 lg:w-60">
                  <Image
                    src="/images/pidgeot-crashed.gif"
                    alt="Pidgeot after the flight crashed"
                    fill
                    className="object-contain drop-shadow-[0_0_30px_rgba(255,45,90,0.35)]"
                    unoptimized
                  />
                </div>

                <div className="text-5xl font-black leading-none tracking-tight text-[#ff5576] sm:text-7xl lg:text-[100px]">
                  {currentMultiplier.toFixed(2)}x
                </div>

                <div className="mt-3 rounded-full border border-[#ff4567]/25 bg-[#ff4567]/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.25em] text-[#ff6682]">
                  Flight ended
                </div>
              </>
            )}
          </div>
        </section>

        {/* Betting controls */}
        <section className="shrink-0 overflow-y-auto border-t border-white/[0.07] bg-[#0b0b0f] p-3 sm:p-4">
          {/* Mobile bet tabs */}
          <div className="mb-3 flex border-b border-white/[0.07] lg:hidden">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`flex-1 py-2 text-xs font-semibold ${
                activeTab === "all"
                  ? "border-b-2 border-[#ff426d] text-white"
                  : "text-white/40"
              }`}
            >
              All bets ({activeBets.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("my")}
              className={`flex-1 py-2 text-xs font-semibold ${
                activeTab === "my"
                  ? "border-b-2 border-[#ff426d] text-white"
                  : "text-white/40"
              }`}
            >
              My bets ({myBets.length})
            </button>
          </div>

          {/* Compact mobile bets list */}
          <div className="mb-3 max-h-[100px] overflow-y-auto lg:hidden">
            {displayBets.length === 0 ? (
              <div className="py-2 text-center text-xs text-white/35">
                No bets yet
              </div>
            ) : (
              <div className="space-y-1">
                {displayBets.slice(0, 5).map((bet) => (
                  <div
                    key={bet.id}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-xs ${
                      bet.cashout
                        ? "bg-emerald-500/[0.07]"
                        : "bg-white/[0.03]"
                    }`}
                  >
                    <span
                      className={
                        bet.username === displayName
                          ? "font-bold text-amber-300"
                          : "text-white/65"
                      }
                    >
                      {bet.username === displayName
                        ? `${bet.username} (You)`
                        : bet.username}
                    </span>

                    <span className="font-semibold text-white/60">
                      {bet.betAmount}
                    </span>

                    {bet.cashout ? (
                      <span className="font-bold text-emerald-300">
                        {bet.cashout.toFixed(2)}x
                      </span>
                    ) : (
                      <span className="text-white/25">—</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Main bet panels and recent games */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {renderBetPanel(0)}

            {showPanel2 ? (
              renderBetPanel(1)
            ) : (
              <div className="hidden rounded-xl border border-white/[0.07] bg-[#111116] p-3 sm:p-4 xl:block">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      My recent games
                    </h3>
                    <p className="mt-1 text-[10px] text-white/35">
                      Your recent flight results
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPanel2(true)}
                    className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-2 text-xs font-semibold text-white/60 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add bet panel
                  </button>
                </div>

                {myGameHistory.length === 0 ? (
                  <div className="py-8 text-center text-xs text-white/35">
                    No game history yet
                  </div>
                ) : (
                  <div className="max-h-[300px] space-y-1 overflow-y-auto">
                    {myGameHistory.map((game) => (
                      <div
                        key={game.id}
                        className={`flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-xs ${
                          game.cashedOut
                            ? "border border-emerald-400/10 bg-emerald-500/[0.05]"
                            : "border border-rose-400/10 bg-rose-500/[0.05]"
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="font-semibold text-white/85">
                            {game.betAmount} coins
                          </span>

                          <span className="mt-1 block truncate text-[10px] text-white/35">
                            {new Date(game.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="block text-[10px] text-white/40">
                            Crashed at {game.crashPoint.toFixed(2)}x
                          </span>

                          {game.cashedOut ? (
                            <span className="mt-1 block font-bold text-emerald-300">
                              +{game.profit} @{" "}
                              {game.cashoutMultiplier?.toFixed(2)}x
                            </span>
                          ) : (
                            <span className="mt-1 block font-bold text-rose-300">
                              {game.profit}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* How to play */}
          <details className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-white/45">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold transition hover:text-white/80">
              <span>How to play</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </summary>

            <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3 leading-relaxed">
              <p>1. Place your bet before the round starts.</p>
              <p>2. Watch the multiplier grow as Pidgeot flies.</p>
              <p>3. Cash out before Pidgeot Crashes to collect your winnings.</p>
              <p>4. If you do not cash out in time, you lose that bet.</p>
            </div>
          </details>
        </section>
      </main>
    </div>
  )
}
