export default function BoardBasicsSection({ board, setField }) {
  return (
    <div className="form-section">
      <h2>📋 Board Basics</h2>

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="boardId">Board ID <small style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(lowercase, used as filename)</small></label>
          <input
            id="boardId"
            type="text"
            value={board.boardId}
            onChange={e => setField('boardId', e.target.value)}
            placeholder="e.g. esp32c3_sm"
          />
        </div>

        <div className="form-group">
          <label htmlFor="boardAlias">Board Alias <small style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(human-readable name)</small></label>
          <input
            id="boardAlias"
            type="text"
            value={board.boardAlias}
            onChange={e => setField('boardAlias', e.target.value)}
            placeholder="e.g. ESP32-C3 Super Mini"
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="processor">MCU Target <small style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(firmware build target)</small></label>
          <input
            id="processor"
            type="text"
            value={board.processor}
            onChange={e => setField('processor', e.target.value)}
            placeholder="e.g. esp32c3_sm, esp32_node32s, rp2040"
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="website">Website / Product Page</label>
          <input
            id="website"
            type="text"
            value={board.website}
            onChange={e => setField('website', e.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="sku">SKU / Part Number</label>
          <input
            id="sku"
            type="text"
            value={board.sku}
            onChange={e => setField('sku', e.target.value)}
            placeholder="e.g. ESPRESSIF-ESP32C3-SM"
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          rows={3}
          value={board.description}
          onChange={e => setField('description', e.target.value)}
          placeholder="Brief description of the board and its intended use cases..."
        />
      </div>
    </div>
  )
}
