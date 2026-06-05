import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAsyncData } from '../hooks/useAsyncData'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/client'
import { PostCard } from '../components/creator/PostCard'
import type { Post } from '../components/creator/PostCard'

const API_BASE = (import.meta.env.VITE_API_BASE || '') + '/v1'

// ─── API types ───────────────────────────────────────────────────────────────

interface DesignerProfile {
  id: string; userId?: string; displayName?: string | null; businessName?: string
  description?: string; portfolio?: string; specialties?: string
  capabilities?: string[]; experience?: number; hourlyRate?: number
  city?: string; state?: string; location?: string; rating: number
  reviewCount: number; verifiedReviewCount?: number; totalSales?: number
  averageLeadTime?: number; availability?: string; waitlistCount?: number
  verified?: boolean
}

interface ProducerProfile {
  id: string; userId?: string; displayName?: string | null; businessName?: string
  specialties?: string; certifications?: string; capabilities?: unknown[]
  minBatch?: number; capacity?: number; city?: string; state?: string
  location?: string; rating: number; reviewCount: number
  totalOrdersFulfilled?: number; averageLeadTime?: number
  availability?: string; waitlistCount?: number; verified?: boolean
}

interface PortfolioImage { id: string; imageUrl: string; caption: string | null; sortOrder: number }

interface PostsPage { posts: Post[]; total: number; page: number; pages: number }

// ─── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchDesigner(id: string): Promise<DesignerProfile> {
  const r = await fetch(`${API_BASE}/search/designers/${id}`, { credentials: 'include' })
  if (!r.ok) throw new Error('Designer not found')
  return r.json()
}

async function fetchProducer(id: string): Promise<ProducerProfile> {
  const r = await fetch(`${API_BASE}/search/producers/${id}`, { credentials: 'include' })
  if (!r.ok) throw new Error('Producer not found')
  return r.json()
}

async function fetchPortfolio(userId: string): Promise<PortfolioImage[]> {
  try {
    const r = await fetch(`${API_BASE}/portfolio/profile/${userId}`, { credentials: 'include' })
    if (!r.ok) return []
    const data = await r.json()
    return Array.isArray(data) ? data : (data.images ?? [])
  } catch { return [] }
}

