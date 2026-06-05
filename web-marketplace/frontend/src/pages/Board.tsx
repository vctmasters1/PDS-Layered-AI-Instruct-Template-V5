import { useState } from 'react'
import { useAsyncData } from '../hooks/useAsyncData'
import { fetchBulletinBoard, createBulletinCard } from '../api/board'
import { useAuth } from '../context/AuthContext'
import type { BulletinCard } from '../types'

const BOARD_CATEGORIES = ['All', 'RFB', 'Custom', 'Collab', 'Material Request', 'Service Request', 'Other']

function CardItem({ card }: { card: BulletinCard }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 16 }}>{card.title}</h4>
        {card.category && (
          <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--primary)', color: 'white', borderRadius: 12 }}>{card.category}</span>
        )}
      </div>
      {card.description && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{card.description}</p>}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
        {card.budget && <span>💰 Budget: ${card.budget}</span>}
        {card.deadline && <span>📅 {new Date(card.deadline).toLocaleDateString()}</span>}
        <span>By: {card.user?.firstName ?? 'User'}</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn-primary" style={{ fontSize: 13 }}>Respond</button>
      </div>
    </div>
  )
}

export function Board() {
  const { user } = useAuth()
  const [category, setCategory] = useState('All')
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [newCat, setNewCat] = useState('RFB')
  const [submitting, setSubmitting] = useState(false)

  const { data, loading, error, reload } = useAsyncData(
    () => fetchBulletinBoard(category !== 'All' ? category : undefined), [category]
  )

  const cards = data?.items ?? []

  async function handlePost() {
    if (!newTitle.trim()) return
    setSubmitting(true)
    try {
      await createBulletinCard({ title: newTitle, description: newDesc, budget: newBudget ? parseFloat(newBudget) : undefined, category: newCat })
      setNewTitle(''); setNewDesc(''); setNewBudget(''); setShowNew(false)
      reload()
    } catch (e) {
      alert('Failed to post: ' + (e as Error).message)
    } finally {
      setSubmitting(false) }
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {BOARD_CATEGORIES.map(c => (
            <button key={c}
              onClick={() => setCategory(c)}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)', cursor: 'pointer',
                background: category === c ? 'var(--primary)' : 'var(--card-bg)',
                color: category === c ? 'white' : 'var(--text)', fontSize: 13 }}>
              {c}
            </button>
          ))}
        </div>
        {user && <button className="btn-primary" onClick={() => setShowNew(v => !v)}>{showNew ? '✕ Cancel' : '+ Post Request'}</button>}
      </div>

      {/* New post form */}
      {showNew && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h4 style={{ margin: '0 0 12px' }}>New Request</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input placeholder="Title *" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }} />
            <textarea placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 12 }}>
              <input placeholder="Budget ($)" type="number" value={newBudget} onChange={e => setNewBudget(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }} />
              <select value={newCat} onChange={e => setNewCat(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}>
                {BOARD_CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button className="btn-primary" onClick={handlePost} disabled={submitting || !newTitle.trim()}>
              {submitting ? 'Posting…' : 'Post Request'}
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>⚠ {error}</div>}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 160, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)' }} />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
          No requests posted yet. Be the first!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {cards.map(c => <CardItem key={c.id} card={c} />)}
        </div>
      )}
    </div>
  )
}
