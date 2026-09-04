'use client'

// BuildHub command center — security "network" visualization.
//
// A lightweight Three.js scene (`@react-three/fiber`): a slowly rotating shell
// of nodes over a wireframe lattice, echoing a monitored application network.
// Deliberately conservative, following the landing hero's rules:
//   - Small canvas, capped pixel ratio, no post-processing.
//   - Disabled on mobile / coarse pointers and when prefers-reduced-motion.
//   - Falls back to a static CSS/SVG radar so the security view never depends
//     on WebGL.

import { useMemo, useRef, useSyncExternalStore } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const NODE_COUNT = 56

function buildNodes(): Array<[number, number, number]> {
  const nodes: Array<[number, number, number]> = []
  for (let i = 0; i < NODE_COUNT; i += 1) {
    const y = 1 - (i / (NODE_COUNT - 1)) * 2
    const radius = Math.sqrt(1 - y * y)
    const theta = 11.6 * i
    const r = 1.85
    nodes.push([
      r * radius * Math.cos(theta),
      r * y * 0.92,
      r * radius * Math.sin(theta),
    ])
  }
  return nodes
}

function buildLines(nodes: Array<[number, number, number]>): Float32Array {
  const parts: number[] = []
  for (let i = 0; i < nodes.length; i += 1) {
    for (const step of [1, 9, 19]) {
      const j = (i + step) % nodes.length
      parts.push(...nodes[i], ...nodes[j])
    }
  }
  return new Float32Array(parts)
}

function Network() {
  const group = useRef<THREE.Group>(null)
  const nodes = useMemo(() => buildNodes(), [])
  const linePositions = useMemo(() => buildLines(nodes), [nodes])
  const pointMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.72,
      }),
    [],
  )

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime
    g.rotation.y = t * 0.08
    g.rotation.x = Math.sin(t * 0.11) * 0.22
  })

  return (
    <group ref={group}>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#22d3ee" transparent opacity={0.28} />
      </line>
      <lineSegments>
        <icosahedronGeometry args={[1.85, 1]} />
        <lineBasicMaterial color="#67e8f9" transparent opacity={0.1} />
      </lineSegments>
      {nodes.map((position, i) => (
        <mesh key={i} position={position} material={pointMaterial}>
          <sphereGeometry args={[0.035, 6, 6]} />
        </mesh>
      ))}
    </group>
  )
}

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

function RadarFallback() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30"
    >
      <svg viewBox="0 0 240 240" className="h-72 w-72">
        <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4">
          <circle cx="120" cy="120" r="112" />
          <circle cx="120" cy="120" r="76" />
          <circle cx="120" cy="120" r="40" />
          <line x1="120" y1="8" x2="120" y2="232" />
          <line x1="8" y1="120" x2="232" y2="120" />
        </g>
        <g
          className="origin-center animate-spin"
          style={{ animationDuration: '18s' }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M 120 120 L 120 40 A 80 80 0 0 1 193 93 Z" />
        </g>
      </svg>
    </div>
  )
}

export function SecurityNetwork() {
  const eligible = useWebGLEligible()

  if (!eligible) return <RadarFallback />

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      >
        <Network />
      </Canvas>
    </div>
  )
}