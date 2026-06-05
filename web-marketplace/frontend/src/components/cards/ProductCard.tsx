import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Product, BiddingProducer } from '../../types'

interface ProductCardProps {
  product: Product
}

function renderStars(rating: number) {
  const full = Math.floor(rating)
  const half = rating % 1 >= 0.5 ? 1 : 0
  const empty = 5 - full - half
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty)
}

function stockBadge(stock: number) {
  if (stock > 10) return <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ In Stock</span>
  if (stock > 0) return <span style={{ color: 'var(--warning)', fontWeight: 600 }}>⚠ Low ({stock})</span>
  return <span style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ Out of Stock</span>
}

function availabilityColor(avail: string) {
  if (avail === 'available') return 'var(--success)'
  if (avail === 'busy') return 'var(--warning)'
  return 'var(--text-secondary)'
}

export function ProductCard({ product }: ProductCardProps) {
  const images = product.images && product.images.length > 0 ? product.images : product.image ? [product.image] : []
  const [imgIndex, setImgIndex] = useState(0)
  const [selectedProducerIdx, setSelectedProducerIdx] = useState(0)

  const biddingProducers: BiddingProducer[] = product.biddingProducers ?? []
  const hasProducers = biddingProducers.length > 0
  const selectedProd = biddingProducers[selectedProducerIdx] ?? null

  const totalPrice = hasProducers && selectedProd
    ? (product.price + (selectedProd.quote ?? 0)).toFixed(2)
    : (product.price ?? 0).toFixed(2)

  return (
    <div className="product-card product-card--listing">
      {/* Image carousel */}
      {images.length > 0 && (
        <div className="product-card-thumb">
          <div className="product-image-carousel" style={{ position: 'relative' }}>
            <img
              src={images[imgIndex]}
              alt={product.name}
              className="carousel-img active"
              onError={(e) => { (e.target as HTMLImageElement).src = `https://via.placeholder.com/300?text=${encodeURIComponent(product.name)}` }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {images.length > 1 && (
              <>
                <button
                  className="carousel-prev"
                  onClick={() => setImgIndex(i => (i - 1 + images.length) % images.length)}
                  style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', fontSize: 16, padding: '4px 8px', cursor: 'pointer', borderRadius: 4, zIndex: 10 }}
                >‹</button>
                <button
                  className="carousel-next"
                  onClick={() => setImgIndex(i => (i + 1) % images.length)}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', fontSize: 16, padding: '4px 8px', cursor: 'pointer', borderRadius: 4, zIndex: 10 }}
                >›</button>
                <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
                  {images.map((_, i) => (
                    <span
                      key={i}
                      onClick={() => setImgIndex(i)}
                      style={{ width: 6, height: 6, borderRadius: '50%', background: i === imgIndex ? 'white' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="product-card-info">
        <div className="product-header">
          <h4>{product.emoji ?? '📦'} {product.name}</h4>
        </div>
        <div className="product-body" data-product-id={product.id}>
          {/* Rating */}
          {(product.rating ?? 0) > 0 && (
            <div className="rating-two-tier" style={{ margin: '8px 0' }}>
              <span className="rating-stars">{renderStars(product.rating!)} {product.rating!.toFixed(1)}</span>
              <span className="rating-breakdown desktop-only">
                ({product.verifiedReviewCount ?? 0} verified, {(product.reviewCount ?? 0) - (product.verifiedReviewCount ?? 0)} community)
              </span>
            </div>
          )}

          {/* Mobile compact status */}
          <div className="mobile-only product-meta-compact" style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0' }}>
            <span>⏱ {product.leadTime ?? 14}d</span>
            {stockBadge(product.stock ?? 0)}
          </div>

          {/* Designer */}
          <div className="designer-section" style={{ fontSize: 13 }}>
            👤 <strong>Designed by:</strong>{' '}
            {product.designerId
              ? <Link to={`/creators/designer/${product.designerId}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{product.designerName ?? 'Independent'}</Link>
              : (product.designerName ?? 'Independent')
            }
          </div>

          {/* Producer dropdown */}
          {hasProducers ? (
            <div className="producer-section" style={{ margin: '8px 0' }}>
              <label htmlFor={`producer-${product.id}`} style={{ fontSize: 13 }}><strong>Produced by:</strong></label>
              <select
                id={`producer-${product.id}`}
                className="producer-dropdown"
                value={selectedProducerIdx}
                onChange={e => setSelectedProducerIdx(Number(e.target.value))}
                style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, fontSize: 13 }}
              >
                {biddingProducers.map((p, i) => (
                  <option key={p.id} value={i}>
                    {p.name} — {p.leadTime ?? '?'} — ${(p.quote ?? 0).toFixed(2)}
                  </option>
                ))}
              </select>
              {selectedProd && (
                <Link to={`/creators/producer/${selectedProd.id}`} style={{ marginLeft: 8, fontSize: 12, color: 'var(--primary)', textDecoration: 'none', whiteSpace: 'nowrap' }}>View Profile</Link>
              )}
            </div>
          ) : (
            <div className="producer-section" style={{ fontSize: 13 }}>✓ <strong>Designer Designed &amp; Produced</strong></div>
          )}

          {/* Price */}
          <div className="product-price">${totalPrice}</div>
          {hasProducers && selectedProd && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              Design: ${product.price.toFixed(2)} + Production: ${(selectedProd.quote ?? 0).toFixed(2)}
            </div>
          )}

          {/* Desktop status row */}
          <div className="product-status-row desktop-only" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, margin: '12px 0', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div><span style={{ color: 'var(--text-secondary)' }}>⏱ Lead Time:</span> <strong>{product.leadTime ?? 14} days</strong></div>
            <div>{stockBadge(product.stock ?? 0)}</div>
          </div>
          {(product.stock ?? 0) === 0 && (
            <div className="waitlist-indicator desktop-only" style={{ fontSize: 12 }}>
              📋 <strong>{product.waitlistCount ?? 0}</strong> on waitlist
            </div>
          )}

          {/* Description */}
          {product.description && (
            <p className="product-description desktop-only" style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0' }}>
              {product.description}
            </p>
          )}

          {/* Actions */}
          <div className="product-actions" style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button className="btn-primary product-buy-btn" disabled={(product.stock ?? 0) === 0}>
              🛒 Buy Now
            </button>
            {(product.stock ?? 0) === 0 && (
              <button className="btn-secondary product-waitlist-btn">⏰ Waitlist</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Designer Card ────────────────────────────────────────────────────────

export { availabilityColor }

export function AvailabilityBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    available: '🟢 Available',
    busy: '🟡 Busy',
    waitlist_only: '🟡 Waitlist',
    unavailable: '🔴 Unavailable',
  }
  return <span style={{ color: availabilityColor(status ?? ''), fontSize: 12 }}>{map[status ?? ''] ?? '⚪ Unknown'}</span>
}
