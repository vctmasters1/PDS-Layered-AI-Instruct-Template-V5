import { useEffect, useState } from 'react'
import { getFeeSummary } from './api'
import type { FeeSummary } from './types'

// Re-exported so MessagingPage can trigger a refresh after send
export function useFeeSummary() {
  const [summary, setSummary] = useState<FeeSummary | null>(null)
  const [loading, setLoading] = useState(true)

  function refresh() {
    getFeeSummary()
      .then(d => setSummary(d.fees))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])
  return { summary, loading, refresh }
}

interface Props {
  summary: FeeSummary | null
}

export function FeeBanner({ summary }: Props) {
  if (!summary) {
    return (
      <div style={bannerStyle}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          💰 $1.00 per message · Billed every 24 hrs
        </span>
      </div>
    )
  }

  const todayCount = Number(summary.todayMessages ?? 0)
  const todayTotal = parseFloat(summary.todayTotal ?? '0')
  const unbilledTotal = parseFloat(summary.unbilledTotal ?? '0')
  const unbilledCount = Number(summary.unbilledCount ?? 0)
  const earnings = parseFloat(summary.earnings ?? '0')
  const net = unbilledTotal - earnings

  return (
    <div style={bannerStyle}>
      <span style={itemStyle}>
        {todayCount > 0
          ? `📤 Today: ${todayCount} msg${todayCount > 1 ? 's' : ''} · $${todayTotal.toFixed(2)} pending`
          : '📤 No messages sent today'}
      </span>
      {unbilledTotal > 0 && (
        <span style={itemStyle}>
          🧾 Unbilled: ${unbilledTotal.toFixed(2)} ({unbilledCount} msg{unbilledCount > 1 ? 's' : ''})
        </span>
      )}
      {earnings > 0 && (
        <span style={{ ...itemStyle, color: 'var(--success, #22c55e)' }}>
          📥 Earned: <strong>${earnings.toFixed(2)}</strong>
        </span>
      )}
      {(unbilledTotal > 0 || earnings > 0) && (
        <span style={{ ...itemStyle, fontWeight: 600, borderLeft: '1px solid var(--border)', paddingLeft: 10 }}>
          {net > 0 ? `Net owed: $${net.toFixed(2)}`
            : net < 0 ? `Net credit: $${Math.abs(net).toFixed(2)}`
            : 'Net: $0.00'}
        </span>
      )}
    </div>
  )
}

const bannerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px 16px',
  padding: '8px 16px',
  background: 'var(--bg-secondary, #f8f6f0)',
  borderBottom: '1px solid var(--border)',
  fontSize: 13,
  alignItems: 'center',
}

const itemStyle: React.CSSProperties = {
  color: 'var(--text)',
}
