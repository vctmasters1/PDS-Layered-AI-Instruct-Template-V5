export default function ActionButtons({ onSave, onClear, onOpenPinoutLeaf, boardId, onSanityCheck, sanityStatus, sanityResult, onSanityReset }) {
  const inVSCode = Boolean(window.__isVSCodeWebview)
  const isChecking = sanityStatus === 'loading'

  return (
    <div className="form-section" style={{ borderLeftColor: '#e74c3c' }}>
      <h2>💾 Actions</h2>

      <div className="button-group">
        <button
          type="button"
          className="primary"
          onClick={onSave}
          title={inVSCode ? 'Save to boards/ directory' : 'Download as JSON file'}
        >
          {inVSCode ? '💾 Save Board' : '⬇️ Download JSON'}
        </button>

        <button
          type="button"
          className="primary"
          style={{ background: '#e67e22' }}
          onClick={onOpenPinoutLeaf}
          title="Open the Pinout Leaf generator with current board data"
        >
          📄 Generate Pinout Leaf
        </button>

        <button
          type="button"
          className={`primary${isChecking ? ' btn-loading' : ''}`}
          style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', color: '#fff' }}
          disabled={isChecking}
          onClick={onSanityCheck}
          title="Ask Copilot to review the current board data for issues"
        >
          {isChecking ? '🔍 Checking…' : '🩺 Sanity Check'}
        </button>

        <button
          type="button"
          style={{ background: 'var(--bg-section)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
          onClick={onClear}
          title="Clear all fields and start fresh"
        >
          🗑️ Clear Form
        </button>
      </div>

      {sanityResult && (
        <div style={{
          marginTop: 14,
          padding: '12px 16px',
          background: sanityStatus === 'error' ? 'rgba(231,76,60,0.08)' : 'rgba(17,153,142,0.07)',
          border: `1px solid ${sanityStatus === 'error' ? '#e74c3c' : '#11998e'}`,
          borderRadius: 8,
          fontSize: '0.88em',
          lineHeight: 1.65,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <strong style={{ color: sanityStatus === 'error' ? '#e74c3c' : '#11998e' }}>
              {sanityStatus === 'error' ? '❌ Check failed' : '🩺 Sanity Check Result'}
            </strong>
            <button
              type="button"
              onClick={onSanityReset}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1em', lineHeight: 1, padding: '0 2px' }}
              title="Dismiss"
            >✕</button>
          </div>
          {sanityResult}
        </div>
      )}

      {!inVSCode && (
        <p style={{ marginTop: 10, fontSize: '0.85em', color: 'var(--text-secondary)' }}>
          Running in browser mode — JSON will be downloaded as a file.
          Open inside the VS Code extension to save directly to the project.
        </p>
      )}
    </div>
  )
}
