import type { Product, Designer, Producer, SearchFilters } from '../types'

const BASE = (import.meta.env.VITE_API_BASE || '') + '/v1'

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include' })
  if (!r.ok) throw new Error(`API error ${r.status}`)
  return r.json()
}

// ── Search endpoints ──────────────────────────────────────────────────────

export async function fetchProducts(filters: SearchFilters = {}): Promise<{ results: Product[]; total: number }> {
  const p = new URLSearchParams()
  if (filters.query) p.set('q', filters.query)
  if (filters.category) p.set('capability', filters.category)
  if (filters.limit) p.set('limit', String(filters.limit))
  if (filters.offset) p.set('offset', String(filters.offset))
  const data = await get<{ results: unknown[]; total: number }>(`${BASE}/search/products?${p}`)
  const results: Product[] = data.results.map((p: unknown) => {
    const r = p as Record<string, unknown>
    return {
      id: r.id as string,
      name: r.name as string,
      category: (r.category as string | undefined) ?? '',
      emoji: (r.emoji as string | undefined) ?? '📦',
      image: (r.images as string[] | undefined)?.[0] ?? (r.image as string | undefined) ?? '',
      images: (r.images as string[] | undefined) ?? (r.image ? [r.image as string] : []),
      designerId: (r.designer as Record<string, string> | undefined)?.id ?? (r.designerId as string | undefined) ?? null,
      designerName: (r.designer as Record<string, string> | undefined)?.businessName ?? (r.designerName as string | undefined) ?? 'Independent',
      designerLatitude: (r.designer as Record<string, number> | undefined)?.latitude ?? (r.designerLatitude as number | undefined) ?? null,
      designerLongitude: (r.designer as Record<string, number> | undefined)?.longitude ?? (r.designerLongitude as number | undefined) ?? null,
      price: parseFloat(String(r.price)) || 0,
      stock: (r.stock as number | undefined) ?? 0,
      leadTime: (r.estimatedLeadDays as number | undefined) ?? (r.leadTime as number | undefined) ?? 14,
      rating: parseFloat(String(r.averageRating ?? 0)) || 0,
      reviewCount: (r.reviewCount as number | undefined) ?? 0,
      verifiedReviewCount: (r.verifiedReviewCount as number | undefined) ?? 0,
      description: (r.description as string | undefined) ?? '',
      selfDesigned: (r.selfDesigned as boolean | undefined) ?? false,
      allowBidding: (r.allowBidding as boolean | undefined) ?? false,
      biddingProducers: (r.biddingProducers as [] | undefined) ?? [],
      waitlistCount: (r.waitlistCount as number | undefined) ?? 0,
    }
  })
  return { results, total: data.total }
}

export async function fetchDesigners(filters: SearchFilters = {}): Promise<{ results: Designer[]; total: number }> {
  const p = new URLSearchParams({ limit: String(filters.limit ?? 200) })
  if (filters.query) p.set('q', filters.query)
  if (filters.availability) p.set('availability', filters.availability)
  const data = await get<{ results: unknown[]; total: number }>(`${BASE}/search/designers?${p}`)
  const results: Designer[] = data.results.map((d: unknown) => {
    const r = d as Record<string, unknown>
    const lat = parseFloat(String(r.latitude ?? 0))
    const lng = parseFloat(String(r.longitude ?? 0))
    return {
      id: r.id as string,
      userId: r.userId as string,
      name: (r.businessName as string | undefined) ?? (r.name as string | undefined) ?? 'Unknown Designer',
      emoji: (r.emoji as string | undefined) ?? '🎨',
location: (r.location as string | undefined) ?? (`${r.city ?? ''}, ${r.state ?? ''}`.replace(/^, |, $/, '') || 'USA'),
      city: r.city as string | undefined,
      state: r.state as string | undefined,
      latitude: lat !== 0 ? lat : null,
      longitude: lng !== 0 ? lng : null,
      rating: parseFloat(String(r.averageRating ?? r.rating ?? 0)) || 0,
      reviewCount: (r.reviewCount as number | undefined) ?? 0,
      verifiedReviewCount: (r.verifiedReviewCount as number | undefined) ?? 0,
      specialties: (r.specialties as string | undefined) ?? (r.capabilities as string | undefined) ?? '',
      bio: (r.bio as string | undefined) ?? (r.description as string | undefined) ?? '',
      availability: (r.availability as Designer['availability']) ?? 'available',
      waitlistCount: (r.waitlistCount as number | undefined) ?? 0,
      averageLeadTime: (r.averageLeadTime as number | undefined) ?? 14,
      services: (r.services as Record<string, unknown> | undefined) ?? {},
      activeMaterials: ((r.services as Record<string, unknown> | undefined)?.materials as boolean) ?? false,
    }
  })
  return { results, total: data.total }
}

