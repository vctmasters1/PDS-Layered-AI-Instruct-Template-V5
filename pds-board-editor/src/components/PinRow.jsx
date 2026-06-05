const ALL_CAPABILITIES = [
  'VIN', 'GND', '3V3', '5V', 'RESET', 'BOOT', 'STRAPPING',
  'GPIO', 'ADC-1', 'ADC-2', 'PWM', 'INTERRUPT',
  'UART-RX', 'UART-TX',
  'SPI-MISO', 'SPI-MOSI', 'SPI-SCK',
  'I2C-SDA', 'I2C-SCL',
  'CAN', 'RMT',
]

export default function PinRow({ pin, onUpdate, onDelete, onToggleCap, onDragStart, onDragEnter, onDragEnd }) {
  return (
    <div
      className="pin-row"
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
    >
      {/* Header ID */}
      <input
        className="pin-header"
        type="text"
        value={pin.headerId}
        onChange={e => onUpdate(pin.id, 'headerId', e.target.value)}
        title="Header ID (e.g. J1, J2)"
        placeholder="J1"
      />

      {/* Physical pin number */}
      <input
        className="pin-physical"
        type="text"
        value={pin.physical}
        onChange={e => onUpdate(pin.id, 'physical', e.target.value)}
        title="Physical pin number on PCB"
        placeholder="1"
      />

      {/* GPIO number */}
      <input
        className="pin-gpio"
        type="number"
        value={pin.pin ?? ''}
        onChange={e => onUpdate(pin.id, 'pin', e.target.value === '' ? -1 : parseInt(e.target.value, 10))}
        title="GPIO number (-1 for power/GND)"
        placeholder="-1"
      />

      {/* Group */}
      <select
        className="pin-group"
        value={pin.group || ''}
        onChange={e => onUpdate(pin.id, 'group', e.target.value)}
        title="Pin group"
      >
        <option value="">— group —</option>
        <option value="Power">Power</option>
        <option value="GPIO">GPIO</option>
        <option value="UART">UART</option>
        <option value="I2C">I2C</option>
        <option value="SPI">SPI</option>
        <option value="Special">Special</option>
      </select>

      {/* var_alias */}
      <input
        className="pin-var-alias"
        type="text"
        value={pin.varAlias || ''}
        onChange={e => onUpdate(pin.id, 'varAlias', e.target.value)}
        title="snake_case variable alias (e.g. gpio_4, i2c_sda)"
        placeholder="gpio_0"
      />

      {/* Pin name / label */}
      <input
        className="pin-label"
        type="text"
        value={pin.name}
        onChange={e => onUpdate(pin.id, 'name', e.target.value)}
        title="Pin name"
        placeholder="GPIO 0"
      />

      {/* Capability buttons */}
      <div className="capability-buttons">
        {ALL_CAPABILITIES.map(cap => (
          <button
            key={cap}
            type="button"
            className={`capability-btn ${cap}${pin.capabilities.includes(cap) ? ' active' : ''}`}
            onClick={() => onToggleCap(pin.id, cap)}
            title={cap}
          >
            {cap}
          </button>
        ))}
      </div>

      {/* Delete */}
      <button
        type="button"
        className="delete-pin-btn"
        onClick={() => onDelete(pin.id)}
        title="Delete this pin row"
      >
        ✕
      </button>

      {/* Drag handle */}
      <span className="drag-handle" title="Drag to reorder">⋮⋮</span>
    </div>
  )
}
