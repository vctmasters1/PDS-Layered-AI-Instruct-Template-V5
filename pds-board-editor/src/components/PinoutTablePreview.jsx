import { useRef } from 'react'

// Capability display order — common/signal caps closest to name, power furthest out
const CAP_ORDER = [
  'GPIO', 'ADC-1', 'ADC-2', 'PWM',
  'UART', 'RXD', 'TXD',
  'SPI', 'MISO', 'MOSI', 'SCK',
  'I2C', 'SDA', 'SCL',
  'CAN', 'RMT', 'INTERRUPT',
  'RESET', 'VIN', 'GND', '3V3', '5V',
]

const CAP_ABBR = {
  GPIO: 'IO', 'ADC-1': 'ADC1', 'ADC-2': 'ADC2', PWM: 'PWM', UART: 'UART', RXD: 'RX', TXD: 'TX',
  SPI: 'SPI', MISO: 'MISO', MOSI: 'MOSI', SCK: 'SCK', I2C: 'I2C', SDA: 'SDA',
  SCL: 'SCL', CAN: 'CAN', RMT: 'RMT', INTERRUPT: 'INT', RESET: 'RST',
  VIN: 'VIN', GND: 'GND', '3V3': '3V3', '5V': '5V',
}

const CAP_COLORS = {
  VIN: '#e74c3c', GND: '#636e72', '3V3': '#e17055', '5V': '#e74c3c',
  RESET: '#95a5a6', GPIO: '#667eea', 'ADC-1': '#2ecc71', 'ADC-2': '#e67e22', PWM: '#f39c12',
  UART: '#e67e22', RXD: '#d35400', TXD: '#e67e22',
  SPI: '#9b59b6', MISO: '#8e44ad', MOSI: '#9b59b6', SCK: '#6c5ce7',
  I2C: '#3498db', SDA: '#2980b9', SCL: '#74b9ff',
  CAN: '#c0392b', RMT: '#16a085', INTERRUPT: '#8e44ad',
}

function capColor(cap) { return CAP_COLORS[cap] || '#667eea' }

export default function PinoutTablePreview({ pins, onReorder }) {
  const dragIdxRef  = useRef(null)
  const dragSideRef = useRef(null)

  if (!pins || pins.length === 0) return null

  const j1   = pins.filter(p => p.headerId === 'J1')
  const j2   = pins.filter(p => p.headerId === 'J2')
  const rest = pins.filter(p => p.headerId !== 'J1' && p.headerId !== 'J2')

  // Only render cap columns used by at least one pin in the board
  const activeCaps = CAP_ORDER.filter(cap => pins.some(p => p.capabilities.includes(cap)))

  function reorder(side, from, to) {
    if (from === to) return
    // J2 is displayed reversed (descending physical); work on reversed array then flip back
    const list = side === 'J1' ? [...j1] : [...j2].reverse()
    const [item] = list.splice(from, 1)
    list.splice(to, 0, item)
    const newJ1 = side === 'J1' ? list : j1
    const newJ2 = side === 'J2' ? list.reverse() : j2
    // J1 = phys 1..N, J2 = phys N+1..M
    onReorder([
      ...newJ1.map((p, i) => ({ ...p, physical: String(i + 1) })),
      ...newJ2.map((p, i) => ({ ...p, physical: String(newJ1.length + i + 1) })),
      ...rest,
    ])
  }

  // Cap column headers
  // J1 (left side): reversed — outermost cap is leftmost
  // J2 (right side): forward  — outermost cap is rightmost
  function capHeaders(isJ1) {
    const caps = isJ1 ? [...activeCaps].reverse() : activeCaps
    return caps.map(cap => (
      <th key={cap} className="po-cap-th" title={cap}>
        <span className="po-cap-hdr-text" style={{ color: capColor(cap) }}>
          {CAP_ABBR[cap] || cap}
        </span>
      </th>
    ))
  }

  function renderRows(sidePins, isJ1) {
    const side = isJ1 ? 'J1' : 'J2'
    const orderedCaps = isJ1 ? [...activeCaps].reverse() : activeCaps

    return sidePins.map((pin, idx) => {
      const caps = pin.capabilities || []

      const capCells = orderedCaps.map(cap => (
        <td key={cap} className="po-cap-td">
          {caps.includes(cap) && (
            <span className="po-cap-pill" style={{ background: capColor(cap) }} title={cap} />
          )}
        </td>
      ))

      const nameCell = (
        <td key="name" className={`po-name-td ${isJ1 ? 'po-name-left' : 'po-name-right'}`}>
          {pin.name}
        </td>
      )
      const physCell = <td key="phys" className="po-phys-td">{pin.physical}</td>

      return (
        <tr
          key={pin.id}
          className="po-row"
          draggable
          onDragStart={() => { dragIdxRef.current = idx; dragSideRef.current = side }}
          onDragEnter={() => {
            if (dragSideRef.current !== side || dragIdxRef.current === idx) return
            reorder(side, dragIdxRef.current, idx)
            dragIdxRef.current = idx
          }}
          onDragEnd={() => { dragIdxRef.current = null; dragSideRef.current = null }}
          onDragOver={e => e.preventDefault()}
        >
          {isJ1 ? [...capCells, nameCell, physCell] : [physCell, nameCell, ...capCells]}
        </tr>
      )
    })
  }

  const hasJ2 = j2.length > 0

  return (
    <div className="po-wrap">
      {/* J1 — left header */}
      <div className="po-side">
        <div className="po-side-lbl">J1</div>
        <table className="po-table">
          <thead>
            <tr>
              {capHeaders(true)}
              <th className="po-name-th">Pin</th>
              <th className="po-phys-th">#</th>
            </tr>
          </thead>
          <tbody>{renderRows(j1, true)}</tbody>
        </table>
      </div>

      {/* Chip body */}
      {hasJ2 && (
        <div className="po-chip">
          <div className="po-chip-inner">
            <span className="po-chip-dot" />
            <span className="po-chip-txt">MCU</span>
          </div>
        </div>
      )}

      {/* J2 — right header */}
      {hasJ2 && (
        <div className="po-side">
          <div className="po-side-lbl">J2</div>
          <table className="po-table">
            <thead>
              <tr>
                <th className="po-phys-th">#</th>
                <th className="po-name-th">Pin</th>
                {capHeaders(false)}
              </tr>
            </thead>
            <tbody>{renderRows([...j2].reverse(), false)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
