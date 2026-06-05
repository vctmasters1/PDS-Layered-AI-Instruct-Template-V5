import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../api/client'
import type { User } from '../../types'

const API_BASE = (import.meta.env.VITE_API_BASE || '') + '/v1'

// ─── Capability option lists ────────────────────────────────────────────────

const DESIGNER_CAPABILITIES = [
  '3D Printing', 'CNC Machining', 'Laser Cutting', 'Welding', 'Woodworking',
  'Electronics', 'PCB Design', 'Sewing & Textiles', 'Metalwork', 'Graphic Design',
  'CAD / 3D Modeling', 'Ceramics & Pottery', 'Leather Working', 'Jewelry Making',
  'Brewing & Fermentation', 'Resin & Casting', 'Embroidery', 'Photography',
]

const PRODUCER_CAPABILITIES = [
  '3D Printing (FDM)', '3D Printing (Resin)', 'CNC Machining', 'Laser Cutting',
  'Welding & Fabrication', 'Woodworking', 'Electronics Assembly', 'PCB Fabrication',
  'Injection Molding', 'Metal Casting', 'Powder Coating', 'Textile & Sewing',
  'Vinyl Cutting', 'Engraving', 'Sheet Metal', 'Anodizing', 'Silk Screening',
]

const MATERIAL_TYPE_OPTIONS = [
  'Metals & Alloys', 'Wood & Lumber', 'Plastics & Polymers', 'Textiles & Fabric',
  'Ceramics & Glass', 'Electronics Components', 'Fasteners & Hardware',
  'Chemicals & Resins', 'Paper & Cardboard', 'Leather & Hides',
  'Composites & Fibers', 'Food Grade Ingredients', 'Other',
]

const UNIT_OPTIONS = ['unit', 'kg', 'g', 'lb', 'oz', 'ft', 'm', 'cm', 'mm', 'sheet', 'roll', 'board', 'yard', 'liter', 'gallon']

const CONDITION_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'surplus', label: 'Surplus' },
  { value: 'used', label: 'Used' },
  { value: 'reclaimed', label: 'Reclaimed' },
]

const CONDITION_COLORS: Record<string, string> = {
  new:       'rgba(34,197,94,0.15)',
  surplus:   'rgba(234,179,8,0.15)',
  used:      'rgba(99,102,241,0.15)',
  reclaimed: 'rgba(249,115,22,0.15)',
}

interface MaterialListingData {
  id: string; title: string; description: string; materialTypes: string[]
  imageUrl: string | null; pricePerUnit: number; unit: string
  amountAvailable: number; leadTimeDays: number; condition: string
  notes: string | null; active: boolean; createdAt: string
}

interface MlFormData {
  title: string; description: string; materialTypes: string[]
  imageUrl: string; pricePerUnit: string; unit: string
  amountAvailable: string; leadTimeDays: string; condition: string; notes: string
}

const EMPTY_ML_FORM: MlFormData = {
  title: '', description: '', materialTypes: [], imageUrl: '',
  pricePerUnit: '', unit: 'unit', amountAvailable: '', leadTimeDays: '1',
  condition: 'new', notes: '',
}

// ─── Shared sub-components ───────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--input-bg)',
  color: 'var(--text)', boxSizing: 'border-box', marginTop: 4,
}

const LABEL_STYLE: React.CSSProperties = { fontSize: 13, color: 'var(--text-secondary)' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  )
}

function CapabilityGrid({ options, checked, onChange }: {
  options: string[]
  checked: string[]
  onChange: (v: string[]) => void
}) {
  const toggle = (val: string) =>
    onChange(checked.includes(val) ? checked.filter(c => c !== val) : [...checked, val])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, marginTop: 8 }}>
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={checked.includes(opt)} onChange={() => toggle(opt)} />
          {opt}
        </label>
      ))}
    </div>
  )
}

function Msg({ msg }: { msg: { type: 'success' | 'error'; text: string } | null }) {
  if (!msg) return null
  return (
    <div style={{
      padding: '10px 16px', borderRadius: 8, marginBottom: 16,
      background: msg.type === 'success' ? 'var(--success)' : 'var(--danger)',
      color: 'white', fontSize: 14,
    }}>
      {msg.text}
    </div>
  )
}

// ─── Tab types ───────────────────────────────────────────────────────────────

type TabId = 'info' | 'services' | 'designer' | 'producer' | 'materials' | 'gizmo' | 'author'

// ─── Leaflet lazy loader ─────────────────────────────────────────────────────

