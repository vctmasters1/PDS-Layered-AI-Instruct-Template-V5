/**
 * pinSvgGenerator.js
 * Pure function: generates a pinout SVG from pin_capabilities array.
 *
 * Layout: top-view, counterclockwise pin order.
 *   Left side  — pins top → bottom  (physical pin 1 at top-left)
 *   Right side — pins bottom → top  (continues CCW around board)
 *
 * Each pin renders colored capability pills fanning out from the chip edge.
 * Left side: pills extend LEFT  (cap[0] closest to chip)
 * Right side: pills extend RIGHT (cap[0] closest to chip)
 */

// Per-capability pill color
const CAP_COLORS = {
  VIN:       '#e74c3c',
  GND:       '#636e72',
  '3V3':     '#e17055',
  '5V':      '#e74c3c',
  RESET:     '#95a5a6',
  BOOT:      '#95a5a6',
  GPIO:      '#667eea',
  DIO:       '#667eea',
  INTERRUPT: '#8e44ad',
  ADC:       '#27ae60',
  PWM:       '#f39c12',
  UART:      '#e67e22',
  RXD:       '#d35400',
  TXD:       '#e67e22',
  SPI:       '#9b59b6',
  MISO:      '#8e44ad',
  MOSI:      '#9b59b6',
  SCK:       '#6c5ce7',
  I2C:       '#3498db',
  SDA:       '#2980b9',
  SCL:       '#74b9ff',
  CAN:       '#c0392b',
  RMT:       '#16a085',
}

function getCapColor(cap) {
  return CAP_COLORS[cap] || '#667eea'
}

// Derive a representative dot/wire color from the pin's capability list
function getPinColor(caps) {
  if (!caps || !caps.length) return '#667eea'
  // Priority: power caps first, then bus caps, then GPIO
  const priority = ['VIN','GND','3V3','5V','RESET','I2C','SDA','SCL','SPI','MISO','MOSI','SCK','UART','RXD','TXD','CAN','ADC','PWM','GPIO']
  for (const p of priority) {
    if (caps.includes(p)) return getCapColor(p)
  }
  return getCapColor(caps[0])
}

// Estimate pill width: ~3.8px per char + 8px padding, min 20px
function pillW(cap) {
  return Math.max(20, cap.length * 3.8 + 8)
}

// Total pixel width of a capability pill row
function pillRowWidth(caps) {
  if (!caps || !caps.length) return 0
  return caps.reduce((sum, c) => sum + pillW(c) + 2, 0)
}

/**
 * @param {string} boardName
 * @param {Array}  pinCapabilities  — pin_capabilities array from board JSON
 * @returns {string}  SVG markup string
 */