async function fetchPosts(type: string, id: string, page = 1): Promise<PostsPage> {
  const r = await fetch(`${API_BASE}/creator-posts/${type}/${id}?page=${page}`, { credentials: 'include' })
  if (!r.ok) return { posts: [], total: 0, page: 1, pages: 0 }
  return r.json()
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function availabilityBadge(avail?: string) {
  const map: Record<string, { label: string; color: string }> = {
    available:     { label: '🟢 Available',  color: 'var(--success)' },
    busy:          { label: '🟡 Busy',        color: 'var(--warning)' },
    waitlist_only: { label: '🟡 Waitlist',    color: 'var(--warning)' },
    unavailable:   { label: '🔴 Unavailable', color: 'var(--danger)' },
  }
  const v = map[avail ?? ''] ?? { label: '⚪ Unknown', color: 'var(--text-secondary)' }
  return <span style={{ fontSize: 13, color: v.color, fontWeight: 600 }}>{v.label}</span>
}

function renderStars(r: number) {
  return '★'.repeat(Math.floor(r)) + (r % 1 >= 0.5 ? '½' : '') + '☆'.repeat(5 - Math.floor(r) - (r % 1 >= 0.5 ? 1 : 0))
}

function Pill({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '4px 10px', borderRadius: 20, margin: 3,
      background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: 12,
    }}>{label}</span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 18px', background: 'var(--bg-secondary)', borderRadius: 10, minWidth: 90 }}>
      <div style={{ fontWeight: 700, fontSize: 18 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ─── New Post Form ────────────────────────────────────────────────────────────

function NewPostForm({ creatorType, creatorId, onPosted }: {
  creatorType: string; creatorId: string; onPosted: (post: Post) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const previews = images.map(f => URL.createObjectURL(f))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('creatorType', creatorType)
      fd.append('creatorId', creatorId)
      if (title.trim()) fd.append('title', title.trim())
      fd.append('content', content.trim())
      images.forEach(img => fd.append('images', img))

      const r = await fetch(`${API_BASE}/creator-posts`, {
        method: 'POST', credentials: 'include', body: fd,
      })
      if (!r.ok) throw new Error('Failed to post')
      const post: Post = await r.json()
      onPosted(post)
      setTitle(''); setContent(''); setImages([]); setOpen(false)
    } catch { /* todo: show error */ } finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)} style={{ marginBottom: 20 }}>
        + New Post
      </button>
    )
  }

  return (
    <form onSubmit={submit} style={{
      background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12,
      padding: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontWeight: 600, fontSize: 15 }}>New Post</div>
      <input
        placeholder="Title (optional)"
        value={title} onChange={e => setTitle(e.target.value)}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 14 }}
      />
      <textarea
        placeholder="What are you working on?"
        value={content} onChange={e => setContent(e.target.value)}
        required rows={4}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }}
      />
      {previews.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {previews.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={src} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }} />
              <button type="button"
                onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: -6, right: -6, background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10, padding: 0 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={() => fileRef.current?.click()}
          className="btn-secondary" style={{ fontSize: 13 }}>
          📷 Add Images
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden
          onChange={e => {
            const files = Array.from(e.target.files ?? []).slice(0, 4 - images.length)
            setImages(prev => [...prev, ...files].slice(0, 4))
            e.target.value = ''
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{images.length}/4 images</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)} style={{ fontSize: 13 }}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || !content.trim()} style={{ fontSize: 13 }}>
            {saving ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function DesignerProfile({ d, portfolio }: { d: DesignerProfile; portfolio: PortfolioImage[] }) {
  const caps = d.capabilities ?? []
  return (
    <div>
      {d.specialties && (
        <Section title="About">
          <p style={{ fontSize: 14, lineHeight: 1.75, margin: 0 }}>{d.specialties}</p>
        </Section>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 24 }}>
        {(d.totalSales ?? 0) > 0 && <Stat label="Total Sales" value={String(d.totalSales)} />}
        {(d.averageLeadTime ?? 0) > 0 && <Stat label="Avg Lead Time" value={`${d.averageLeadTime}d`} />}
        {(d.experience ?? 0) > 0 && <Stat label="Experience" value={`${d.experience} yrs`} />}
        {(d.hourlyRate ?? 0) > 0 && <Stat label="Hourly Rate" value={`$${d.hourlyRate}`} />}
      </div>

      {caps.length > 0 && (
        <Section title="Skills & Capabilities">
          <div>{caps.map(c => <Pill key={c} label={c} />)}</div>
        </Section>
      )}

      {d.portfolio && (
        <Section title="Portfolio Link">
          <a href={d.portfolio} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 14, color: 'var(--primary)' }}>
            🔗 {d.portfolio}
          </a>
        </Section>
      )}

      {portfolio.length > 0 && (
        <Section title={`Work Showcase (${portfolio.length})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {portfolio.map(img => (
              <div key={img.id} style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: 'var(--bg-secondary)' }}>
                <img src={img.imageUrl} alt={img.caption ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Endorsements">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
          Endorsements from collaborators coming soon.
        </p>
      </Section>
    </div>
  )
}

function ProducerProfile({ p, portfolio }: { p: ProducerProfile; portfolio: PortfolioImage[] }) {
  const caps = Array.isArray(p.capabilities) ? p.capabilities as string[] : []
  return (
    <div>
      {p.specialties && (
        <Section title="About">
          <p style={{ fontSize: 14, lineHeight: 1.75, margin: 0 }}>{p.specialties}</p>
        </Section>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 24 }}>
        {(p.totalOrdersFulfilled ?? 0) > 0 && <Stat label="Orders Fulfilled" value={String(p.totalOrdersFulfilled)} />}
        {(p.averageLeadTime ?? 0) > 0 && <Stat label="Lead Time" value={`${p.averageLeadTime}d`} />}
        {(p.minBatch ?? 0) > 0 && <Stat label="Min Batch" value={String(p.minBatch)} />}
        {(p.capacity ?? 0) > 0 && <Stat label="Capacity/mo" value={String(p.capacity)} />}
      </div>

      {p.certifications && (
        <Section title="Certifications">
          <p style={{ fontSize: 14, margin: 0 }}>{p.certifications}</p>
        </Section>
      )}

      {caps.length > 0 && (
        <Section title="Manufacturing Capabilities">
          <div>{caps.map(c => <Pill key={c} label={c} />)}</div>
        </Section>
      )}

      {portfolio.length > 0 && (
        <Section title={`Work Showcase (${portfolio.length})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {portfolio.map(img => (
              <div key={img.id} style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: 'var(--bg-secondary)' }}>
                <img src={img.imageUrl} alt={img.caption ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Endorsements">
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
          Endorsements from collaborators coming soon.
        </p>
      </Section>
    </div>
  )
}

// ─── Feed Tab ─────────────────────────────────────────────────────────────────

function FeedTabInner({ type, creatorId, userId, isOwner }: {
  type: string; creatorId: string; userId?: string; isOwner: boolean
}) {
  const [posts, setPosts] = useState<Post[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPosts(type, creatorId, page).then(data => {
      if (cancelled) return
      setPosts(prev => page === 1 ? data.posts : [...prev, ...data.posts])
      setTotalPages(data.pages)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [type, creatorId, page])

  function onPosted(post: Post) {
    setPosts(prev => [post, ...prev])
  }

  function onDeleted(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  if (loading && posts.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 120, background: 'var(--bg-secondary)', borderRadius: 12 }} />
        ))}
      </div>
    )
  }

  return (
    <div>
      {isOwner && userId && (
        <NewPostForm creatorType={type} creatorId={creatorId} onPosted={onPosted} />
      )}

      {posts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 40 }}>📭</div>
          <p style={{ marginTop: 12 }}>No posts yet.</p>
          {isOwner && <p style={{ fontSize: 13 }}>Share your current work, ideas, or updates above.</p>}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {posts.map(p => (
          <PostCard key={p.id} post={p} onDeleted={onDeleted} />
        ))}
      </div>

      {page < totalPages && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="btn-secondary" onClick={() => setPage(p => p + 1)}>
            Load more
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Profile Header (shared) ─────────────────────────────────────────────────

function ProfileHeader({
  emoji, displayName, businessName, location, rating, reviewCount,
  availability, waitlistCount, verified, ctaButtons,
}: {
  emoji: string; displayName: string; businessName?: string; location: string
  rating: number; reviewCount: number; availability?: string; waitlistCount?: number
  verified?: boolean; ctaButtons: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 72, lineHeight: 1, flexShrink: 0 }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 26, margin: 0, fontWeight: 800 }}>{displayName}</h1>
          {verified && (
            <span style={{ fontSize: 12, background: 'var(--primary)', color: 'white', padding: '2px 10px', borderRadius: 20 }}>
              ✓ Verified
            </span>
          )}
        </div>
        {businessName && businessName !== displayName && (
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 3 }}>{businessName}</div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 5 }}>📍 {location}</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {rating > 0 && (
            <span style={{ fontSize: 14 }}>
              <span style={{ color: '#fbbf24' }}>{renderStars(rating)}</span>{' '}
              <strong>{rating.toFixed(1)}</strong>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 5 }}>({reviewCount})</span>
            </span>
          )}
          {availabilityBadge(availability)}
          {(waitlistCount ?? 0) > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📋 {waitlistCount} on waitlist</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
        {ctaButtons}
      </div>
    </div>
  )
}

