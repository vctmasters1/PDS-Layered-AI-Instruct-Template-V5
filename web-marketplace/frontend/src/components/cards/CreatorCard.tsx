import { Link } from 'react-router-dom'
import type { Designer, Producer } from '../../types'

interface DesignerCardProps { designer: Designer }
interface ProducerCardProps { producer: Producer }

function renderStars(rating: number) {
  const full = Math.floor(rating)
  const half = rating % 1 >= 0.5 ? 1 : 0
  const empty = 5 - full - half
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty)
}

function availabilityLabel(avail?: string) {
  const map: Record<string, string> = {
    available: '🟢 Available',
    busy: '🟡 Busy',
    waitlist_only: '🟡 Waitlist',
    unavailable: '🔴 Unavailable',
  }
  return map[avail ?? ''] ?? '⚪ Unknown'
}

export function DesignerCard({ designer }: DesignerCardProps) {
  return (
    <div className="creator-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 40, lineHeight: 1 }}>{designer.emoji ?? '🎨'}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{designer.displayName || designer.businessName || designer.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📍 {designer.location ?? 'USA'}</div>
        </div>
      </div>

      {designer.rating > 0 && (
        <div style={{ fontSize: 13 }}>
          {renderStars(designer.rating)} {designer.rating.toFixed(1)}
          <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>({designer.reviewCount ?? 0})</span>
        </div>
      )}

      <div style={{ fontSize: 12 }}>{availabilityLabel(designer.availability)}</div>

      {designer.specialties && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <strong>Specialties:</strong> {designer.specialties}
        </div>
      )}

      {designer.bio && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {designer.bio}
        </p>
      )}

      {(designer.waitlistCount ?? 0) > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📋 {designer.waitlistCount} on waitlist</div>
      )}

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <Link to={`/creators/designer/${designer.id}`} className="btn-secondary" style={{ flex: 1, fontSize: 13, textAlign: 'center' }}>View Profile</Link>
        {designer.availability !== 'unavailable' && (
          <button className="btn-primary" style={{ flex: 1, fontSize: 13 }}>Request Design</button>
        )}
      </div>
    </div>
  )
}

export function ProducerCard({ producer }: ProducerCardProps) {
  return (
    <div className="creator-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 40, lineHeight: 1 }}>{producer.emoji ?? '🏭'}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{producer.displayName || producer.businessName || producer.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📍 {producer.location ?? 'USA'}</div>
        </div>
      </div>

      {producer.rating > 0 && (
        <div style={{ fontSize: 13 }}>
          {renderStars(producer.rating)} {producer.rating.toFixed(1)}
          <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>({producer.reviewCount ?? 0})</span>
        </div>
      )}

      <div style={{ fontSize: 12 }}>{availabilityLabel(producer.availability)}</div>

      {producer.capabilities && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <strong>Capabilities:</strong> {producer.capabilities}
        </div>
      )}

      {producer.leadTime && (
        <div style={{ fontSize: 13 }}>⏱ Lead time: {producer.leadTime}</div>
      )}

      {producer.bio && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {producer.bio}
        </p>
      )}

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <Link to={`/creators/producer/${producer.id}`} className="btn-secondary" style={{ flex: 1, fontSize: 13, textAlign: 'center' }}>View Profile</Link>
        <button className="btn-primary" style={{ flex: 1, fontSize: 13 }}>Get Quote</button>
      </div>
    </div>
  )
}