export function generateQuickPinoutSVG(boardName, pinCapabilities) {
  if (!pinCapabilities || pinCapabilities.length === 0) {
    return '<p style="color:#999; text-align:center; padding:20px;">Add pins to see the preview.</p>'
  }

  // ── Split pins into left / right columns ─────────────────────────────────
  const headers = {}
  pinCapabilities.forEach(pin => {
    const hid = pin.header_id || 'J1'
    if (!headers[hid]) headers[hid] = []
    headers[hid].push(pin)
  })

  const headerNames = Object.keys(headers)
  let leftPins  = []
  let rightPins = []

  if (headerNames.length === 1) {
    // Single header: split in half. First half = left (top→bottom),
    // second half = right (will be reversed for CCW).
    const all  = headers[headerNames[0]]
    const half = Math.ceil(all.length / 2)
    leftPins  = all.slice(0, half)
    rightPins = all.slice(half)
  } else {
    const leftKeys  = headerNames.filter(h => /^(LS|L|J1|P1|LEFT)/i.test(h))
    const rightKeys = headerNames.filter(h => /^(RS|R|J2|P2|RIGHT)/i.test(h))
    const remaining = headerNames.filter(h => !leftKeys.includes(h) && !rightKeys.includes(h))
    remaining.forEach((h, i) => { (i % 2 === 0 ? leftKeys : rightKeys).push(h) })
    if (leftKeys.length === 0 && rightKeys.length > 0) leftKeys.push(rightKeys.shift())
    if (rightKeys.length === 0 && leftKeys.length > 0) rightKeys.push(leftKeys.pop())
    leftKeys.forEach(k  => { if (headers[k]) leftPins  = leftPins.concat(headers[k]) })
    rightKeys.forEach(k => { if (headers[k]) rightPins = rightPins.concat(headers[k]) })
  }

  // Counterclockwise: right column renders bottom → top
  const rightPinsOrdered = [...rightPins].reverse()

  // ── Layout constants ──────────────────────────────────────────────────────
  const SPACING  = 20   // vertical px between pins
  const PILL_H   = 11   // pill height
  const PILL_GAP = 2    // gap between pills
  const PILL_FS  = 5.5  // pill font size
  const NAME_W   = 72   // fixed width for pin name pill
  const WIRE_LEN = 8    // wire from chip edge to pin dot
  const PIN_R    = 4    // pin dot radius
  const CHIP_W   = 44
  const MARGIN   = 16
  const TITLE_H  = 24

  // Dynamic label width: name pill (fixed) + cap pills + phys number
  const maxLabelW = (pins) => pins.reduce((max, p) => {
    const caps = p.capabilities && p.capabilities.length ? p.capabilities : ['GPIO']
    return Math.max(max, NAME_W + PILL_GAP + pillRowWidth(caps) + 28)
  }, 100)

  const labelWidth = Math.max(maxLabelW(leftPins), maxLabelW(rightPinsOrdered), 100)
  const maxSide    = Math.max(leftPins.length, rightPinsOrdered.length, 1)

  const svgW    = labelWidth * 2 + CHIP_W + MARGIN * 2
  const svgH    = maxSide * SPACING + MARGIN * 2 + TITLE_H
  const chipX   = MARGIN + labelWidth
  const chipTop = TITLE_H + MARGIN
  const chipH   = maxSide * SPACING + 4

  // ── Helper: render a row of capability pills ──────────────────────────────
  // dir=1 (right, for right-side pins), dir=-1 (left, for left-side pins)
  // Returns { svg, endX } where endX is the far edge of the pill row.
  function renderPills(caps, startX, y, dir) {
    let svg = ''
    let x   = startX
    // For left side (dir=-1) render caps reversed so cap[0] sits closest to chip
    const ordered = dir === 1 ? caps : [...caps].reverse()
    for (const cap of ordered) {
      const w  = pillW(cap)
      const rx = dir === 1 ? x : x - w
      const color = getCapColor(cap)
      svg += `<rect x="${rx}" y="${y - PILL_H / 2}" width="${w}" height="${PILL_H}" rx="3" fill="${color}" opacity="0.9"/>`
      svg += `<text x="${rx + w / 2}" y="${y + 2}" text-anchor="middle" font-size="${PILL_FS}" font-weight="600" fill="white">${cap}</text>`
      x += dir * (w + PILL_GAP)
    }
    return { svg, endX: x }
  }

  // ── Draw chip body ────────────────────────────────────────────────────────
  let svgContent = ''
  svgContent += `<rect x="${chipX}" y="${chipTop}" width="${CHIP_W}" height="${chipH}" rx="5" fill="#2d2d44" stroke="#667eea" stroke-width="1.5"/>`
  // Orientation notch
  svgContent += `<circle cx="${chipX + CHIP_W / 2}" cy="${chipTop}" r="4" fill="#1e1e2e" stroke="#667eea" stroke-width="0.8"/>`
  // TOP label
  svgContent += `<text x="${chipX + CHIP_W / 2}" y="${chipTop + 15}" text-anchor="middle" font-size="7" font-weight="bold" fill="#667eea" opacity="0.65">TOP</text>`

  // ── Left pins (top → bottom) ──────────────────────────────────────────────
  // ── Left pins (top → bottom) ──────────────────────────────────────────────
  leftPins.forEach((pin, i) => {
    const y      = chipTop + 6 + i * SPACING
    const dotX   = chipX - WIRE_LEN
    const caps   = pin.capabilities && pin.capabilities.length ? pin.capabilities : ['GPIO']
    const gColor = getPinColor(caps)
    const phys   = String(pin.physical_pin ?? '')
    const label  = pin.name || `GPIO ${pin.pin}`

    svgContent += `<line x1="${dotX}" y1="${y}" x2="${chipX}" y2="${y}" stroke="${gColor}" stroke-width="1.5"/>`
    svgContent += `<circle cx="${dotX}" cy="${y}" r="${PIN_R}" fill="${gColor}" stroke="#222" stroke-width="0.5"/>`
    // Name pill: fixed width, white bg, colored border+text, closest to chip
    const namePillX = dotX - PIN_R - PILL_GAP - NAME_W
    svgContent += `<rect x="${namePillX}" y="${y - PILL_H / 2}" width="${NAME_W}" height="${PILL_H}" rx="3" fill="white" stroke="${gColor}" stroke-width="1"/>`
    svgContent += `<text x="${namePillX + NAME_W / 2}" y="${y + 2}" text-anchor="middle" font-size="${PILL_FS}" font-weight="bold" fill="${gColor}">${label}</text>`
    // Capability pills fan LEFT beyond the name pill
    const { svg: pills, endX } = renderPills(caps, namePillX - PILL_GAP, y, -1)
    svgContent += pills
    // Physical pin number at far left
    svgContent += `<text x="${endX - 3}" y="${y + 2}" text-anchor="end" font-size="5" fill="#aaa">${phys}</text>`
  })

  // ── Right pins (bottom → top = CCW) ──────────────────────────────────────
  rightPinsOrdered.forEach((pin, i) => {
    const y      = chipTop + 6 + i * SPACING
    const dotX   = chipX + CHIP_W + WIRE_LEN
    const caps   = pin.capabilities && pin.capabilities.length ? pin.capabilities : ['GPIO']
    const gColor = getPinColor(caps)
    const phys   = String(pin.physical_pin ?? '')
    const label  = pin.name || `GPIO ${pin.pin}`

    svgContent += `<line x1="${chipX + CHIP_W}" y1="${y}" x2="${dotX}" y2="${y}" stroke="${gColor}" stroke-width="1.5"/>`
    svgContent += `<circle cx="${dotX}" cy="${y}" r="${PIN_R}" fill="${gColor}" stroke="#222" stroke-width="0.5"/>`
    // Name pill: fixed width, white bg, colored border+text, closest to chip
    const namePillX = dotX + PIN_R + PILL_GAP
    svgContent += `<rect x="${namePillX}" y="${y - PILL_H / 2}" width="${NAME_W}" height="${PILL_H}" rx="3" fill="white" stroke="${gColor}" stroke-width="1"/>`
    svgContent += `<text x="${namePillX + NAME_W / 2}" y="${y + 2}" text-anchor="middle" font-size="${PILL_FS}" font-weight="bold" fill="${gColor}">${label}</text>`
    // Capability pills fan RIGHT beyond the name pill
    const { svg: pills, endX } = renderPills(caps, namePillX + NAME_W + PILL_GAP, y, 1)
    svgContent += pills
    // Physical pin number at far right
    svgContent += `<text x="${endX + 3}" y="${y + 2}" text-anchor="start" font-size="5" fill="#aaa">${phys}</text>`
  })

  // ── Board title ───────────────────────────────────────────────────────────
  const title = `<text x="${svgW / 2}" y="${TITLE_H - 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="#667eea">${boardName || 'Board'}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" style="width:100%;height:auto;">
  <rect width="100%" height="100%" fill="#f9f9f9"/>
  ${title}
  ${svgContent}
</svg>`
}
