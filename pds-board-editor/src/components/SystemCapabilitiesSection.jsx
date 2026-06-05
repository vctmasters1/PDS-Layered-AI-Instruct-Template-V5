const COMM_INTERFACES = [
  { id: 'i2c',  label: 'I2C',   icon: '🔵' },
  { id: 'spi',  label: 'SPI',   icon: '🟣' },
  { id: 'uart', label: 'UART',  icon: '🟢' },
  { id: 'can',  label: 'CAN',   icon: '🔶' },
  { id: 'i2s',  label: 'I2S',   icon: '🎵' },
  { id: 'usb',  label: 'USB',   icon: '🔌' },
  { id: 'sdio', label: 'SDIO',  icon: '💾' },
]

const SYSTEM_FEATURES = [
  { id: 'ethernet',  label: 'Ethernet',     icon: '🌐' },
  { id: 'sdcard',    label: 'SD Card',      icon: '💾' },
  { id: 'rtc',       label: 'RTC',          icon: '🕐' },
  { id: 'camera',    label: 'Camera',       icon: '📷' },
  { id: 'lcd',       label: 'LCD/TFT',      icon: '🖥️' },
  { id: 'lipo',      label: 'LiPo Charger', icon: '🔋' },
  { id: 'jtag',      label: 'JTAG',         icon: '🔧' },
  { id: 'psram',     label: 'PSRAM',        icon: '🧠' },
  { id: 'qspi',      label: 'QSPI Flash',   icon: '⚡' },
  { id: 'rgb',       label: 'RGB LED',      icon: '💡' },
  { id: 'button',    label: 'Button(s)',     icon: '🔘' },
  { id: 'oled',      label: 'OLED',         icon: '📺' },
]

function ToggleButton({ active, label, icon, onClick }) {
  return (
    <button
      type="button"
      className={`feature-toggle-btn${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span className="toggle-icon" />
      {icon} {label}
    </button>
  )
}

export default function SystemCapabilitiesSection({ board, setField }) {
  function toggleInterface(id) {
    const current = board.commInterfaces
    setField('commInterfaces', current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  }

  function toggleFeature(id) {
    const current = board.systemFeatures
    setField('systemFeatures', current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  }

  return (
    <div className="form-section" style={{ borderLeftColor: '#17a2b8' }}>
      <h2>🔌 System Capabilities</h2>

      <div className="form-group">
        <label>Communication Interfaces</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {COMM_INTERFACES.map(iface => (
            <ToggleButton
              key={iface.id}
              active={board.commInterfaces.includes(iface.id)}
              label={iface.label}
              icon={iface.icon}
              onClick={() => toggleInterface(iface.id)}
            />
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>USB Ports <small style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(count per type)</small></label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
          {['usb1', 'usb2', 'usb3', 'usb4'].map((key, i) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', minWidth: 70 }}>
              <label style={{ fontSize: '0.8em', marginBottom: 0 }}>USB {i + 1}</label>
              <input
                type="number"
                min="0"
                max="99"
                value={board[key]}
                onChange={e => setField(key, e.target.value)}
                style={{ width: 70, textAlign: 'center' }}
                placeholder="0"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>System Features / On-board Peripherals</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {SYSTEM_FEATURES.map(feat => (
            <ToggleButton
              key={feat.id}
              active={board.systemFeatures.includes(feat.id)}
              label={feat.label}
              icon={feat.icon}
              onClick={() => toggleFeature(feat.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
