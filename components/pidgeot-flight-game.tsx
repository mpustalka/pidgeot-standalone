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

  // Generate crash point - house edge favored
  const generateCrashPoint = () => {
    const rand = Math.random()
    // 50% chance of crashing between 1.0x - 2.0x (house wins most bets)
    if (rand < 0.5) return 1.0 + Math.random() * 1.0
    // 30% chance of crashing between 2.0x - 4.0x
    if (rand < 0.8) return 2.0 + Math.random() * 2.0
    // 15% chance of crashing between 4.0x - 10.0x
    if (rand < 0.95) return 4.0 + Math.random() * 6.0
    // 5% chance of high multiplier 10.0x - 50.0x
    return 10.0 + Math.random() * 40.0
  }

  const getMultiplierColor = (mult: number) => {
    if (mult < 2) return "#e50539"
    if (mult < 10) return "#00e701"
    return "#9d4edd"
  }

  const getDisplayName = useCallback(() => {
    return username || "You"
  }, [username])

  const generateDemoBets = useCallback(() => {
    const numBets = Math.floor(Math.random() * 8) + 3
    const bets: ActiveBet[] = []
    const usedPlayers = new Set<string>()

    for (let i = 0; i < numBets; i++) {
      let player = DEMO_PLAYERS[Math.floor(Math.random() * DEMO_PLAYERS.length)]
      while (usedPlayers.has(player)) {
        player = DEMO_PLAYERS[Math.floor(Math.random() * DEMO_PLAYERS.length)]
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

  // Initialize game - only run once on mount
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

    const { data: profile } = await supabase.from("pidgeot_profiles").select("username").eq("user_id", user.id).single()

    if (profile?.username) {
      setUsername(profile.username)
    } else if (user.email) {
      // Fallback to email username
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
    // Generate some demo history
    const history: CrashHistory[] = []
    for (let i = 0; i < 10; i++) {
      const mult = generateCrashPoint()
      history.push({ multiplier: mult, color: getMultiplierColor(mult) })
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

    // Reset bet panels for new round (keep pending bets)
    setBetPanels((prev) =>
      prev.map((panel) => ({
        ...panel,
        betStatus: panel.betStatus === "pending" ? "pending" : "none",
        betId: null,
        cashedAmount: 0,
      })),
    )

    // Countdown timer
    let count = 10
    countdownInterval.current = setInterval(() => {
      count--
      setCountdown(count)
      if (count <= 0) {
        if (countdownInterval.current) clearInterval(countdownInterval.current)
      }
    }, 1000)

    // Start flying after countdown
    setTimeout(() => {
      const displayName = getDisplayName()

      setBetPanels((prev) => {
        const updated = [...prev]
        updated.forEach((panel, i) => {
          if (panel.betStatus === "pending") {
            const amount = Number.parseInt(panel.betAmount)
            updated[i] = { ...panel, betStatus: "placed", betId: `bet-${Date.now()}-${i}` }
            // Add to my bets
            setMyBets((current) => [
              ...current,
              {
                id: `my-${Date.now()}-${i}`,
                username: displayName,
                betAmount: amount,
              },
            ])
            // Also add to active bets
            setActiveBets((current) => [
              ...current,
              {
                id: `my-${Date.now()}-${i}`,
                username: displayName,
                betAmount: amount,
              },
            ])
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
          const updated = prev.map((bet) => {
            if (!bet.cashout && bet.username !== displayName && Math.random() < 0.02) {
              return { ...bet, cashout: mult, cashedAt: mult }
            }
            return bet
          })
          return updated
        })

        // Check auto cashouts for user using ref for current state
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

    setCrashHistory((prev) => [{ multiplier: crashMult, color: getMultiplierColor(crashMult) }, ...prev.slice(0, 14)])

    // Save game history for user bets
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

        // Save to localStorage
        const storageKey = `pidgeot_history_${userId || 'guest'}`
        const existing = localStorage.getItem(storageKey)
        const history = existing ? JSON.parse(existing) : []
        history.unshift(gameResult)
        localStorage.setItem(storageKey, JSON.stringify(history.slice(0, 50))) // Keep last 50

        // Update state
        setMyGameHistory((prev) => [gameResult, ...prev.slice(0, 49)])
      }
    })

    // Reset panels - lose any uncashed bets
    setBetPanels((prev) =>
      prev.map((panel) => ({
        ...panel,
        betStatus: "none",
        betId: null,
        cashedAmount: 0,
      })),
    )

    fetchUserBalance()

    // Start new round after delay
    setTimeout(() => startNewRound(), 4000)
  }

  const handlePlaceBet = useCallback(
    (panelIndex: number) => {
      const panel = betPanelsRef.current[panelIndex]
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
        // Place bet immediately during waiting phase
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

        // Add to bets display with actual username
        const newBet: ActiveBet = {
          id: `my-${Date.now()}-${panelIndex}`,
          username: displayName,
          betAmount: amount,
        }
        setMyBets((prev) => [...prev, newBet])
        setActiveBets((prev) => [...prev, newBet])

        toast.success(`Bet placed: ${amount} coins`)
      } else if (gameStateRef.current === "flying") {
        // Queue for next round
        setBetPanels((prev) => {
          const updated = [...prev]
          updated[panelIndex] = { ...updated[panelIndex], betStatus: "pending" }
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
      const currentMult = multiplierRef.current
      const currentGameState = gameStateRef.current
      const displayName = getDisplayName()

      console.log("[v0] handleCashout called", { panelIndex, betStatus: panel.betStatus, gameState: currentGameState })

      if (panel.betStatus !== "placed") {
        console.log("[v0] Cannot cashout - bet not placed")
        return
      }
      if (currentGameState !== "flying") {
        console.log("[v0] Cannot cashout - game not flying")
        return
      }

      const betAmt = Number.parseInt(panel.betAmount)
      const winAmount = Math.floor(betAmt * currentMult)

      console.log("[v0] Cashing out", { betAmt, currentMult, winAmount })

      setBetPanels((prev) => {
        const updated = [...prev]
        updated[panelIndex] = { ...updated[panelIndex], betStatus: "cashed", cashedAmount: winAmount }
        return updated
      })
      setUserBalance((prev) => prev + winAmount)

      // Update bets display
      setMyBets((prev) =>
        prev.map((bet) => (bet.id === panel.betId ? { ...bet, cashout: currentMult, cashedAt: currentMult } : bet)),
      )
      setActiveBets((prev) =>
        prev.map((bet) =>
          bet.username === displayName && !bet.cashout ? { ...bet, cashout: currentMult, cashedAt: currentMult } : bet,
        ),
      )

      toast.success(`Cashed out at ${currentMult.toFixed(2)}x! Won ${winAmount} coins!`)
    },
    [getDisplayName],
  )

  const handleCancelBet = useCallback((panelIndex: number) => {
    const panel = betPanelsRef.current[panelIndex]
    if (panel.betStatus !== "pending") return

    const amount = Number.parseInt(panel.betAmount)
    setBetPanels((prev) => {
      const updated = [...prev]
      updated[panelIndex] = { ...updated[panelIndex], betStatus: "none" }
      return updated
    })
    setUserBalance((prev) => prev + amount)
    toast.info("Bet cancelled")
  }, [])

  const updateBetAmount = (index: number, value: string | number) => {
    setBetPanels((prev) => {
      const updated = [...prev]
      const numValue = Number(value)
      // Cap at 50 coins max
      const cappedValue = numValue > 50 ? "50" : value.toString()
      updated[index] = { ...updated[index], betAmount: cappedValue }
      return updated
    })
  }

  const modifyBetAmount = (index: number, delta: number) => {
    setBetPanels((prev) => {
      const updated = [...prev]
      const current = Number.parseInt(updated[index].betAmount) || 0
      const newAmount = current + delta
      // Keep between 1 and 50
      updated[index] = { ...updated[index], betAmount: Math.max(1, Math.min(50, newAmount)).toString() }
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
      <div key={index} className="bg-[#1a1a1a] rounded-lg p-3 space-y-2">
        {/* Bet/Auto Toggle */}
        <div className="flex gap-1 relative h-8 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div
            className={`absolute w-1/2 h-full bg-[#2c2d30] rounded-full transition-transform duration-300 ${panel.betMode === "auto" ? "translate-x-full" : ""}`}
          />
          <button
            onClick={() => {
              setBetPanels((prev) => {
                const u = [...prev]
                u[index] = { ...u[index], betMode: "bet", autoCashoutEnabled: false }
                return u
              })
            }}
            disabled={!canBet}
            className="flex-1 relative z-10 rounded-full disabled:opacity-50 text-sm"
          >
            Bet
          </button>
          <button
            onClick={() => {
              setBetPanels((prev) => {
                const u = [...prev]
                u[index] = { ...u[index], betMode: "auto" }
                return u
              })
            }}
            disabled={!canBet}
            className="flex-1 relative z-10 rounded-full disabled:opacity-50 text-sm"
          >
            Auto
          </button>
        </div>

        {/* Bet Amount */}
        <div className="flex justify-between items-center h-[32px] bg-black rounded-full px-2 text-white">
          <button
            onClick={() => modifyBetAmount(index, -10)}
            disabled={!canBet}
            className="w-[18px] h-[18px] rounded-full border border-white/60 flex items-center justify-center disabled:opacity-30"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
          <input
            type="number"
            value={panel.betAmount}
            onChange={(e) => updateBetAmount(index, e.target.value)}
            disabled={!canBet}
            min="1"
            max="50"
            className="bg-transparent text-center w-[70px] font-bold text-base outline-none disabled:opacity-50"
          />
          <button
            onClick={() => modifyBetAmount(index, 10)}
            disabled={!canBet}
            className="w-[18px] h-[18px] rounded-full border border-white/60 flex items-center justify-center disabled:opacity-30"
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* Chip Selector */}
        <div className="grid grid-cols-4 gap-1">
          {CHIP_VALUES.map((chip) => (
            <button
              key={chip}
              onClick={() => updateBetAmount(index, chip)}
              disabled={!canBet}
              className="bg-[#171717] rounded py-1 text-white/60 text-xs hover:bg-[#272727] disabled:opacity-30"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Action Button - CASH OUT prominent during flying */}
        {canCashout ? (
          <button
            type="button"
            onClick={() => {
              console.log("[v0] Cash out button clicked for panel", index)
              handleCashout(index)
            }}
            className="w-full h-[60px] rounded-xl bg-gradient-to-b from-[#ff6b00] to-[#cc4400] border-2 border-orange-400 text-white font-bold text-lg hover:from-[#ff8533] hover:to-[#e65c00] animate-pulse shadow-lg shadow-orange-500/50 cursor-pointer"
          >
            <div className="text-xl">CASH OUT</div>
            <div className="text-sm font-normal">
              {(currentMultiplier * Number.parseInt(panel.betAmount)).toFixed(0)} coins @ {currentMultiplier.toFixed(2)}
              x
            </div>
          </button>
        ) : isCashed ? (
          <div className="w-full h-[60px] rounded-xl bg-gradient-to-b from-green-600 to-green-800 flex flex-col items-center justify-center text-white font-bold border border-green-400">
            <div className="text-sm">CASHED OUT</div>
            <div className="text-lg">{panel.cashedAmount} coins</div>
          </div>
        ) : isPending ? (
          <div className="flex flex-col gap-1">
            <div className="w-full h-[44px] rounded-xl bg-gradient-to-b from-blue-600 to-blue-800 flex items-center justify-center text-white font-bold border border-blue-400/50">
              <div className="text-sm animate-pulse">Waiting for next round...</div>
            </div>
            <button
              type="button"
              onClick={() => handleCancelBet(index)}
              className="w-full h-[28px] rounded-lg bg-red-700/80 text-white text-xs font-bold hover:bg-red-600 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              console.log("[v0] Bet button clicked for panel", index)
              handlePlaceBet(index)
            }}
            disabled={!canBet}
            className="w-full h-[60px] rounded-xl bg-gradient-to-b from-[#28a909] to-[#1a6b06] border border-green-400/50 text-white font-bold text-lg hover:from-[#32c90b] hover:to-[#228208] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <div>BET</div>
            <div className="text-sm font-normal">{panel.betAmount} coins</div>
          </button>
        )}

        {/* Auto Cashout */}
        {panel.betMode === "auto" && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">Auto Cash Out</span>
            <label className="relative inline-block w-8 h-4">
              <input
                type="checkbox"
                checked={panel.autoCashoutEnabled}
                onChange={(e) =>
                  setBetPanels((prev) => {
                    const u = [...prev]
                    u[index] = { ...u[index], autoCashoutEnabled: e.target.checked }
                    return u
                  })
                }
                disabled={!canBet}
                className="sr-only peer"
              />
              <div className="w-full h-full bg-gray-700 rounded-full peer-checked:bg-green-600 peer-disabled:opacity-30" />
              <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </label>
            <input
              type="number"
              value={panel.autoCashout}
              onChange={(e) =>
                setBetPanels((prev) => {
                  const u = [...prev]
                  u[index] = { ...u[index], autoCashout: e.target.value }
                  return u
                })
              }
              disabled={!panel.autoCashoutEnabled || !canBet}
              step="0.1"
              className="w-12 bg-[#1f1f1f] rounded px-1 py-0.5 text-center outline-none disabled:text-gray-600"
            />
            <span className="text-white">x</span>
          </div>
        )}
      </div>
    )
  }

  const displayBets = activeTab === "all" ? activeBets : myBets
  const displayName = getDisplayName()

  const fetchMyGameHistory = useCallback(async () => {
    // Load from localStorage for now (frontend-only demo version)
    const storageKey = `pidgeot_history_${userId || 'guest'}`
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
    <div className="flex flex-col lg:flex-row h-full bg-black text-white">
      {/* Left: Bet Board (Desktop) */}
      <div className="hidden lg:flex w-[280px] bg-[#0a0a0a] border-r border-white/10 flex-col">
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 py-2 text-sm font-medium ${activeTab === "all" ? "bg-[#1a1a1a] text-white" : "text-gray-400 hover:text-white"}`}
          >
            All Bets ({activeBets.length})
          </button>
          <button
            onClick={() => setActiveTab("my")}
            className={`flex-1 py-2 text-sm font-medium ${activeTab === "my" ? "bg-[#1a1a1a] text-white" : "text-gray-400 hover:text-white"}`}
          >
            My Bets ({myBets.length})
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {displayBets.length === 0 ? (
            <div className="text-center text-gray-500 text-sm mt-8">No bets yet</div>
          ) : (
            <div className="space-y-1">
              {displayBets.map((bet) => (
                <div
                  key={bet.id}
                  className={`rounded p-2 flex items-center justify-between text-xs ${bet.cashout ? "bg-green-900/30 border border-green-700/50" : "bg-[#141516]"}`}
                >
                  <span
                    className={`truncate max-w-[80px] ${bet.username === displayName ? "text-yellow-400 font-bold" : "text-white/70"}`}
                  >
                    {bet.username === displayName ? `${bet.username} (You)` : bet.username}
                  </span>
                  <span className="text-yellow-500 font-bold">{bet.betAmount}</span>
                  {bet.cashout ? (
                    <span className="text-green-400 font-bold">{bet.cashout.toFixed(2)}x</span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: Game Canvas */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Crash History Bar */}
        <div className="h-[40px] flex items-center gap-2 px-3 bg-[#0a0a0a] border-b border-white/10 overflow-hidden flex-shrink-0">
          <span className="text-xs text-gray-400 flex-shrink-0">History:</span>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {crashHistory.map((crash, i) => (
              <span
                key={i}
                style={{ backgroundColor: crash.color }}
                className="px-2 py-0.5 rounded text-white font-bold text-xs whitespace-nowrap flex-shrink-0"
              >
                {crash.multiplier.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>

        {/* Game Canvas */}
        <div className="flex-1 relative bg-gradient-to-b from-[#1a0033] via-[#0a0a0a] to-black flex items-center justify-center min-h-[180px] lg:min-h-[300px] overflow-hidden">
          {gameState === "waiting" && (
            <div className="text-center">
              <div className="relative w-28 h-28 lg:w-44 lg:h-44 mx-auto mb-2 lg:mb-4">
                <Image
                  src="/images/pidgeot-fly.gif"
                  alt="Pidgeot waiting"
                  fill
                  className="object-contain opacity-70"
                  unoptimized
                />
              </div>
              <div className="text-3xl lg:text-6xl font-black text-yellow-400 mb-2">{countdown}s</div>
              <div className="text-sm lg:text-xl text-gray-300">Place your bets!</div>
            </div>
          )}

          {gameState === "flying" && (
            <div className="text-center relative">
              {/* Flying Pidgeot with upward animation */}
              <div className="relative w-36 h-36 lg:w-52 lg:h-52 mx-auto mb-2 lg:mb-4 animate-fly-up">
                <Image
                  src="/images/pidgeot-fly.gif"
                  alt="Pidgeot flying"
                  fill
                  className="object-contain drop-shadow-[0_0_30px_rgba(34,197,94,0.6)]"
                  style={{ transform: "rotate(-30deg)" }}
                  unoptimized
                />
              </div>
              <div className="text-5xl lg:text-[100px] font-black text-green-400 leading-none drop-shadow-[0_0_20px_rgba(34,197,94,0.5)]">
                {currentMultiplier.toFixed(2)}x
              </div>
            </div>
          )}

          {gameState === "crashed" && (
            <div className="text-center">
              {/* Crashed Pidgeot with shake animation */}
              <div className="relative w-36 h-36 lg:w-52 lg:h-52 mx-auto mb-2 lg:mb-4 animate-shake">
                <Image
                  src="/images/pidgeot-crashed.gif"
                  alt="Pidgeot crashed"
                  fill
                  className="object-contain drop-shadow-[0_0_30px_rgba(239,68,68,0.6)]"
                  unoptimized
                />
              </div>
              <div className="text-5xl lg:text-[100px] font-black text-red-500 leading-none drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                {currentMultiplier.toFixed(2)}x
              </div>
              <div className="text-xl lg:text-3xl font-bold text-red-400 mt-2 animate-pulse">CRASHED!</div>
            </div>
          )}

          {/* Balance Overlay */}
          <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-yellow-500/30">
            <div className="text-[10px] text-gray-400">Balance</div>
            <div className="text-sm lg:text-base font-bold text-yellow-400">{userBalance.toLocaleString()}</div>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="absolute top-2 right-2 p-2 bg-black/60 rounded-full hover:bg-black/80"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>

        {/* Bottom: Bet Controls */}
        <div className="bg-[#0d0d0d] border-t border-white/10 p-3 flex-shrink-0 overflow-y-auto max-h-[45vh] lg:max-h-[40vh]">
          {/* Mobile Tabs */}
          <div className="lg:hidden flex border-b border-white/10 mb-3">
            <button
              onClick={() => setActiveTab("all")}
              className={`flex-1 py-2 text-sm font-medium ${activeTab === "all" ? "border-b-2 border-yellow-500 text-white" : "text-gray-400"}`}
            >
              All Bets ({activeBets.length})
            </button>
            <button
              onClick={() => setActiveTab("my")}
              className={`flex-1 py-2 text-sm font-medium ${activeTab === "my" ? "border-b-2 border-yellow-500 text-white" : "text-gray-400"}`}
            >
              My Bets ({myBets.length})
            </button>
          </div>

          {/* Mobile Bets List */}
          <div className="lg:hidden mb-3 max-h-[100px] overflow-y-auto">
            {displayBets.length === 0 ? (
              <div className="text-center text-gray-500 text-xs py-2">No bets yet</div>
            ) : (
              <div className="space-y-1">
                {displayBets.slice(0, 5).map((bet) => (
                  <div
                    key={bet.id}
                    className={`rounded p-2 flex items-center justify-between text-xs ${bet.cashout ? "bg-green-900/30" : "bg-[#141516]"}`}
                  >
                    <span className={bet.username === displayName ? "text-yellow-400 font-bold" : "text-white/70"}>
                      {bet.username === displayName ? `${bet.username} (You)` : bet.username}
                    </span>
                    <span className="text-yellow-500 font-bold">{bet.betAmount}</span>
                    {bet.cashout ? (
                      <span className="text-green-400 font-bold">{bet.cashout.toFixed(2)}x</span>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bet Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {renderBetPanel(0)}
            {showPanel2 ? (
              renderBetPanel(1)
            ) : (
              <div className="hidden lg:block">
                <div className="bg-[#1a1a1a] rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">My Recent Games</h3>
                    <button
                      onClick={() => setShowPanel2(true)}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add Bet Panel
                    </button>
                  </div>
                  {myGameHistory.length === 0 ? (
                    <div className="text-center text-gray-500 text-xs py-8">No game history yet</div>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto space-y-1">
                      {myGameHistory.map((game) => (
                        <div
                          key={game.id}
                          className={`flex justify-between items-center text-xs py-2 px-3 rounded ${
                            game.cashedOut
                              ? "bg-green-900/20 border border-green-700/30"
                              : "bg-red-900/20 border border-red-700/30"
                          }`}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-white/90 font-medium">{game.betAmount} coins</span>
                            <span className="text-gray-500 text-[10px]">
                              {new Date(game.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-gray-400 text-[10px]">Crashed @ {game.crashPoint.toFixed(2)}x</span>
                            {game.cashedOut ? (
                              <>
                                <span className="text-green-400 font-bold">
                                  +{game.profit} @ {game.cashoutMultiplier?.toFixed(2)}x
                                </span>
                              </>
                            ) : (
                              <span className="text-red-400 font-bold">{game.profit}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* How to Play */}
          <details className="mt-3 text-xs text-gray-400">
            <summary className="cursor-pointer hover:text-white flex items-center gap-1">
              <ChevronDown className="w-3 h-3" /> How to Play
            </summary>
            <div className="mt-2 p-2 bg-[#1a1a1a] rounded text-gray-300">
              <p>1. Place your bet before the round starts</p>
              <p>2. Watch the multiplier grow as Pidgeot flies</p>
              <p>3. Cash out before it crashes to win!</p>
              <p>4. If you don&apos;t cash out in time, you lose your bet</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
