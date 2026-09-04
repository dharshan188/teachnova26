'use client'

// BuildHub landing hero visual — floating "build blocks" that slowly assemble
// around the brand's construction identity.
//
// A real but lightweight Three.js scene (`@react-three/fiber`): a small lattice
// of boxes that drifts and gently rotates, with a subtle pointer parallax. It is
// deliberately conservative:
//   - One small canvas, capped pixel ratio, no post-processing.
//   - Disabled on mobile and when `prefers-reduced-motion` — both fall back to a
//     static isometric CSS lattice so the hero never depends on WebGL.

import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const COUNT = 26

// Deterministic pseudo-random so the layout is stable across renders.
function makeSeeded() {
  let s = 42
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function buildBlocks() {
  const rand = makeSeeded()
  return Array.from({ length: COUNT }, (_, i) => {
    const layer = i % 5
    return {
      x: (i % 6 - 2.5) * 0.72 + (rand() - 0.5) * 0.5,
      y: layer * 0.78 - 1.1 + (rand() - 0.5) * 0.3,
      z: (rand() - 0.5) * 2.2,
      w: 0.52 + rand() * 0.34,
      h: 0.42 + rand() * 0.3,
      d: 0.52 + rand() * 0.34,
      accent: rand() > 0.78,
      float: i % 3 === 0 ? 0.28 : 0,
    }
  })
}

const CSS_TOWERS = [
  { blocks: 3, tone: 'bg-bh-surface', border: 'border-bh-line-strong' },
  { blocks: 6, tone: 'bg-bh-accent-soft', border: 'border-bh-line-strong' },
  { blocks: 4, tone: 'bg-bh-surface', border: 'border-bh-line-strong' },
  { blocks: 7, tone: 'bg-bh-accent-soft', border: 'border-bh-line-strong' },
]

function CSSLattice() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative mx-auto hidden aspect-square h-[380px] select-none sm:block lg:h-[420px]"
      style={{ perspective: '1400px' }}
    >
      <div className="absolute inset-6 rounded-full bg-bh-accent/10 blur-3xl" />
      <div className="absolute inset-0 grid grid-cols-4 gap-4 p-8 [transform:rotateX(58deg)_rotateZ(-14deg)] [transform-style:preserve-3d]">
        {CSS_TOWERS.map((tower, ti) => (
          <div key={ti} className="flex flex-col-reverse items-stretch gap-2">
            {Array.from({ length: tower.blocks }).map((_, bi) => (
              <div
                key={bi}
                className={[
                  'rounded-[10px] border shadow-[0_10px_20px_-12px_rgba(234,88,12,0.35)]',
                  tower.tone,
                  tower.border,
                  bi === tower.blocks - 1 ? 'h-16' : 'h-10',
                ].join(' ')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Blocks({ pointer }: { pointer: { x: number; y: number } }) {
  const group = useRef<THREE.Group>(null)
  const eased = useRef({ x: 0, y: 0 })
  const blocks = useMemo(() => buildBlocks(), [])
  const accentMat = useMemo(
    () => [new THREE.MeshStandardMaterial({ color: '#ea580c', metalness: 0.05, roughness: 0.5 })],
    [],
  )
  const neutralMat = useMemo(
    () => [new THREE.MeshStandardMaterial({ color: '#f4f4f5', metalness: 0.0, roughness: 0.85 })],
    [],
  )

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime
    // Ease toward the target pointer so motion is calm, never jittery.
    eased.current.x += (pointer.x - eased.current.x) * 0.06
    eased.current.y += (pointer.y - eased.current.y) * 0.06
    g.rotation.y = t * 0.12 + eased.current.x * 0.55
    g.rotation.x = Math.sin(t * 0.18) * 0.12 + eased.current.y * 0.4
    g.position.y = Math.sin(t * 0.3) * 0.12
  })

  return (
    <group ref={group}>
      {blocks.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, b.y + b.float * (0.5 + 0.5 * Math.sin(i + 1)), b.z]}
          material={b.accent ? accentMat[0] : neutralMat[0]}
          castShadow
        >
          <boxGeometry args={[b.w, b.h, b.d]} />
        </mesh>
      ))}
    </group>
  )
}

// True only on the client when the device meets the conditions for the WebGL
// hero. Uses useSyncExternalStore so the value is SSR/hydration-safe and the
// CSS lattice renders until the interactive visual is eligible.
function subscribe(cb: () => void) {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}

function getServerSnapshot() {
  return false
}

function getSnapshot() {
  if (typeof window === 'undefined') return false
  try {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const small = window.matchMedia('(max-width: 640px)').matches
    const c = document.createElement('canvas')
    const webgl = !!(c.getContext('webgl2') || c.getContext('webgl'))
    return !reduced && !coarse && !small && webgl
  } catch {
    return false
  }
}

function useWebGLEligible() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function HeroBlocks() {
  const eligible = useWebGLEligible()
  const [pointer, setPointer] = useState({ x: 0, y: 0 })

  if (!eligible) return <CSSLattice />

  return (
    <div
      className="relative mx-auto hidden aspect-square h-[380px] w-full sm:block lg:h-[420px]"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setPointer({
          x: ((e.clientX - r.left) / r.width - 0.5) * 2,
          y: ((e.clientY - r.top) / r.height - 0.5) * 2,
        })
      }}
      onPointerLeave={() => setPointer({ x: 0, y: 0 })}
    >
      <div className="pointer-events-none absolute inset-6 rounded-full bg-bh-accent/10 blur-3xl" aria-hidden="true" />
      <Canvas
        camera={{ position: [0, 0.5, 6.2], fov: 42 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 6, 4]} intensity={1.15} />
        <directionalLight position={[-5, -3, -4]} intensity={0.4} />
        <Blocks pointer={pointer} />
      </Canvas>
    </div>
  )
}
