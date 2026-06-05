import PinoutTablePreview from './PinoutTablePreview'

export default function JsonPreviewSection({ boardJson, pins, onReorder }) {
  const jsonText = JSON.stringify(boardJson, null, 2)

  return (
    <div className="form-section" style={{ borderLeftColor: '#764ba2' }}>
      <h2>👁️ Preview</h2>

      {/* Pinout table preview */}
      {(pins?.length > 0) && (
        <div style={{ marginBottom: 20 }}>
          <label>Pinout Preview — drag rows to set physical order</label>
          <div style={{ marginTop: 8, overflowX: 'auto' }}>
            <PinoutTablePreview pins={pins} onReorder={onReorder} />
          </div>
        </div>
      )}

      {/* JSON output */}
      <label>Generated JSON</label>
      <pre id="preview" className="json-preview">{jsonText}</pre>
    </div>
  )
}
