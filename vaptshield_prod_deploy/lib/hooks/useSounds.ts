"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * useSounds — Enterprise-grade audio feedback hook.
 *
 * Uses the Web Audio API to generate tones programmatically instead of
 * relying on external sound files. This ensures:
 *  - No external network dependencies (works offline)
 *  - No CORS issues
 *  - No 404s from missing sound files
 *  - Consistent behavior across all environments
 *
 * Z+ CROSS-BROWSER HARDENING:
 * - Primes AudioContext on first user gesture (click/touch/keydown) to comply
 *   with autoplay policies in Chrome, Edge, Firefox, Brave, and Safari.
 * - Falls back to webkitAudioContext for older Safari/WebKit browsers.
 * - Creates AudioContext eagerly on first interaction so subsequent playSound()
 *   calls work immediately without the "suspended" state blocking playback.
 *
 * Sound profiles are inspired by GitHub/Slack notification patterns.
 */
export function useSounds() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const primedRef = useRef(false)

  const getAudioContext = useCallback(async (): Promise<AudioContext> => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtxRef.current = new AudioCtx()
    }
    // Resume if suspended (browser autoplay policy) — MUST await the Promise
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }, [])

  // Z+ CROSS-BROWSER: Prime AudioContext on first user gesture
  // Browsers (Chrome, Edge, Firefox, Brave, Safari) require a user gesture
  // before allowing AudioContext to produce sound. We eagerly create and
  // resume the context on the first click/touch/keydown so subsequent
  // programmatic playSound() calls work reliably.
  useEffect(() => {
    if (primedRef.current) return

    const primeAudio = async () => {
      if (primedRef.current) return
      primedRef.current = true
      try {
        const ctx = await getAudioContext()
        // Create a silent buffer to fully unlock the audio subsystem
        const buf = ctx.createBuffer(1, 1, 22050)
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(ctx.destination)
        src.start(0)
        src.stop(ctx.currentTime + 0.001)
      } catch {
        // Silently ignore — audio will be retried on next playSound() call
      }
    }

    const events: Array<keyof HTMLElementEventMap> = ["click", "touchstart", "keydown"]
    events.forEach(evt => document.addEventListener(evt, primeAudio, { once: true }))

    return () => {
      events.forEach(evt => document.removeEventListener(evt, primeAudio))
    }
  }, [getAudioContext])

  const playSound = useCallback(async (type: "success" | "alert" | "notification" | "action") => {
    try {
      const ctx = await getAudioContext()
      const now = ctx.currentTime

      switch (type) {
        case "success": {
          // Two ascending tones: pleasant "ding-ding"
          const osc1 = ctx.createOscillator()
          const gain1 = ctx.createGain()
          osc1.type = "sine"
          osc1.frequency.setValueAtTime(880, now)
          gain1.gain.setValueAtTime(0.3, now)
          gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15)
          osc1.connect(gain1).connect(ctx.destination)
          osc1.start(now)
          osc1.stop(now + 0.15)

          const osc2 = ctx.createOscillator()
          const gain2 = ctx.createGain()
          osc2.type = "sine"
          osc2.frequency.setValueAtTime(1100, now + 0.1)
          gain2.gain.setValueAtTime(0.3, now + 0.1)
          gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
          osc2.connect(gain2).connect(ctx.destination)
          osc2.start(now + 0.1)
          osc2.stop(now + 0.3)
          break
        }
        case "alert": {
          // Sharp descending tone: attention-grabbing
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = "square"
          osc.frequency.setValueAtTime(1200, now)
          osc.frequency.exponentialRampToValueAtTime(400, now + 0.3)
          gain.gain.setValueAtTime(0.2, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
          osc.connect(gain).connect(ctx.destination)
          osc.start(now)
          osc.stop(now + 0.35)
          break
        }
        case "notification": {
          // Soft double-tap: subtle "blip-blip"
          const osc1 = ctx.createOscillator()
          const gain1 = ctx.createGain()
          osc1.type = "sine"
          osc1.frequency.setValueAtTime(660, now)
          gain1.gain.setValueAtTime(0.25, now)
          gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08)
          osc1.connect(gain1).connect(ctx.destination)
          osc1.start(now)
          osc1.stop(now + 0.08)

          const osc2 = ctx.createOscillator()
          const gain2 = ctx.createGain()
          osc2.type = "sine"
          osc2.frequency.setValueAtTime(880, now + 0.12)
          gain2.gain.setValueAtTime(0.25, now + 0.12)
          gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.22)
          osc2.connect(gain2).connect(ctx.destination)
          osc2.start(now + 0.12)
          osc2.stop(now + 0.22)
          break
        }
        case "action": {
          // Quick click: tactile feedback
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = "sine"
          osc.frequency.setValueAtTime(1000, now)
          gain.gain.setValueAtTime(0.2, now)
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05)
          osc.connect(gain).connect(ctx.destination)
          osc.start(now)
          osc.stop(now + 0.05)
          break
        }
      }
    } catch {
      // Browser blocks audio without user interaction — silently ignore
      // This is expected behavior per browser autoplay policies.
      // The priming useEffect above minimizes this scenario.
    }
  }, [getAudioContext])

  return { playSound }
}