export async function fetchProducers(filters: SearchFilters = {}): Promise<{ results: Producer[]; total: number }> {
  const p = new URLSearchParams({ limit: String(filters.limit ?? 200) })
  if (filters.query) p.set('q', filters.query)
  if (filters.capability) p.set('capability', filters.capability)
  if (filters.availability) p.set('availability', filters.availability)
  const data = await get<{ results: unknown[]; total: number }>(`${BASE}/search/producers?${p}`)
  const results: Producer[] = data.results.map((d: unknown) => {
    const r = d as Record<string, unknown>
    let capStr = ''
    if (r.capabilities) {
      const caps = r.capabilities as Record<string, unknown>
      if (Array.isArray(caps.materialTypes)) {
        capStr = (caps.materialTypes as string[]).map((c: string) => c.replace(/_/g, ' ')).join(', ')
      } else if (typeof r.capabilities === 'string') {
        capStr = r.capabilities
      }
    }
    const lat = parseFloat(String(r.latitude ?? 0))
    const lng = parseFloat(String(r.longitude ?? 0))
    return {
      id: r.id as string,
      userId: r.userId as string,
      name: (r.businessName as string | undefined) ?? (r.name as string | undefined) ?? 'Unknown Producer',
      emoji: (r.emoji as string | undefined) ?? '🏭',
location: (r.location as string | undefined) ?? (`${r.city ?? ''}, ${r.state ?? ''}`.replace(/^, |, $/, '') || 'USA'),
      city: r.city as string | undefined,
      state: r.state as string | undefined,
      latitude: lat !== 0 ? lat : null,
      longitude: lng !== 0 ? lng : null,
      rating: parseFloat(String(r.averageRating ?? r.rating ?? 0)) || 0,
      reviewCount: (r.reviewCount as number | undefined) ?? 0,
      verifiedReviewCount: (r.verifiedReviewCount as number | undefined) ?? 0,
      capabilities: capStr,
      leadTime: r.averageLeadTime ? `${r.averageLeadTime} days` : '10–14 days',
      bio: (r.bio as string | undefined) ?? '',
      availability: (r.availability as Producer['availability']) ?? 'available',
      waitlistCount: (r.waitlistCount as number | undefined) ?? 0,
      services: (r.services as Record<string, unknown> | undefined) ?? {},
      activeMaterials: ((r.services as Record<string, unknown> | undefined)?.materials as boolean) ?? false,
    }
  })
  return { results, total: data.total }
}

// ── Material Listings (supplier-posted raw materials) ─────────────────────────

export interface SupplierMaterialListing {
  id: string
  title: string
  description: string
  materialTypes: string[]
  imageUrl: string | null
  pricePerUnit: number
  unit: string
  amountAvailable: number
  leadTimeDays: number
  condition: string
  notes: string | null
  createdAt: string
  seller: { businessName: string | null; city: string | null; state: string | null; lat: number | null; lng: number | null }
}

export async function fetchMaterialListings(opts: { q?: string; limit?: number; offset?: number } = {}): Promise<{ listings: SupplierMaterialListing[]; total: number }> {
  const p = new URLSearchParams()
  if (opts.q)      p.set('q', opts.q)
  if (opts.limit)  p.set('limit', String(opts.limit))
  if (opts.offset) p.set('offset', String(opts.offset))
  const data = await get<{ listings: unknown[]; total: number }>(`${BASE}/material-listings/public?${p}`)
  const listings: SupplierMaterialListing[] = (data.listings ?? []).map((item) => {
    const r = item as Record<string, unknown>
    const seller = (r.seller as Record<string, unknown>) ?? {}
    return {
      id:              r.id as string,
      title:           r.title as string,
      description:     r.description as string,
      materialTypes:   (r.materialTypes as string[]) ?? [],
      imageUrl:        (r.imageUrl as string | null) ?? null,
      pricePerUnit:    Number(r.pricePerUnit),
      unit:            r.unit as string,
      amountAvailable: Number(r.amountAvailable),
      leadTimeDays:    Number(r.leadTimeDays),
      condition:       r.condition as string,
      notes:           (r.notes as string | null) ?? null,
      createdAt:       r.createdAt as string,
      seller: {
        businessName: (seller.businessName as string | null) ?? null,
        city:         (seller.city as string | null) ?? null,
        state:        (seller.state as string | null) ?? null,
        lat:          seller.lat != null ? Number(seller.lat) : null,
        lng:          seller.lng != null ? Number(seller.lng) : null,
      },
    }
  })
  return { listings, total: data.total }
}