// ─── Root Component ───────────────────────────────────────────────────────────

type TabId = 'profile' | 'feed'

export function CreatorProfilePage() {
  const { type, id } = useParams<{ type: 'designer' | 'producer'; id: string }>()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('profile')

  const designer = useAsyncData(
    () => type === 'designer' && id ? fetchDesigner(id) : Promise.resolve(null),
    [type, id]
  )
  const producer = useAsyncData(
    () => type === 'producer' && id ? fetchProducer(id) : Promise.resolve(null),
    [type, id]
  )

  const profileData = type === 'designer' ? designer.data : producer.data
  const loading = type === 'designer' ? designer.loading : producer.loading
  const error = type === 'designer' ? designer.error : producer.error

  const userId = profileData?.userId
  const isOwner = !!user && !!userId && user.id === userId

  // Portfolio images — only load once we have a userId
  const portfolio = useAsyncData(
    () => userId ? fetchPortfolio(userId) : Promise.resolve([] as PortfolioImage[]),
    [userId]
  )

  // ── Loading skeleton
  if (loading) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ height: 120, background: 'var(--bg-secondary)', borderRadius: 16, marginTop: 24 }} />
        <div style={{ height: 40, background: 'var(--bg-secondary)', borderRadius: 8, marginTop: 16, width: '60%' }} />
        <div style={{ height: 200, background: 'var(--bg-secondary)', borderRadius: 12, marginTop: 16 }} />
      </div>
    )
  }

  // ── 404
  if (error || !profileData) {
    return (
      <div style={{ maxWidth: 760, margin: '40px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 56 }}>🔍</div>
        <h2 style={{ marginTop: 16 }}>Profile not found</h2>
        <p style={{ color: 'var(--text-secondary)' }}>This creator profile doesn't exist or may have been removed.</p>
        <Link to="/creators" className="btn-primary" style={{ display: 'inline-block', marginTop: 16 }}>
          Browse Creators
        </Link>
      </div>
    )
  }

  // ── Compute display values
  const d = designer.data
  const p = producer.data
  const displayName = profileData.displayName || profileData.businessName || 'Creator'
  const businessName = profileData.businessName
  const location = profileData.location
    ?? (`${profileData.city ?? ''}, ${profileData.state ?? ''}`.trim().replace(/^,\s*|,\s*$/, '') || 'Location unknown')
  const emoji = type === 'designer' ? '🎨' : '🏭'

  const tabStyle = (t: TabId): React.CSSProperties => ({
    padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
    background: activeTab === t ? 'var(--primary)' : 'transparent',
    color: activeTab === t ? 'white' : 'var(--text-secondary)',
  })

  const ctaButtons = type === 'designer' ? (
    <>
      {d?.availability !== 'unavailable' && (
        <button className="btn-primary" style={{ width: '100%' }}>Request Design</button>
      )}
      {(d?.waitlistCount ?? 0) > 0 && (
        <button className="btn-secondary" style={{ width: '100%', fontSize: 13 }}>Join Waitlist</button>
      )}
      {d?.portfolio && (
        <a href={d.portfolio} target="_blank" rel="noopener noreferrer"
          className="btn-secondary" style={{ width: '100%', textAlign: 'center', fontSize: 13 }}>
          🔗 Portfolio
        </a>
      )}
    </>
  ) : (
    <>
      <button className="btn-primary" style={{ width: '100%' }}>Get Quote</button>
      {(p?.waitlistCount ?? 0) > 0 && (
        <button className="btn-secondary" style={{ width: '100%', fontSize: 13 }}>Join Waitlist</button>
      )}
    </>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px' }}>
      <Link to="/creators" style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none' }}>
        ← Back to Creators
      </Link>

      <div style={{ marginTop: 20 }}>
        <ProfileHeader
          emoji={emoji} displayName={displayName} businessName={businessName}
          location={location} rating={profileData.rating} reviewCount={profileData.reviewCount}
          availability={profileData.availability} waitlistCount={profileData.waitlistCount}
          verified={profileData.verified} ctaButtons={ctaButtons}
        />
      </div>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button style={tabStyle('profile')} onClick={() => setActiveTab('profile')}>👤 Profile</button>
        <button style={tabStyle('feed')} onClick={() => setActiveTab('feed')}>📰 Feed</button>
      </div>

      {activeTab === 'profile' && type === 'designer' && d && (
        <DesignerProfile d={d} portfolio={portfolio.data ?? []} />
      )}
      {activeTab === 'profile' && type === 'producer' && p && (
        <ProducerProfile p={p} portfolio={portfolio.data ?? []} />
      )}
      {activeTab === 'feed' && id && type && (
        <FeedTabInner
          type={type} creatorId={id}
          userId={userId}
          isOwner={isOwner}
        />
      )}
    </div>
  )
}
