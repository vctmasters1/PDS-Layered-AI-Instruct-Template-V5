/**
 * buildBoardJson.js
 * Pure function: converts React board state + pins array → JSON schema object.
 * Produces both legacy keys (id/name) and new keys (boardId/boardAlias) for compatibility.
 */

export function buildBoardJson(board, pins) {
  const usbPorts = buildUsbPorts(board)

  const data = {
    id: board.boardId,
    name: board.boardAlias,
    boardId: board.boardId,
    boardAlias: board.boardAlias,
    mcuTarget: board.processor || undefined,
    website: board.website || undefined,
    sku: board.sku || undefined,
    description: board.description || undefined,
    architecture: board.architecture || undefined,
    cores: parseInt(board.cores) || undefined,
    frequency_mhz: parseInt(board.frequency) || undefined,
    ram_kb: parseInt(board.ramKb) || undefined,
    flash_kb: parseInt(board.flashKb) || undefined,
    gpio_total: parseInt(board.gpioTotal) || undefined,
    adc_channels: parseInt(board.adcChannels) || undefined,
    pwm_channels: parseInt(board.pwmChannels) || undefined,
    wifi: board.wifi || undefined,
    ble: board.ble || undefined,
    supported_interfaces: board.commInterfaces.length > 0 ? board.commInterfaces : undefined,
    usb_ports: usbPorts,
    system_features: board.systemFeatures.length > 0 ? board.systemFeatures : undefined,
    toolchain: board.toolchain || undefined,
    notes: board.notes || undefined,
    pin_capabilities: pins.map((p, idx) => {
      const pinObj = {
        pin:          typeof p.pin === 'number' ? p.pin : resolvePinNumber(p.name, idx),
        header_id:    p.headerId || 'J1',
        physical_pin: p.physical || String(idx + 1),
        name:         p.name     || `GPIO ${idx}`,
        capabilities: p.capabilities,
      }
      if (p.group)    pinObj.group     = p.group
      if (p.varAlias) pinObj.var_alias = p.varAlias
      return pinObj
    }),
  }

  // Strip undefined values for clean JSON output
  return stripUndefined(data)
}

/**
 * Derive the pin number from the pin name:
 * - "GPIO20" → 20, "GPIO0" → 0, etc.
 * - Power/ground pins (no GPIO prefix) → -1
 */
function resolvePinNumber(name, fallbackIdx) {
  if (!name) return fallbackIdx
  const m = name.match(/^GPIO(\d+)$/i)
  return m ? parseInt(m[1], 10) : -1
}

function buildUsbPorts(board) {
  const u = {}
  if (parseInt(board.usb1) > 0) u.usb1 = parseInt(board.usb1)
  if (parseInt(board.usb2) > 0) u.usb2 = parseInt(board.usb2)
  if (parseInt(board.usb3) > 0) u.usb3 = parseInt(board.usb3)
  if (parseInt(board.usb4) > 0) u.usb4 = parseInt(board.usb4)
  return Object.keys(u).length > 0 ? u : undefined
}

function stripUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  )
}
