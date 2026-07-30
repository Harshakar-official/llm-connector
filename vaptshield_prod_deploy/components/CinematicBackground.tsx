"use client"

import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Points, PointMaterial } from '@react-three/drei'
import * as THREE from 'three'

function ParticleSwarm() {
  const ref = useRef<THREE.Points>(null)
  
  // Create 3000 floating particles
  const [positions, phases] = useMemo(() => {
    const positions = new Float32Array(3000 * 3)
    const phases = new Float32Array(3000)
    for (let i = 0; i < 3000; i++) {
      // Spread across a massive volume
      positions[i * 3 + 0] = (Math.random() - 0.5) * 20
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20
      positions[i * 3 + 2] = (Math.random() - 0.5) * 15 - 5 // Push slightly back
      phases[i] = Math.random() * Math.PI * 2
    }
    return [positions, phases]
  }, [])

  useFrame((state) => {
    if (!ref.current) return
    // Very slow cosmic rotation
    ref.current.rotation.y = state.clock.elapsedTime * 0.02
    ref.current.rotation.x = state.clock.elapsedTime * 0.01

    // Add mouse parallax effect
    const targetX = (state.mouse.x * Math.PI) / 10
    const targetY = (state.mouse.y * Math.PI) / 10

    ref.current.rotation.y += (targetX - ref.current.rotation.y) * 0.05
    ref.current.rotation.x += (targetY - ref.current.rotation.x) * 0.05
  })

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#22d3ee" // Cyan glowing particles
        size={0.03}
        sizeAttenuation={true}
        depthWrite={false}
        opacity={0.3}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  )
}

export default function CinematicBackground() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] opacity-60">
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
        <fog attach="fog" args={['#0a0a0a', 2, 15]} />
        <ParticleSwarm />
      </Canvas>
    </div>
  )
}
