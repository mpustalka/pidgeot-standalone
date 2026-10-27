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
  "SkyRider",
  "WingMaster",
  "CloudChaser",
  "BirdBrain",
  "FeatherFury",
  "SoarHigh",
  "TalonStrike",
  "AeroAce",
  "GustGlider",
  "SwiftWing",
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

  const gameInterval = useRef<NodeJS.Timeout | null>(null)
  const countdownInterval = useRef<NodeJS.Timeout | null>(null)
  const gameStateRef = useRef(gameState)
  const multiplierRef = useRef(currentMultiplier)
  const betPanelsRef = useRef(betPanels)

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

  // Initialize game on mount.
  useEffect(() => {
    let mounted = true

    const init = async () => {
      if (!mounted) return

      await fetchUserBalance()
      if (!mounted) return

      await fetchCrashHistory()
      if (!mounted) return

      startNewRound()
    }

    init()

    return () => {
      mounted = false

      if (gameInterval.current) clearInterval(gameInterval.current)
      if (countdownInterval.current) clearInterval(countdownInterval.current)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUserBalance = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    setUserId(user.id)

    const { data: profile } = await supabase
      .from("pidgeot_profiles")
      .select("username")
      .eq("user_id", user.id)
      .single()

    if (profile?.username) {
      setUsername(profile.username)
    } else if (user.email) {
      setUsername(user.email.split("@")[0])
    }

    try {
      const res = await fetch("/api/credits/balance")

      if (res.ok) {
        const contentType = res.headers.get("content-type")

        if (contentType?.includes("application/json")) {
          const data = await res.json()
          setUserBalance(data.balance || 0)
        }
      }
    } catch (err) {
      console.error("Failed to fetch balance:", err)
    }
  }

  const fetchCrashHistory = async () => {
    const history: CrashHistory[] = []

    for (let i = 0; i < 10; i++) {
      const mult = generateCrashPoint()

      history.push({
        multiplier: mult,
        color: getMultiplierColor(mult),
      })
    }

    setCrashHistory(history)
  }

  const startNewRound = () => {
    setGameState("waiting")
    setCurrentMultiplier(1.0)
    setCountdown(10)

    const crash = generateCrashPoint()
    setCrashPoint(crash)

    const demoBets = generateDemoBets()

    setActiveBets(demoBets)
    setMyBets([])

    // Reset panels while keeping queued bets.
    setBetPanels((prev) =>
      prev.map((panel) => ({
        ...panel,
        betStatus: panel.betStatus === "pending" ? "pending" : "none",
        betId: null,
        cashedAmount: 0,
      })),
    )

    let count = 10

    countdownInterval.current = setInterval(() => {
      count--
      setCountdown(count)

      if (count <= 0 && countdownInterval.current) {
        clearInterval(countdownInterval.current)
      }
    }, 1000)

    // Begin flight after the betting countdown.
    setTimeout(() => {
      const displayName = getDisplayName()

      setBetPanels((prev) => {
        const updated = [...prev]

        updated.forEach((panel, i) => {
          if (panel.betStatus === "pending") {
            const amount = Number.parseInt(panel.betAmount)

            updated[i] = {
              ...panel,
              betStatus: "placed",
              betId: `bet-${Date.now()}-${i}`,
            }

            const newBet: ActiveBet = {
              id: `my-${Date.now()}-${i}`,
              username: displayName,
              betAmount: amount,
            }

            setMyBets((current) => [...current, newBet])
            setActiveBets((current) => [...current, newBet])
          }
        })

        return updated
      })

      startFlying(crash)
    }, 10000)
  }

  const startFlying = (crash: number) => {
    setGameState("flying")

    const startTime = Date.now()

    gameInterval.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      const mult = 1.0 + elapsed / 3000

      if (mult >= crash) {
        crashGame(crash)
      } else {
        setCurrentMultiplier(mult)

        setActiveBets((prev) => {
          const displayName = getDisplayName()

          return prev.map((bet) => {
            if (
              !bet.cashout &&
              bet.username !== displayName &&
              Math.random() < 0.02
            ) {
              return {
                ...bet,
                cashout: mult,
                cashedAt: mult,
              }
            }

            return bet
          })
        })

        // Check auto cashout for the user's active panels.
        betPanelsRef.current.forEach((panel, i) => {
          if (
            panel.betStatus === "placed" &&
            panel.betMode === "auto" &&
            panel.autoCashoutEnabled &&
            mult >= Number.parseFloat(panel.autoCashout)
          ) {
            handleCashout(i)
          }
        })
      }
    }, 50)
  }

  const crashGame = (crashMult: number) => {
    if (gameInterval.current) clearInterval(gameInterval.current)
    if (countdownInterval.current) clearInterval(countdownInterval.current)

    setGameState("crashed")
    setCurrentMultiplier(crashMult)

    setCrashHistory((prev) => [
      {
        multiplier: crashMult,
        color: getMultiplierColor(crashMult),
      },
      ...prev.slice(0, 14),
    ])

    // Save game history for the user's bets.
    betPanelsRef.current.forEach((panel) => {
      if (panel.betStatus === "placed" || panel.betStatus === "cashed") {
        const betAmount = Number.parseInt(panel.betAmount) || 0
        const cashedOut = panel.betStatus === "cashed"
        const cashoutMult = cashedOut ? panel.cashedAmount / betAmount : 0
        const winAmount = cashedOut ? panel.cashedAmount : 0
        const profit = cashedOut ? winAmount - betAmount : -betAmount

        const gameResult: MyGameHistory = {
          id: `${Date.now()}-${Math.random()}`,
          betAmount,
          crashPoint: crashMult,
          cashedOut,
          cashoutMultiplier: cashedOut ? cashoutMult : null,
          winAmount,
          profit,
          createdAt: new Date().toISOString(),
        }

        const storageKey = `pidgeot_history_${userId || "guest"}`
        const existing = localStorage.getItem(storageKey)
        const history = existing ? JSON.parse(existing) : []

        history.unshift(gameResult)

        localStorage.setItem(
          storageKey,
          JSON.stringify(history.slice(0, 50)),
        )

        setMyGameHistory((prev) => [gameResult, ...prev.slice(0, 49)])
      }
    })

    // Reset panels after the crash.
    setBetPanels((prev) =>
      prev.map((panel) => ({
        ...panel,
        betStatus: "none",
        betId: null,
        cashedAmount: 0,
      })),
    )

    fetchUserBalance()

    // Start another round after the crash display.
    setTimeout(() => startNewRound(), 4000)
  }

  const handlePlaceBet = useCallback(
    (panelIndex: number) => {
      const panel = betPanelsRef.current[panelIndex]

      if (!panel) return

      const amount = Number.parseInt(panel.betAmount) || 0
      const displayName = getDisplayName()

      if (amount < 1) {
        toast.error("Minimum bet is 1 coin")
        return
      }

      if (amount > 50) {
        toast.error("Maximum bet is 50 coins")
        return
      }

      if (amount > userBalance) {
        toast.error("Insufficient balance")
        return
      }

      if (gameStateRef.current === "waiting") {
        setBetPanels((prev) => {
          const updated = [...prev]

          updated[panelIndex] = {
            ...updated[panelIndex],
            betStatus: "placed",
            betId: `bet-${Date.now()}-${panelIndex}`,
          }

          return updated
        })

        setUserBalance((prev) => prev - amount)

        const newBet: ActiveBet = {
          id: `my-${Date.now()}-${panelIndex}`,
          username: displayName,
          betAmount: amount,
        }

        setMyBets((prev) => [...prev, newBet])
        setActiveBets((prev) => [...prev, newBet])

        toast.success(`Bet placed: ${amount} coins`)
      } else if (gameStateRef.current === "flying") {
        setBetPanels((prev) => {
          const updated = [...prev]

          updated[panelIndex] = {
            ...updated[panelIndex],
            betStatus: "pending",
          }

          return updated
        })

        setUserBalance((prev) => prev - amount)
        toast.info("Bet queued for next round")
      } else {
        toast.error("Cannot bet during crash")
      }
    },
    [userBalance, getDisplayName],
  )

  const handleCashout = useCallback(
    (panelIndex: number) => {
      const panel = betPanelsRef.current[panelIndex]

      if (!panel) return

      const currentMult = multiplierRef.current
      const currentGameState = gameStateRef.current
      const displayName = getDisplayName()

      if (panel.betStatus !== "placed") return
      if (currentGameState !== "flying") return

      const betAmt = Number.parseInt(panel.betAmount)
      const winAmount = Math.floor(betAmt * currentMult)

      setBetPanels((prev) => {
        const updated = [...prev]

        updated[panelIndex] = {
          ...updated[panelIndex],
          betStatus: "cashed",
          cashedAmount: winAmount,
        }

        return updated
      })

      setUserBalance((prev) => prev + winAmount)

      setMyBets((prev) =>
        prev.map((bet) =>
          bet.id === panel.betId
            ? {
                ...bet,
                cashout: currentMult,
                cashedAt: currentMult,
              }
            : bet,
        ),
      )

      setActiveBets((prev) =>
        prev.map((bet) =>
          bet.username === displayName && !bet.cashout
            ? {
                ...bet,
                cashout: currentMult,
                cashedAt: currentMult,
              }
            : bet,
        ),
      )

      toast.success(
        `Cashed out at ${currentMult.toFixed(2)}x! Won ${winAmount} coins!`,
      )
    },
    [getDisplayName],
  )

  const handleCancelBet = useCallback((panelIndex: number) => {
    const panel = betPanelsRef.current[panelIndex]

    if (!panel || panel.betStatus !== "pending") return

    const amount = Number.parseInt(panel.betAmount)

    setBetPanels((prev) => {
      const updated = [...prev]

      updated[panelIndex] = {
        ...updated[panelIndex],
        betStatus: "none",
      }

      return updated
    })

    setUserBalance((prev) => prev + amount)
    toast.info("Bet cancelled")
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
    const isPending = panel.betStatus === "pending"
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
        ) : isPending ? (
          <div className="space-y-2">
            <div className="flex min-h-[46px] items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/10 text-xs font-semibold text-sky-200">
              Bet queued for next round
            </div>

            <button
              type="button"
              onClick={() => handleCancelBet(index)}
              className="w-full rounded-md bg-white/[0.06] py-2 text-xs font-semibold text-white/60 transition hover:bg-red-500/10 hover:text-red-300"
            >
              Cancel queued bet
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
          Demo player activity
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
              <p>3. Cash out before the flight ends to collect your winnings.</p>
              <p>4. If you do not cash out in time, you lose that bet.</p>
            </div>
          </details>
        </section>
      </main>
    </div>
  )
}