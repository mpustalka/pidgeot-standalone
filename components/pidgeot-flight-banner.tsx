"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { TrendingUp, Rocket, Zap } from "lucide-react"

export function PidgeotFlightBanner() {
  return (
    <Card className="relative overflow-hidden bg-gradient-to-r from-black via-red-950 to-black border-2 border-yellow-500/50 hover:border-yellow-500 transition-all">
      {/* Animated background */}
      <div className="absolute inset-0 bg-[url('/images/stars-pattern.png')] opacity-20 animate-pulse" />
      
      <div className="relative p-8 md:p-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Left: Game Info */}
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 animate-bounce">
                <img 
                  src="/images/pidgeot-icon.webp" 
                  alt="Pidgeot" 
                  className="w-full h-full object-contain drop-shadow-[0_0_10px_rgba(250,204,21,0.7)]"
                />
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
                PIDGEOT FLIGHT
              </h2>
            </div>
            
            <p className="text-xl text-gray-300 max-w-2xl">
              Experience the ultimate crash game! Watch the multiplier soar as Pidgeot takes flight. 
              Cash out before the crash to win big!
            </p>

            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 bg-green-500/20 px-4 py-2 rounded-full border border-green-500/50">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-green-300 font-semibold">Up to 1000x Multiplier</span>
              </div>
              <div className="flex items-center gap-2 bg-red-500/20 px-4 py-2 rounded-full border border-red-500/50">
                <Zap className="w-4 h-4 text-red-400" />
                <span className="text-red-300 font-semibold">Instant Cashouts</span>
              </div>
              <div className="flex items-center gap-2 bg-blue-500/20 px-4 py-2 rounded-full border border-blue-500/50">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-blue-300 font-semibold">Live Multiplayer</span>
              </div>
            </div>
          </div>

          {/* Right: CTA Button */}
          <div className="flex-shrink-0">
            <Link href="/pidgeot-flight">
              <Button 
                size="lg"
                className="bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500 hover:from-yellow-600 hover:via-yellow-700 hover:to-yellow-600 text-black font-black text-xl px-12 py-8 shadow-2xl shadow-yellow-500/50 transition-all hover:scale-105"
              >
                <Rocket className="w-6 h-6 mr-2" />
                PLAY NOW
              </Button>
            </Link>
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-500">1.00x - 1000x</div>
            <div className="text-sm text-gray-400">Multiplier Range</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">50%</div>
            <div className="text-sm text-gray-400">Reach 2x+</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">5%</div>
            <div className="text-sm text-gray-400">Reach 10x+</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">Real-time</div>
            <div className="text-sm text-gray-400">Multiplayer Action</div>
          </div>
        </div>
      </div>
    </Card>
  )
}
