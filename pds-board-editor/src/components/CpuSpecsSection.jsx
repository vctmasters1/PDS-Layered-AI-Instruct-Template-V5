export default function CpuSpecsSection({ board, setField }) {
  return (
    <div className="form-section" style={{ borderLeftColor: '#e67e22' }}>
      <h2>⚙️ CPU &amp; Memory Specs</h2>

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="architecture">Architecture</label>
          <input
            id="architecture"
            type="text"
            value={board.architecture}
            onChange={e => setField('architecture', e.target.value)}
            placeholder="e.g. RISC-V, Xtensa LX7, ARM Cortex-M0+"
          />
        </div>

        <div className="form-group">
          <label htmlFor="cores">CPU Cores</label>
          <input
            id="cores"
            type="number"
            min="1"
            value={board.cores}
            onChange={e => setField('cores', e.target.value)}
            placeholder="e.g. 1, 2"
          />
        </div>

        <div className="form-group">
          <label htmlFor="frequency">Clock Frequency (MHz)</label>
          <input
            id="frequency"
            type="number"
            min="1"
            value={board.frequency}
            onChange={e => setField('frequency', e.target.value)}
            placeholder="e.g. 160"
          />
        </div>

        <div className="form-group">
          <label htmlFor="ramKb">RAM (KB)</label>
          <input
            id="ramKb"
            type="number"
            min="0"
            value={board.ramKb}
            onChange={e => setField('ramKb', e.target.value)}
            placeholder="e.g. 400"
          />
        </div>

        <div className="form-group">
          <label htmlFor="flashKb">Flash (KB)</label>
          <input
            id="flashKb"
            type="number"
            min="0"
            value={board.flashKb}
            onChange={e => setField('flashKb', e.target.value)}
            placeholder="e.g. 4096"
          />
        </div>

        <div className="form-group">
          <label htmlFor="gpioTotal">Total GPIO Pins</label>
          <input
            id="gpioTotal"
            type="number"
            min="0"
            value={board.gpioTotal}
            onChange={e => setField('gpioTotal', e.target.value)}
            placeholder="e.g. 22"
          />
        </div>

        <div className="form-group">
          <label htmlFor="wifi">WiFi</label>
          <input
            id="wifi"
            type="text"
            value={board.wifi}
            onChange={e => setField('wifi', e.target.value)}
            placeholder="e.g. 802.11 b/g/n, none"
          />
        </div>

        <div className="form-group">
          <label htmlFor="ble">Bluetooth</label>
          <input
            id="ble"
            type="text"
            value={board.ble}
            onChange={e => setField('ble', e.target.value)}
            placeholder="e.g. BLE 5.0, none"
          />
        </div>

        <div className="form-group">
          <label htmlFor="adcChannels">ADC Channels</label>
          <input
            id="adcChannels"
            type="number"
            min="0"
            value={board.adcChannels}
            onChange={e => setField('adcChannels', e.target.value)}
            placeholder="e.g. 6"
          />
        </div>

        <div className="form-group">
          <label htmlFor="pwmChannels">PWM Channels</label>
          <input
            id="pwmChannels"
            type="number"
            min="0"
            value={board.pwmChannels}
            onChange={e => setField('pwmChannels', e.target.value)}
            placeholder="e.g. 6"
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="toolchain">Toolchain / SDK</label>
        <input
          id="toolchain"
          type="text"
          value={board.toolchain}
          onChange={e => setField('toolchain', e.target.value)}
          placeholder="e.g. ESP-IDF v5.x, Arduino, PlatformIO"
        />
      </div>

      <div className="form-group">
        <label htmlFor="notes">Notes</label>
        <textarea
          id="notes"
          rows={2}
          value={board.notes}
          onChange={e => setField('notes', e.target.value)}
          placeholder="Additional notes, errata, known limitations..."
        />
      </div>
    </div>
  )
}
