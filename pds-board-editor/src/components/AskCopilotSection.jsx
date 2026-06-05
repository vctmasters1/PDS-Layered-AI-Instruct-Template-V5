import { useState } from 'react'

export default function AskCopilotSection({ status, error, onAsk, onStatusReset }) {
  const [boardName, setBoardName] = useState('')
  const inVSCode = Boolean(window.__isVSCodeWebview)
  const isLoading = status === 'loading'

  function handleAsk() {
    const name = boardName.trim()
    if (!name) { alert('Please enter a board / platform name first.'); return }
    onAsk(name)
  }

  return (
    <div className="form-section" style={{ borderLeftColor: '#764ba2' }}>
      <h2>🚀 Ask Copilot for Board Specs</h2>
      <p style={{ fontSize: '0.9em', color: 'var(--text-secondary)', marginBottom: 12 }}>
        {inVSCode
          ? 'Enter the board name and let Copilot research and fill in all specs automatically.'
          : 'In a browser, the prompt is copied to your clipboard to paste into Copilot/ChatGPT.'}
      </p>

      <div className="form-group">
        <label htmlFor="platformSearchInput">Board / Platform Name</label>
        <input
          id="platformSearchInput"
          type="text"
          value={boardName}
          onChange={e => setBoardName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !isLoading && handleAsk()}
          placeholder="e.g. ESP32-C3 Super Mini, Arduino Nano, RP2040..."
          disabled={isLoading}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          id="askCopilotBtn"
          type="button"
          className={`primary${isLoading ? ' btn-loading' : ''}`}
          style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          disabled={isLoading}
          onClick={handleAsk}
        >
          {isLoading ? 'Asking Copilot…' : (inVSCode ? '🚀 Ask Copilot' : '📋 Copy Prompt')}
        </button>

        {status && status !== 'idle' && status !== 'loading' && (
          <button
            type="button"
            style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
            onClick={onStatusReset}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {status === 'success' && (
        <div className="note" style={{ marginTop: 10 }}>
          ✅ Copilot research complete — form auto-filled!
        </div>
      )}
      {status === 'error' && (
        <div className="error" style={{ marginTop: 10 }}>
          ❌ {error || 'Copilot request failed. Try again.'}
        </div>
      )}
      {status === 'copied' && (
        <div className="note" style={{ marginTop: 10 }}>
          ✅ Prompt copied to clipboard! Paste it into Copilot or ChatGPT.
        </div>
      )}
      {status === 'copy-failed' && (
        <div className="note" style={{ marginTop: 10, borderLeftColor: '#e67e22' }}>
          ⚠️ Could not copy automatically. Use the generated prompt below manually.
        </div>
      )}
    </div>
  )
}