declare global {
  interface Window {
    L?: {
      map: (el: HTMLElement, opts: unknown) => LMap
      tileLayer: (url: string, opts: unknown) => { addTo: (m: LMap) => void }
      marker: (latlng: [number, number], opts?: { draggable?: boolean; icon?: unknown }) => LMarker
      circle: (latlng: [number, number], opts: unknown) => LCircle
    }
  }
}
interface LMap { setView: (latlng: [number, number], zoom: number) => LMap; panTo: (latlng: [number, number]) => void; remove: () => void; on: (e: string, fn: () => void) => void }
interface LMarker { addTo: (m: LMap) => LMarker; setLatLng: (latlng: [number, number]) => LMarker; remove: () => void; bindPopup: (s: string) => LMarker; on: (e: string, fn: (ev: { target: LMarker }) => void) => LMarker; getLatLng: () => { lat: number; lng: number } }
interface LCircle { addTo: (m: LMap) => LCircle; setLatLng: (latlng: [number, number]) => LCircle; remove: () => void }

// Nominatim result shape (OpenStreetMap geocoding)
interface NominatimResult {
  display_name: string
  lat: string
  lon: string
  address: {
    house_number?: string
    road?: string
    city?: string
    town?: string
    village?: string
    county?: string
    state?: string
    postcode?: string
  }
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

// ─── Address autocomplete (Nominatim / OpenStreetMap) ─────────────────────────

function AddressSearch({ onSelect }: {
  onSelect: (r: { lat: number; lng: number; street: string; city: string; state: string; zip: string }) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(val: string) {
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (val.trim().length < 3) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&addressdetails=1&limit=6&countrycodes=us`
        const res = await fetch(url)
        const data: NominatimResult[] = await res.json()
        setResults(data)
        setOpen(data.length > 0)
      } catch { /* ignore network errors */ }
      finally { setLoading(false) }
    }, 450)
  }

  function pick(r: NominatimResult) {
    const a = r.address
    const street = [a.house_number, a.road].filter(Boolean).join(' ')
    const city = a.city ?? a.town ?? a.village ?? a.county ?? ''
    const state = a.state ?? ''
    const zip = a.postcode ?? ''
    // Show a compact label in the input box
    setQuery([street, city, state].filter(Boolean).join(', '))
    setOpen(false)
    setResults([])
    onSelect({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), street, city, state, zip })
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Start typing your address or city…"
          style={INPUT_STYLE}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {loading && (
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-secondary)', pointerEvents: 'none' }}>Searching…</span>
        )}
      </div>
      {open && results.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 1000, width: '100%', margin: 0, padding: 0,
          listStyle: 'none', background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.2)', marginTop: 2, maxHeight: 220, overflowY: 'auto',
        }}>
          {results.map((r, i) => (
            <li
              key={i}
              onMouseDown={() => pick(r)}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              {r.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Interactive map editor (draggable pin + privacy circle) ──────────────────

function LocationMapEditor({ lat, lng, locationPrivate, onPinMoved }: {
  lat: number | null
  lng: number | null
  locationPrivate: boolean
  onPinMoved: (lat: number, lng: number) => void
}) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const markerRef = useRef<LMarker | null>(null)
  const circleRef = useRef<LCircle | null>(null)
  const leafletReady = useLeaflet()

  // Init map once
  useEffect(() => {
    if (!leafletReady || !mapDivRef.current || mapRef.current) return
    const L = window.L!
    mapRef.current = L.map(mapDivRef.current, { zoomControl: true, scrollWheelZoom: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(mapRef.current)
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; circleRef.current = null }
    }
  }, [leafletReady])

  // Update pin + circle when coords or privacy flag change
  useEffect(() => {
    if (!leafletReady || !mapRef.current || !lat || !lng) return
    const L = window.L!
    const map = mapRef.current

    const zoom = locationPrivate ? 11 : 14
    map.setView([lat, lng], zoom)

    // Draggable marker
    if (markerRef.current) {
      markerRef.current.remove()
    }
    markerRef.current = L.marker([lat, lng], { draggable: true })
      .addTo(map)
      .bindPopup('📍 Drag to adjust your pin')
    markerRef.current.on('dragend', (e) => {
      const pos = e.target.getLatLng()
      // Update circle position while dragging
      if (circleRef.current) circleRef.current.setLatLng([pos.lat, pos.lng])
      onPinMoved(pos.lat, pos.lng)
    })

    // Privacy circle
    if (circleRef.current) circleRef.current.remove()
    if (locationPrivate) {
      circleRef.current = L.circle([lat, lng], {
        radius: 2500, color: '#2563eb', fillOpacity: 0.07, weight: 2, dashArray: '6 4',
      }).addTo(map)
    } else {
      circleRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady, lat, lng, locationPrivate])

  if (!lat || !lng) {
    return (
      <div style={{ height: 240, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13, gap: 8 }}>
        <span>🗺️</span> Search for your address above to place your pin
      </div>
    )
  }

  return (
    <div>
      <div ref={mapDivRef} style={{ height: 240, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }} />
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>🖱️ Drag the pin to fine-tune your location</span>
        {locationPrivate && <span>🔒 Circle shows your approximate public area</span>}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user, updateUser } = useAuth()

  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Basic info
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [firstName, setFirstName] = useState(user?.firstName ?? '')
  const [lastName, setLastName] = useState(user?.lastName ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [infoSaving, setInfoSaving] = useState(false)

  // Location
  const [businessAddress, setBusinessAddress] = useState(user?.businessAddress ?? '')
  const [businessCity, setBusinessCity] = useState(user?.businessCity ?? '')
  const [businessState, setBusinessState] = useState(user?.businessState ?? '')
  const [businessZip, setBusinessZip] = useState(user?.businessZip ?? '')
  const [locationPrivate, setLocationPrivate] = useState(user?.locationPrivate ?? false)
  // Pin coords: prefer customPin (user-dragged), fall back to auto-geocoded
  const initLat = user?.customPinLat ?? user?.businessLatitude ?? null
  const initLng = user?.customPinLng ?? user?.businessLongitude ?? null
  const [previewLat, setPreviewLat] = useState<number | null>(initLat)
  const [previewLng, setPreviewLng] = useState<number | null>(initLng)
  // Tracks whether the pin was dragged by the user (triggers PUT /auth/me/pin on save)
  const [pinDragged, setPinDragged] = useState(false)
  const [zipLookupTimer, setZipLookupTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  // Services
  const [services, setServices] = useState({
    designer: false, producer: false, materials: false, author: false, gizmo: false,
  })
  const [servicesSaving, setServicesSaving] = useState(false)
  const [servicesLoaded, setServicesLoaded] = useState(false)

  // Designer profile
  const [dBio, setDBio] = useState('')
  const [dSpecialties, setDSpecialties] = useState('')
  const [dExperience, setDExperience] = useState('')
  const [dRate, setDRate] = useState('')
  const [dCaps, setDCaps] = useState<string[]>([])
  const [designerSaving, setDesignerSaving] = useState(false)

  // Producer profile
  const [pBio, setPBio] = useState('')
  const [pSpecialties, setPSpecialties] = useState('')
  const [pMinBatch, setPMinBatch] = useState('')
  const [pCapacity, setPCapacity] = useState('')
  const [pLeadTime, setPLeadTime] = useState('')
  const [pCerts, setPCerts] = useState('')
  const [pCaps, setPCaps] = useState<string[]>([])
  const [producerSaving, setProducerSaving] = useState(false)

  // Material Listings
  const [materialListings, setMaterialListings] = useState<MaterialListingData[]>([])
  const [mlLoading, setMlLoading] = useState(false)
  const [mlLoaded, setMlLoaded] = useState(false)
  const [showMlForm, setShowMlForm] = useState(false)
  const [mlFormData, setMlFormData] = useState<MlFormData>(EMPTY_ML_FORM)
  const [mlEditId, setMlEditId] = useState<string | null>(null)
  const [mlSaving, setMlSaving] = useState(false)
  const [mlError, setMlError] = useState<string | null>(null)
  const [mlMsg, setMlMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadServices()
    loadDesignerProfile()
    loadProducerProfile()
  }, [])

  // Load material listings lazily when the tab is first activated
  useEffect(() => {
    if (activeTab === 'materials' && !mlLoaded) loadMaterialListings()
  }, [activeTab])

  async function loadServices() {
    try {
      const data = await api.get<{ services: typeof services }>('/auth/me/registered-services')
      setServices(data.services)
    } catch { /* use defaults */ }
    finally { setServicesLoaded(true) }
  }

  async function loadDesignerProfile() {
    try {
      const data = await api.get<{ designer: {
        bio?: string; specialties?: string; experience?: number;
        hourlyRate?: number; capabilities?: string[]
      } | null }>('/auth/me/designer')
      const d = data.designer
      if (d) {
        setDBio(d.bio ?? '')
        setDSpecialties(d.specialties ?? '')
        setDExperience(String(d.experience ?? ''))
        setDRate(String(d.hourlyRate ?? ''))
        setDCaps(d.capabilities ?? [])
      }
    } catch {}
  }

  async function loadProducerProfile() {
    try {
      const data = await api.get<{ producer: {
        bio?: string; specialties?: string; minBatch?: number; capacity?: string;
        leadTime?: number; certifications?: string; capabilities?: string[]
      } | null }>('/auth/me/producer')
      const p = data.producer
      if (p) {
        setPBio(p.bio ?? '')
        setPSpecialties(p.specialties ?? '')
        setPMinBatch(String(p.minBatch ?? ''))
        setPCapacity(p.capacity ?? '')
        setPLeadTime(String(p.leadTime ?? ''))
        setPCerts(p.certifications ?? '')
        setPCaps(p.capabilities ?? [])
      }
    } catch {}
  }

  async function loadMaterialListings() {
    setMlLoading(true)
    try {
      const data = await api.get<{ listings: MaterialListingData[] }>('/material-listings')
      setMaterialListings(data.listings ?? [])
      setMlLoaded(true)
    } catch { /* silently fail */ }
    finally { setMlLoading(false) }
  }

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleZipChange(zip: string) {
    setBusinessZip(zip)
    if (zipLookupTimer) clearTimeout(zipLookupTimer)
    const clean = zip.replace(/\D/g, '').substring(0, 5)
    if (clean.length === 5) {
      const t = setTimeout(async () => {
        try {
          const geo = await api.get<{ lat: number; lng: number; city: string; state: string }>(`/geo/zip/${clean}`)
          if (geo?.lat) {
            setPreviewLat(geo.lat)
            setPreviewLng(geo.lng)
            setPinDragged(false) // reset drag flag — address changed
            if (!businessCity) setBusinessCity(geo.city ?? '')
            if (!businessState) setBusinessState(geo.state ?? '')
          }
        } catch { /* ignore */ }
      }, 600)
      setZipLookupTimer(t)
    }
  }

  function handleAddressSelect(r: { lat: number; lng: number; street: string; city: string; state: string; zip: string }) {
    setPreviewLat(r.lat)
    setPreviewLng(r.lng)
    setPinDragged(false) // fresh geocode — reset any prior drag
    if (r.street) setBusinessAddress(r.street)
    if (r.city) setBusinessCity(r.city)
    if (r.state) setBusinessState(r.state)
    if (r.zip) setBusinessZip(r.zip)
  }

  function handlePinMoved(lat: number, lng: number) {
    setPreviewLat(lat)
    setPreviewLng(lng)
    setPinDragged(true)
  }

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault()
    setInfoSaving(true); setMsg(null)
    try {
      const updated = await api.put<{ user: User }>('/auth/me', {
        displayName, firstName, lastName, phone,
        businessAddress, businessCity, businessState, businessZip, locationPrivate,
      })
      if (updated?.user) {
        updateUser(updated.user)
        if (updated.user.businessLatitude && !pinDragged) {
          setPreviewLat(updated.user.businessLatitude)
          setPreviewLng(updated.user.businessLongitude ?? null)
        }
      }
      // Save dragged pin position (must come AFTER address save so backend has lat/lng to validate against)
      if (pinDragged && previewLat && previewLng) {
        try {
          await api.put('/auth/me/pin', { lat: previewLat, lng: previewLng })
          setPinDragged(false)
        } catch (pinErr) {
          // Non-fatal — address saved, just couldn't lock in the custom pin
          setMsg({ type: 'success', text: 'Profile updated! (Pin could not be saved — it may be too far from your address)' })
          setInfoSaving(false)
          return
        }
      }
      setMsg({ type: 'success', text: 'Profile updated!' })
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message })
    } finally { setInfoSaving(false) }
  }

  async function saveServices(e: React.FormEvent) {
    e.preventDefault()
    setServicesSaving(true); setMsg(null)
    try {
      await api.put('/auth/me/registered-services', services)
      // Persist to localStorage so sidebar can read it immediately
      localStorage.setItem('registeredServices', JSON.stringify(services))
      setMsg({ type: 'success', text: 'Services saved!' })
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message })
    } finally { setServicesSaving(false) }
  }

  async function saveDesignerProfile(e: React.FormEvent) {
    e.preventDefault()
    setDesignerSaving(true); setMsg(null)
    try {
      await api.put('/auth/me/designer', {
        bio: dBio,
        specialties: dSpecialties,
        experience: dExperience ? Number(dExperience) : undefined,
        hourlyRate: dRate ? Number(dRate) : undefined,
        capabilities: dCaps,
      })
      setMsg({ type: 'success', text: 'Designer profile saved!' })
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message })
    } finally { setDesignerSaving(false) }
  }

  async function saveProducerProfile(e: React.FormEvent) {
    e.preventDefault()
    setProducerSaving(true); setMsg(null)
    try {
      await api.put('/auth/me/producer', {
        bio: pBio,
        specialties: pSpecialties,
        minBatch: pMinBatch ? Number(pMinBatch) : undefined,
        capacity: pCapacity,
        leadTime: pLeadTime ? Number(pLeadTime) : undefined,
        certifications: pCerts,
        capabilities: pCaps,
      })
      setMsg({ type: 'success', text: 'Producer profile saved!' })
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message })
    } finally { setProducerSaving(false) }
  }

  // ─── Tab list ───────────────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; show?: boolean }[] = [
    { id: 'info',      label: '👤 My Info' },
    { id: 'services',  label: '🏷️ My Services' },
    { id: 'designer',  label: '🎨 Designer',  show: servicesLoaded && services.designer },
    { id: 'producer',  label: '🏭 Producer',  show: servicesLoaded && services.producer },
    { id: 'materials', label: '🧱 Materials', show: servicesLoaded && services.materials },
    { id: 'gizmo',     label: '🔧 Gizmo',    show: servicesLoaded && services.gizmo },
    { id: 'author',    label: '📚 Author',   show: servicesLoaded && services.author },
  ].filter(t => t.show !== false)

  const tabBtnStyle = (id: TabId): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
    fontWeight: activeTab === id ? 600 : 400,
    background: activeTab === id ? 'var(--primary)' : 'var(--bg-secondary)',
    color: activeTab === id ? 'white' : 'var(--text)',
  })

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 6 }}>My Profile</h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        This is what other members see when they look you up.
      </p>

      {/* Tab strip */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {tabs.map(t => (
          <button key={t.id} style={tabBtnStyle(t.id)} onClick={() => { setActiveTab(t.id); setMsg(null) }}>
            {t.label}
          </button>
        ))}
      </div>

      <Msg msg={msg} />

      {/* ── My Info ────────────────────────────────────────────────────────── */}
      {activeTab === 'info' && (
        <form onSubmit={saveInfo} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Display Name">
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="How you appear to other members (e.g. MakerMike, PixelCraft Studio)"
              style={INPUT_STYLE}
            />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              If blank, your first name is shown. Does not need to be your legal name.
            </div>
          </Field>

          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="First Name">
              <input value={firstName} onChange={e => setFirstName(e.target.value)} style={INPUT_STYLE} />
            </Field>
            <Field label="Last Name">
              <input value={lastName} onChange={e => setLastName(e.target.value)} style={INPUT_STYLE} />
            </Field>
          </div>

          <Field label="Phone">
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" style={INPUT_STYLE} />
          </Field>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>📍 Location</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              Used to show your pin on the map. Members can find creators near them.
            </p>

            {/* Address autocomplete */}
            <Field label="Address Search">
              <AddressSearch onSelect={handleAddressSelect} />
            </Field>

            {/* Street address + City/State/ZIP (auto-filled by autocomplete, still manually editable) */}
            <div style={{ marginTop: 10 }}>
              <Field label="Street Address">
                <input value={businessAddress} onChange={e => setBusinessAddress(e.target.value)} placeholder="e.g. 123 Main St" style={INPUT_STYLE} />
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <Field label="City">
                  <input value={businessCity} onChange={e => setBusinessCity(e.target.value)} placeholder="e.g. Austin" style={INPUT_STYLE} />
                </Field>
              </div>
              <div style={{ width: 90 }}>
                <Field label="State">
                  <input value={businessState} onChange={e => setBusinessState(e.target.value)} placeholder="TX" maxLength={2} style={INPUT_STYLE} />
                </Field>
              </div>
              <div style={{ width: 110 }}>
                <Field label="ZIP">
                  <input
                    value={businessZip}
                    onChange={e => handleZipChange(e.target.value)}
                    placeholder="78701"
                    maxLength={5}
                    style={INPUT_STYLE}
                  />
                </Field>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '10px 14px', border: `2px solid ${locationPrivate ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, background: locationPrivate ? 'rgba(37,99,235,0.05)' : 'transparent', marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={locationPrivate}
                onChange={e => setLocationPrivate(e.target.checked)}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Don't show my exact location</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Your pin will appear within your ZIP code area, not at your exact address.
                </div>
              </div>
            </label>

            <LocationMapEditor lat={previewLat} lng={previewLng} locationPrivate={locationPrivate} onPinMoved={handlePinMoved} />
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            Role: <strong>{user?.role}</strong>{user?.isStaff ? ' · Staff' : ''}
          </div>

          <button type="submit" className="btn-primary" disabled={infoSaving} style={{ alignSelf: 'flex-start', padding: '8px 24px' }}>
            {infoSaving ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      {/* ── My Services ────────────────────────────────────────────────────── */}
      {activeTab === 'services' && (
        <form onSubmit={saveServices} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h3 style={{ margin: '0 0 6px' }}>I offer services as a…</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
              Enable the roles that apply to you. Each adds a profile tab where you can describe your capabilities.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { key: 'designer', label: '🎨 Designer',            desc: 'Sell original designs, crafts, art, and handmade products' },
                { key: 'producer', label: '🏭 Producer',            desc: 'Offer manufacturing services — take orders and produce goods' },
                { key: 'materials', label: '🧱 Materials Supplier', desc: 'Supply raw materials, components, and fabrication inputs' },
                { key: 'gizmo',    label: '🔧 Gizmo Maker',         desc: 'Build and sell DIY electronics, IoT devices, and maker hardware' },
                { key: 'author',   label: '📚 Author / Publisher',  desc: 'Sell books, guides, technical documentation, or digital publications' },
              ] as { key: keyof typeof services; label: string; desc: string }[]).map(({ key, label, desc }) => (
                <label key={key} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px',
                  border: `2px solid ${services[key] ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 10, cursor: 'pointer',
                  background: services[key] ? 'rgba(37,99,235,0.05)' : 'transparent',
                }}>
                  <input
                    type="checkbox"
                    checked={services[key]}
                    onChange={e => setServices(s => ({ ...s, [key]: e.target.checked }))}
                    style={{ marginTop: 3, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {(services.designer || services.producer) && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              💡 Save to unlock the profile tabs for your active services above.
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={servicesSaving} style={{ alignSelf: 'flex-start', padding: '8px 24px' }}>
            {servicesSaving ? 'Saving…' : 'Save Services'}
          </button>
        </form>
      )}

      {/* ── Designer Profile ───────────────────────────────────────────────── */}
      {activeTab === 'designer' && (
        <form onSubmit={saveDesignerProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0 }}>Designer Profile</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Appears on your public designer card. Helps buyers find you.
          </p>

          <Field label="About / Bio">
            <textarea value={dBio} onChange={e => setDBio(e.target.value)} rows={4}
              placeholder="Tell buyers about yourself, your style, and what makes your work unique…"
              style={{ ...INPUT_STYLE, resize: 'vertical' }} />
          </Field>

          <Field label="Specialties">
            <textarea value={dSpecialties} onChange={e => setDSpecialties(e.target.value)} rows={2}
              placeholder="e.g. Industrial lighting, sustainable ceramics, CNC joinery…"
              style={{ ...INPUT_STYLE, resize: 'vertical' }} />
          </Field>

          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="Years of Experience">
              <input value={dExperience} onChange={e => setDExperience(e.target.value)} type="number" min="0"
                placeholder="e.g. 5" style={INPUT_STYLE} />
            </Field>
            <Field label="Hourly Rate ($)">
              <input value={dRate} onChange={e => setDRate(e.target.value)} type="number" min="0" step="0.01"
                placeholder="e.g. 65.00" style={INPUT_STYLE} />
            </Field>
          </div>

          <div>
            <label style={LABEL_STYLE}>Capabilities</label>
            <CapabilityGrid options={DESIGNER_CAPABILITIES} checked={dCaps} onChange={setDCaps} />
          </div>

          <button type="submit" className="btn-primary" disabled={designerSaving} style={{ alignSelf: 'flex-start', padding: '8px 24px' }}>
            {designerSaving ? 'Saving…' : 'Save Designer Profile'}
          </button>
        </form>
      )}

      {/* ── Producer Profile ───────────────────────────────────────────────── */}
      {activeTab === 'producer' && (
        <form onSubmit={saveProducerProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0 }}>Producer Profile</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Appears on your public producer card. Helps designers and buyers find you.
          </p>

          <Field label="About / Bio">
            <textarea value={pBio} onChange={e => setPBio(e.target.value)} rows={4}
              placeholder="Tell designers and buyers about your shop, equipment, and what you do best…"
              style={{ ...INPUT_STYLE, resize: 'vertical' }} />
          </Field>

          <Field label="Specialties">
            <textarea value={pSpecialties} onChange={e => setPSpecialties(e.target.value)} rows={2}
              placeholder="e.g. FDM printing, injection molding, CNC routing…"
              style={{ ...INPUT_STYLE, resize: 'vertical' }} />
          </Field>

          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="Minimum Batch Size">
              <input value={pMinBatch} onChange={e => setPMinBatch(e.target.value)} type="number" min="1"
                placeholder="e.g. 10" style={INPUT_STYLE} />
            </Field>
            <Field label="Lead Time (days)">
              <input value={pLeadTime} onChange={e => setPLeadTime(e.target.value)} type="number" min="1"
                placeholder="e.g. 14" style={INPUT_STYLE} />
            </Field>
          </div>

          <Field label="Production Capacity">
            <input value={pCapacity} onChange={e => setPCapacity(e.target.value)}
              placeholder="e.g. Up to 500 units/month" style={INPUT_STYLE} />
          </Field>

          <Field label="Certifications">
            <input value={pCerts} onChange={e => setPCerts(e.target.value)}
              placeholder="e.g. ISO 9001, RoHS…" style={INPUT_STYLE} />
          </Field>

          <div>
            <label style={LABEL_STYLE}>Manufacturing Capabilities</label>
            <CapabilityGrid options={PRODUCER_CAPABILITIES} checked={pCaps} onChange={setPCaps} />
          </div>

          <button type="submit" className="btn-primary" disabled={producerSaving} style={{ alignSelf: 'flex-start', padding: '8px 24px' }}>
            {producerSaving ? 'Saving…' : 'Save Producer Profile'}
          </button>
        </form>
      )}
      {/* ── Materials Supplier ─────────────────────────────────────────────── */}
      {activeTab === 'materials' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0 }}>🧱 My Material Listings</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                {materialListings.length} / 50 listings
              </p>
            </div>
            <button
              onClick={() => { setMlEditId(null); setMlFormData(EMPTY_ML_FORM); setMlError(null); setShowMlForm(true) }}
              disabled={materialListings.length >= 50}
              className="btn-primary"
              style={{ padding: '8px 18px', flexShrink: 0 }}
            >
              + Add Listing
            </button>
          </div>

          {mlMsg && (
            <div style={{ padding: '10px 16px', borderRadius: 8, background: mlMsg.type === 'success' ? 'var(--success)' : 'var(--danger)', color: 'white', fontSize: 14 }}>
              {mlMsg.text}
              <button onClick={() => setMlMsg(null)} style={{ float: 'right', background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          )}

          {/* Create / Edit form */}
          {showMlForm && (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setMlSaving(true); setMlError(null)
                try {
                  const body = {
                    title: mlFormData.title,
                    description: mlFormData.description,
                    materialTypes: mlFormData.materialTypes,
                    imageUrl: mlFormData.imageUrl || null,
                    pricePerUnit: parseFloat(mlFormData.pricePerUnit) || 0,
                    unit: mlFormData.unit,
                    amountAvailable: parseFloat(mlFormData.amountAvailable) || 0,
                    leadTimeDays: parseInt(mlFormData.leadTimeDays) || 1,
                    condition: mlFormData.condition,
                    notes: mlFormData.notes || null,
                  }
                  if (mlEditId) {
                    await api.put(`/material-listings/${mlEditId}`, body)
                  } else {
                    await api.post('/material-listings', body)
                  }
                  setShowMlForm(false); setMlEditId(null); setMlFormData(EMPTY_ML_FORM)
                  const data = await api.get<{ listings: MaterialListingData[] }>('/material-listings')
                  setMaterialListings(data.listings ?? [])
                  setMlMsg({ type: 'success', text: mlEditId ? 'Listing updated!' : 'Listing added!' })
                } catch (err) {
                  setMlError((err as Error).message)
                } finally {
                  setMlSaving(false)
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20, background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)' }}
            >
              <h4 style={{ margin: 0 }}>{mlEditId ? 'Edit Listing' : 'New Material Listing'}</h4>
              {mlError && <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--danger)', color: 'white', fontSize: 13 }}>{mlError}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Title *">
                  <input value={mlFormData.title} onChange={e => setMlFormData(f => ({ ...f, title: e.target.value }))} required style={INPUT_STYLE} maxLength={120} placeholder="e.g. Raw Oak Lumber" />
                </Field>
                <Field label="Image URL">
                  <input value={mlFormData.imageUrl} onChange={e => setMlFormData(f => ({ ...f, imageUrl: e.target.value }))} style={INPUT_STYLE} placeholder="https://…" />
                </Field>
              </div>

              <Field label="Description *">
                <textarea value={mlFormData.description} onChange={e => setMlFormData(f => ({ ...f, description: e.target.value }))} rows={3} required style={{ ...INPUT_STYLE, resize: 'vertical' }} />
              </Field>

              <div>
                <label style={LABEL_STYLE}>Material Types</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6, marginTop: 8 }}>
                  {MATERIAL_TYPE_OPTIONS.map(opt => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={mlFormData.materialTypes.includes(opt)}
                        onChange={() => setMlFormData(f => ({
                          ...f,
                          materialTypes: f.materialTypes.includes(opt)
                            ? f.materialTypes.filter(t => t !== opt)
                            : [...f.materialTypes, opt]
                        }))} />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                <Field label="Price / Unit ($) *">
                  <input value={mlFormData.pricePerUnit} onChange={e => setMlFormData(f => ({ ...f, pricePerUnit: e.target.value }))} type="number" min="0" step="0.01" required style={INPUT_STYLE} />
                </Field>
                <Field label="Unit">
                  <select value={mlFormData.unit} onChange={e => setMlFormData(f => ({ ...f, unit: e.target.value }))} style={INPUT_STYLE}>
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="Amount Available">
                  <input value={mlFormData.amountAvailable} onChange={e => setMlFormData(f => ({ ...f, amountAvailable: e.target.value }))} type="number" min="0" step="any" style={INPUT_STYLE} />
                </Field>
                <Field label="Lead Time (days)">
                  <input value={mlFormData.leadTimeDays} onChange={e => setMlFormData(f => ({ ...f, leadTimeDays: e.target.value }))} type="number" min="0" style={INPUT_STYLE} />
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <Field label="Condition">
                  <select value={mlFormData.condition} onChange={e => setMlFormData(f => ({ ...f, condition: e.target.value }))} style={INPUT_STYLE}>
                    {CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Notes">
                  <input value={mlFormData.notes} onChange={e => setMlFormData(f => ({ ...f, notes: e.target.value }))} style={INPUT_STYLE} placeholder="Min order, shipping info…" />
                </Field>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" disabled={mlSaving} className="btn-primary" style={{ padding: '8px 24px' }}>
                  {mlSaving ? 'Saving…' : mlEditId ? 'Update Listing' : 'Add Listing'}
                </button>
                <button type="button" onClick={() => { setShowMlForm(false); setMlEditId(null); setMlFormData(EMPTY_ML_FORM) }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', color: 'var(--text)' }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Listing cards — reverse chronological (API returns DESC) */}
          {mlLoading && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading listings…</div>}

          {!mlLoading && materialListings.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧱</div>
              <div>No listings yet. Click <strong>+ Add Listing</strong> to create one.</div>
            </div>
          )}

          {materialListings.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {materialListings.map(listing => (
                <div key={listing.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--card-bg)', display: 'flex', flexDirection: 'column' }}>
                  {listing.imageUrl && (
                    <img src={listing.imageUrl} alt={listing.title}
                      style={{ width: '100%', height: 140, objectFit: 'cover' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                  <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <strong style={{ fontSize: 15 }}>{listing.title}</strong>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: CONDITION_COLORS[listing.condition] ?? 'rgba(100,100,100,.15)', marginLeft: 6, whiteSpace: 'nowrap' }}>
                        {listing.condition}
                      </span>
                    </div>
                    {listing.materialTypes?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {listing.materialTypes.map(t => (
                          <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{t}</span>
                        ))}
                      </div>
                    )}
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {listing.description}
                    </p>
                    <div style={{ display: 'flex', gap: 14, fontSize: 13, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>${Number(listing.pricePerUnit).toFixed(2)}<span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>/{listing.unit}</span></span>
                      <span style={{ color: 'var(--text-secondary)' }}>Qty: {Number(listing.amountAvailable).toLocaleString()}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>Lead: {listing.leadTimeDays}d</span>
                    </div>
                    {listing.notes && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>📝 {listing.notes}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={() => {
                        setMlEditId(listing.id)
                        setMlFormData({
                          title: listing.title, description: listing.description,
                          materialTypes: listing.materialTypes ?? [],
                          imageUrl: listing.imageUrl ?? '', pricePerUnit: String(listing.pricePerUnit),
                          unit: listing.unit, amountAvailable: String(listing.amountAvailable),
                          leadTimeDays: String(listing.leadTimeDays), condition: listing.condition,
                          notes: listing.notes ?? '',
                        })
                        setMlError(null); setShowMlForm(true)
                      }}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: 12, color: 'var(--text)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Delete "${listing.title}"? This cannot be undone.`)) return
                        try {
                          await api.delete(`/material-listings/${listing.id}`)
                          setMaterialListings(prev => prev.filter(l => l.id !== listing.id))
                          setMlMsg({ type: 'success', text: 'Listing deleted.' })
                        } catch (err) {
                          setMlMsg({ type: 'error', text: (err as Error).message })
                        }
                      }}
                      style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,.4)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--danger)' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Gizmo Maker ────────────────────────────────────────────────────── */}
      {activeTab === 'gizmo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0 }}>Gizmo Maker</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Your Gizmo Maker profile is active. Products you list in the Gizmos category appear in the Gizmos marketplace tab.
          </p>
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--bg-secondary)', fontSize: 13, lineHeight: 1.6 }}>
            <strong>🔧 What this enables:</strong><br />
            Sell DIY electronics, IoT devices, maker hardware, and custom gadgets to the community.
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px dashed var(--border)', fontSize: 13, color: 'var(--text-secondary)' }}>
            📋 Detailed Gizmo Maker profile customization coming soon. Manage your listings from the Products section of your dashboard.
          </div>
        </div>
      )}

      {/* ── Author / Publisher ─────────────────────────────────────────────── */}
      {activeTab === 'author' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0 }}>Author / Publisher</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Your Author profile is active. Publications and digital content you list will be discoverable on the marketplace.
          </p>
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--bg-secondary)', fontSize: 13, lineHeight: 1.6 }}>
            <strong>📚 What this enables:</strong><br />
            Sell books, guides, technical documentation, tutorials, and digital publications to the maker community.
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px dashed var(--border)', fontSize: 13, color: 'var(--text-secondary)' }}>
            📋 Detailed Author profile customization coming soon. Manage your publications from the Products section of your dashboard.
          </div>
        </div>
      )}    </div>
  )
}
