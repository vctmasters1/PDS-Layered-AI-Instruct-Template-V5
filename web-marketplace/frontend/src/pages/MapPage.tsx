import { useEffect, useRef, useState } from 'react'
import { useAsyncData } from '../hooks/useAsyncData'
import { fetchDesigners, fetchProducers } from '../api/search'
import { useUserLocation } from '../hooks/useUserLocation'
import type { Designer, Producer } from '../types'

type MapLayer = 'all' | 'designers' | 'producers' | 'materials'

declare global {
  interface Window {
    L?: {
      map: (el: HTMLElement, opts: unknown) => LeafletMap
      tileLayer: (url: string, opts: unknown) => { addTo: (m: LeafletMap) => void }
      marker: (latlng: [number, number], opts?: unknown) => LeafletMarker
      divIcon: (opts: { html: string; className?: string; iconSize?: [number,number]; iconAnchor?: [number,number]; popupAnchor?: [number,number] }) => unknown
    }
  }
}

interface LeafletMarker {
  addTo: (m: LeafletMap) => LeafletMarker
  bindPopup: (s: string) => LeafletMarker
  remove: () => void
}

function useLeaflet() {
  const [ready, setReady] = useState(!!window.L)
  useEffect(() => {
    if (window.L) { setReady(true); return }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setReady(true)
    document.head.appendChild(script)
  }, [])
  return ready
}

// Spread overlapping markers in a circle so they don't stack on top of each other.
// Markers within ~500m (0.005°) of each other are considered co-located.
function jitterMarkers<T extends { lat: number; lng: number }>(markers: T[]): T[] {
  const BUCKET = 0.005 // ~500m grouping radius
  const SPREAD = 0.008 // spread radius for a full group

  // Group by snapped grid cell
  const groups = new Map<string, T[]>()
  for (const m of markers) {
    const key = `${Math.round(m.lat / BUCKET)}:${Math.round(m.lng / BUCKET)}`
    const g = groups.get(key)
    if (g) g.push(m)
    else groups.set(key, [m])
  }

  const result: T[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0])
    } else {
      group.forEach((m, i) => {
        const angle = (2 * Math.PI * i) / group.length
        result.push({ ...m, lat: m.lat + Math.sin(angle) * SPREAD, lng: m.lng + Math.cos(angle) * SPREAD })
      })
    }
  }
  return result
}

interface LeafletMap {
  remove?: () => void
  setView: (center: [number, number], zoom: number, opts?: { animate?: boolean }) => void
  flyTo: (center: [number, number], zoom: number) => void
}

// Pin colours per provider type
const PIN_STYLES: Record<string, { bg: string; emoji: string }> = {
  designer:  { bg: '#3b82f6', emoji: '🎨' },
  producer:  { bg: '#f97316', emoji: '🏭' },
  materials: { bg: '#22c55e', emoji: '📦' },
}

function makeIcon(type: string) {
  const { bg, emoji } = PIN_STYLES[type] ?? PIN_STYLES.designer
  return `<div style="background:${bg};border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:15px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35)">${emoji}</div>`
}

