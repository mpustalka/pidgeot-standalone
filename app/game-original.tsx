"use client"

import { useState, useEffect } from "react"
import { PidgeotFlightGame } from "@/components/pidgeot-flight-game"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import Image from "next/image"

export default function PidgeotFlightPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth/login?message=Please sign in to play Pidgeot Flight")
        return
      }

      setIsAuthenticated(true)
      setIsLoading(false)
    }

    checkAuth()
  }, [router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-4 animate-bounce">
            <Image src="/images/pidgeot-icon.webp" alt="Pidgeot" fill className="object-contain" />
          </div>
          <p className="text-white">Loading Pidgeot Flight...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="h-screen">
      <PidgeotFlightGame />
    </div>
  )
}
