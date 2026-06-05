import { useState, useRef } from 'react'
import PinRow from './PinRow'

const SORT_COLS = [
  { key: 'header', label: 'Header',       width: 70  },
  { key: 'phys',   label: 'Phys #',       width: 70  },
  { key: 'name',   label: 'Name / Label', width: 140 },
]

export default function PinMatrixSection({ pins, onGenerate, onAdd, onUpdate, onDelete, onReorder, onToggleCap }) {
  const [generateCount, setGenerateCount] = useState(22)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const dragIndex = useRef(null)

  function handleGenerateClick() {
    if (pins.length > 0) {
      if (!confirm(`This will replace all ${pins.length} existing pin rows. Continue?`)) return
    }
    onGenerate(generateCount)
  }

  function handleSort(col) {
    const newDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc'
    setSortCol(col)
    setSortDir(newDir)

    const sorted = [...pins].sort((a, b) => {
      let av, bv
      switch (col) {
        case 'header': av = a.headerId; bv = b.headerId; break
        case 'name':   av = a.name;     bv = b.name;     break
        case 'phys':   av = parseInt(a.physical) || 0; bv = parseInt(b.physical) || 0; return newDir === 'asc' ? av - bv : bv - av
        default:       return 0
      }
      return newDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    onReorder(sorted)
  }

  // HTML5 drag-and-drop reordering
  function handleDragStart(idx) { dragIndex.current = idx }
  function handleDragEnter(idx) {
    if (dragIndex.current === null || dragIndex.current === idx) return
    const reordered = [...pins]
    const [dragged] = reordered.splice(dragIndex.current, 1)
    reordered.splice(idx, 0, dragged)
    dragIndex.current = idx
    onReorder(reordered)
  }
  function handleDragEnd() { dragIndex.current = null }

  return (
    <div className="form-section" style={{ borderLeftColor: '#28a745' }}>
      <h2>📌 Pin Capability Matrix</h2>
      <p style={{ fontSize: '0.9em', color: 'var(--text-secondary)', marginBottom: 12 }}>
        Define each pin: header, group, var alias, physical number, label, and capabilities.
        Drag the ⋮⋮ handle to reorder rows.
      </p>

      {/* Generate controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <label htmlFor="totalPinsInput" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Number of pins:</label>
          <input
            id="totalPinsInput"
            type="number"
            min="1"
            max="256"
            value={generateCount}
            onChange={e => setGenerateCount(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: 80 }}
          />
        </div>
        <button type="button" className="primary" style={{ background: '#28a745' }} onClick={handleGenerateClick}>
          ⚡ Generate Pin Rows
        </button>
        <button type="button" className="primary" style={{ background: '#17a2b8' }} onClick={onAdd}>
          ➕ Add Pin Row
        </button>
      </div>

      {/* Column headers — click to sort */}
      {pins.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '2px 8px', marginBottom: 2 }}>
          <span style={{ width: 24, minWidth: 24 }} />{/* drag handle spacer */}
          {SORT_COLS.map(col => (
            <button
              key={col.key}
              type="button"
              onClick={() => handleSort(col.key)}
              style={{
                width: col.width, minWidth: col.width,
                background: 'none', border: 'none', padding: '2px 0',
                fontSize: '0.75em', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.5px', cursor: 'pointer',
                color: sortCol === col.key ? '#667eea' : 'var(--text-secondary)',
                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              {col.label}
              {sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
          <span style={{ flex: 1, fontSize: '0.75em', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', padding: '2px 0' }}>Capabilities</span>
        </div>
      )}

      {/* Pin rows */}
      <div id="pinoutDisplay" className="pinout-display">
        {pins.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.95em' }}>
            No pin rows yet. Click <strong>Generate Pin Rows</strong> or <strong>Add Pin Row</strong> to start.
          </div>
        ) : (
          pins.map((pin, idx) => (
            <PinRow
              key={pin.id}
              pin={pin}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onToggleCap={onToggleCap}
              onDragStart={() => handleDragStart(idx)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragEnd={handleDragEnd}
            />
          ))
        )}
      </div>

      {pins.length > 0 && (
        <div style={{ marginTop: 12, fontSize: '0.85em', color: 'var(--text-secondary)' }}>
          {pins.length} pin{pins.length !== 1 ? 's' : ''} defined
        </div>
      )}
    </div>
  )
}