export function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<LeafletMarker[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [layer, setLayer] = useState<MapLayer>('all')
  const leafletReady = useLeaflet()
  const userLocation = useUserLocation()

  const designers = useAsyncData(() => fetchDesigners({ limit: 200 }), [])
  const producers = useAsyncData(() => fetchProducers({ limit: 200 }), [])

  // ── Effect 1: create map once Leaflet is ready ──────────────────────────
  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapInstanceRef.current) return
    const L = window.L!
    const center: [number, number] = userLocation ? [userLocation.lat, userLocation.lng] : [39.5, -98.35]
    const zoom = userLocation ? 9 : 4
    const map = L.map(mapRef.current, { center, zoom })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map)
    mapInstanceRef.current = map
    setMapReady(true)
  }, [leafletReady]) // intentionally no data deps — markers handled by Effect 2

  // Fly to user location once known
  useEffect(() => {
    if (!userLocation || !mapInstanceRef.current) return
    mapInstanceRef.current.flyTo([userLocation.lat, userLocation.lng], 9)
  }, [userLocation])

  // ── Effect 2: update markers whenever map, layer, or data changes ───────
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.L) return
    const L = window.L!
    const map = mapInstanceRef.current

    // Remove all existing markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const allDesigners: Designer[] = designers.data?.results ?? []
    const allProducers: Producer[] = producers.data?.results ?? []

    type RawPin = { lat: number; lng: number; type: string; popup: string }
    const rawPins: RawPin[] = []

    const pushDesigner = (d: Designer, type: string) => {
      if (!d.latitude || !d.longitude) return
      rawPins.push({
        lat: d.latitude, lng: d.longitude, type,
        popup: `<strong>${d.displayName ?? d.businessName ?? d.name}</strong><br/>${type === 'materials' ? 'Materials Seller' : 'Designer'}<br/>${d.location ?? ''}<br/><a href="/creators/designer/${d.id}" style="color:#3b82f6;font-size:12px">View Profile →</a>`,
      })
    }
    const pushProducer = (p: Producer, type: string) => {
      if (!p.latitude || !p.longitude) return
      rawPins.push({
        lat: p.latitude, lng: p.longitude, type,
        popup: `<strong>${p.displayName ?? p.businessName ?? p.name}</strong><br/>${type === 'materials' ? 'Materials Seller' : 'Producer'}<br/>${p.location ?? ''}<br/><a href="/creators/producer/${p.id}" style="color:#3b82f6;font-size:12px">View Profile →</a>`,
      })
    }

    if (layer === 'all' || layer === 'designers') {
      allDesigners.filter(d => !d.activeMaterials).forEach(d => pushDesigner(d, 'designer'))
    }
    if (layer === 'all' || layer === 'producers') {
      allProducers.filter(p => !p.activeMaterials).forEach(p => pushProducer(p, 'producer'))
    }
    if (layer === 'all' || layer === 'materials') {
      allDesigners.filter(d => d.activeMaterials).forEach(d => pushDesigner(d, 'materials'))
      allProducers.filter(p => p.activeMaterials).forEach(p => pushProducer(p, 'materials'))
    }

    jitterMarkers(rawPins).forEach(m => {
      const icon = L.divIcon({ html: makeIcon(m.type), className: '', iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16] })
      const marker = L.marker([m.lat, m.lng], { icon }).addTo(map).bindPopup(m.popup)
      markersRef.current.push(marker)
    })
  }, [mapReady, layer, designers.data, producers.data])

  // Count pins by type for the status bar
  const dCount = (designers.data?.results ?? []).filter(d => !d.activeMaterials).length
  const pCount = (producers.data?.results ?? []).filter(p => !p.activeMaterials).length
  const mCount = [
    ...(designers.data?.results ?? []).filter(d => d.activeMaterials),
    ...(producers.data?.results ?? []).filter(p => p.activeMaterials),
  ].length
  const loading = designers.loading || producers.loading

  const LAYER_BUTTONS: { id: MapLayer; label: string; dot: string }[] = [
    { id: 'all',       label: 'All',       dot: '#888' },
    { id: 'designers', label: '🎨 Designers', dot: '#3b82f6' },
    { id: 'producers', label: '🏭 Producers', dot: '#f97316' },
    { id: 'materials', label: '📦 Materials',  dot: '#22c55e' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {LAYER_BUTTONS.map(b => (
          <button key={b.id} onClick={() => setLayer(b.id)} style={{
            padding: '5px 14px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer',
            background: layer === b.id ? 'var(--primary)' : 'var(--card-bg)',
            color: layer === b.id ? 'white' : 'var(--text)', fontSize: 13,
          }}>{b.label}</button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>
          {loading ? 'Loading…' : `${dCount} designers · ${pCount} producers · ${mCount} materials`}
        </span>
      </div>

      {!leafletReady && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 48 }}>🗺️</div>
          <p>Loading map…</p>
        </div>
      )}
      <div ref={mapRef} style={{ flex: 1, minHeight: 0, display: leafletReady ? 'block' : 'none' }} />
    </div>
  )
}
