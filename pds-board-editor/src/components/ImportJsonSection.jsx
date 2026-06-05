export default function ImportJsonSection({ value, onChange, onImport }) {
  return (
    <div className="form-section" style={{ borderLeftColor: '#17a2b8' }}>
      <h2>📥 Import from JSON</h2>
      <p style={{ fontSize: '0.9em', color: 'var(--text-secondary)', marginBottom: 12 }}>
        Paste an existing board JSON (from a .json file or Copilot output) to auto-fill all fields.
      </p>

      <div className="form-group">
        <label htmlFor="pasteJsonInput">Paste JSON here</label>
        <textarea
          id="pasteJsonInput"
          rows={6}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder='{ "boardId": "esp32c3_sm", "mcuTarget": "...", "pin_capabilities": [...] }'
          style={{ fontFamily: 'Courier New, monospace', fontSize: '0.85em', resize: 'vertical' }}
        />
      </div>

      <button
        type="button"
        className="primary"
        style={{ background: '#17a2b8' }}
        disabled={!value.trim()}
        onClick={onImport}
      >
        📥 Import JSON
      </button>
    </div>
  )
}
