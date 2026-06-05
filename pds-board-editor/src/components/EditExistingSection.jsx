import { useState } from 'react'

export default function EditExistingSection({ savedBoards, onRefresh, onLoad }) {
  const [selected, setSelected] = useState('')
  const inVSCode = Boolean(window.__isVSCodeWebview)

  return (
    <div className="form-section" style={{ borderLeftColor: '#28a745' }}>
      <h2>✏️ Edit Existing Board</h2>
      <p style={{ fontSize: '0.9em', color: 'var(--text-secondary)', marginBottom: 10 }}>
        Load a previously saved board spec into the editor to modify it.
      </p>

      {!inVSCode && (
        <div className="note" style={{ marginBottom: 10 }}>
          ⚠️ Loading existing boards is only available inside the VS Code extension.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          onFocus={onRefresh}
          disabled={!inVSCode}
          style={{ flex: 1, minWidth: 220 }}
        >
          <option value="">{inVSCode ? '-- Select a board --' : '(VS Code only)'}</option>
          {savedBoards.map(b => (
            <option key={b.id || b.boardId} value={b.id || b.boardId}>
              {b.name || b.boardAlias
                ? `${b.name || b.boardAlias} — ${b.mcuTarget || b.id || b.boardId}`
                : b.id || b.boardId}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="primary"
          style={{ background: '#28a745', flexShrink: 0 }}
          disabled={!selected || !inVSCode}
          onClick={() => selected && onLoad(selected)}
        >
          📂 Load &amp; Edit
        </button>

        {inVSCode && (
          <button
            type="button"
            style={{ background: 'var(--bg-section)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', flexShrink: 0 }}
            onClick={onRefresh}
            title="Refresh board list"
          >
            🔄
          </button>
        )}
      </div>
    </div>
  )
}
