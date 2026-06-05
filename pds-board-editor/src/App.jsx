import { useState, useCallback, useEffect, useMemo } from 'react'
import { buildBoardJson } from './utils/buildBoardJson'
import { generateBoardPrompt, generateSanityCheckPrompt } from './utils/promptGenerator'
import EditExistingSection from './components/EditExistingSection'
import AskCopilotSection from './components/AskCopilotSection'
import ImportJsonSection from './components/ImportJsonSection'
import BoardBasicsSection from './components/BoardBasicsSection'
import CpuSpecsSection from './components/CpuSpecsSection'
import SystemCapabilitiesSection from './components/SystemCapabilitiesSection'
import PinMatrixSection from './components/PinMatrixSection'
import JsonPreviewSection from './components/JsonPreviewSection'
import ActionButtons from './components/ActionButtons'

// ── Initial state ─────────────────────────────────────────────────────────────

const INITIAL_BOARD = {
  boardId: '', processor: '', boardAlias: '',
  website: '', sku: '', description: '',
  architecture: '', cores: '', frequency: '',
  ramKb: '', flashKb: '', gpioTotal: '',
  wifi: '', ble: '',
  adcChannels: '', pwmChannels: '',
  commInterfaces: [],
  systemFeatures: [],
  usb1: '', usb2: '', usb3: '', usb4: '',
  toolchain: '', notes: '',
}

function makeEmptyPin(idx) {
  return {
    id: `pin-${Date.now()}-${idx}`,
    pin: idx,
    headerId: 'J1',
    physical: String(idx + 1),
    group: 'GPIO',
    varAlias: `gpio_${idx}`,
    name: `GPIO${idx}`,
    capabilities: ['GPIO'],
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [board, setBoard]               = useState(INITIAL_BOARD)
  const [pins, setPins]                 = useState([])
  const [pasteJson, setPasteJson]       = useState('')
  const [copilotStatus, setCopilotStatus] = useState('idle') // idle | loading | success | error | copied | copy-failed
  const [copilotError, setCopilotError]   = useState('')
  const [savedBoards, setSavedBoards]     = useState([])
  const [sanityStatus, setSanityStatus]   = useState('idle') // idle | loading | done | error
  const [sanityResult, setSanityResult]   = useState('')

  // Derived: full board JSON object
  const boardJson = useMemo(() => buildBoardJson(board, pins), [board, pins])

  // ── Field updater ─────────────────────────────────────────────────────────
  const setField = useCallback((field, value) => {
    setBoard(prev => ({ ...prev, [field]: value }))
  }, [])

  // ── VS Code message handler ───────────────────────────────────────────────
  useEffect(() => {
    function onMessage(event) {
      const msg = event.data
      if (!msg?.command) return

      switch (msg.command) {
        case 'boardLoaded':
          if (msg.data) importBoardData(msg.data)
          break
        case 'boardList':
          setSavedBoards(msg.platforms || [])
          break
        case 'copilotResult':
          if (msg.data) {
            importBoardData(msg.data)
            setPasteJson(JSON.stringify(msg.data, null, 2))
          }
          setCopilotStatus('success')
          break
        case 'copilotError':
          setCopilotStatus('error')
          setCopilotError(msg.error || 'Copilot request failed')
          break
        case 'sanityCheckResult':
          setSanityResult(msg.text || '')
          setSanityStatus('done')
          break
        case 'sanityCheckError':
          setSanityResult(msg.error || 'Sanity check failed')
          setSanityStatus('error')
          break
        default:
          break
      }
    }

    window.addEventListener('message', onMessage)

    // Request board list on mount (VS Code only)
    if (window.__isVSCodeWebview) {
      window.__vscodeApi?.postMessage({ command: 'listBoards' })
    }

    return () => window.removeEventListener('message', onMessage)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Import board data ─────────────────────────────────────────────────────
  function importBoardData(data) {
    setBoard({
      boardId:       data.boardId   || data.id   || '',
      processor:     data.mcuTarget || data.processor || '',
      boardAlias:    data.boardAlias || data.name  || '',
      website:       data.website   || '',
      sku:           data.sku       || '',
      description:   data.description || '',
      architecture:  data.architecture || '',
      cores:         String(data.cores          ?? ''),
      frequency:     String(data.frequency_mhz  ?? ''),
      ramKb:         String(data.ram_kb         ?? ''),
      flashKb:       String(data.flash_kb       ?? ''),
      gpioTotal:     String(data.gpio_total     ?? ''),
      wifi:          data.wifi || '',
      ble:           data.ble  || '',
      adcChannels:   String(data.adc_channels   ?? ''),
      pwmChannels:   String(data.pwm_channels   ?? ''),
      commInterfaces: Array.isArray(data.supported_interfaces) ? data.supported_interfaces : [],
      systemFeatures: Array.isArray(data.system_features)      ? data.system_features      : [],
      usb1: String(data.usb_ports?.usb1 ?? ''),
      usb2: String(data.usb_ports?.usb2 ?? ''),
      usb3: String(data.usb_ports?.usb3 ?? ''),
      usb4: String(data.usb_ports?.usb4 ?? ''),
      toolchain: data.toolchain || '',
      notes:     data.notes     || '',
    })

    if (Array.isArray(data.pin_capabilities) && data.pin_capabilities.length > 0) {
      setPins(data.pin_capabilities.map((p, idx) => ({
        id:          `pin-imported-${Date.now()}-${idx}`,
        pin:         typeof p.pin === 'number' ? p.pin : -1,
        headerId:    p.header_id   || 'J1',
        physical:    String(p.physical_pin ?? idx + 1),
        group:       p.group       || '',
        varAlias:    p.var_alias   || '',
        name:        p.name        || `GPIO ${idx}`,
        capabilities: Array.isArray(p.capabilities) ? p.capabilities : [],
      })))
    }
  }

  // ── Sanity Check ─────────────────────────────────────────────────────────
  function handleSanityCheck() {
    const prompt = generateSanityCheckPrompt(boardJson)
    const api    = window.__vscodeApi
    if (api) {
      setSanityStatus('loading')
      setSanityResult('')
      api.postMessage({ command: 'sanityCheck', prompt })
    } else {
      navigator.clipboard.writeText(prompt)
        .then(()  => { setSanityStatus('done'); setSanityResult('Prompt copied to clipboard — paste into Copilot/ChatGPT.') })
        .catch(() => { setSanityStatus('error'); setSanityResult('Could not copy prompt to clipboard.') })
    }
  }

  // ── Save / download ───────────────────────────────────────────────────────
  function handleSave() {
    const api = window.__vscodeApi
    if (api) {
      api.postMessage({
        command: 'saveBoard',
        data: boardJson,
        filename: (boardJson.id || 'board') + '.json',
      })
    } else {
      const blob = new Blob([JSON.stringify(boardJson, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = (boardJson.id || 'board') + '.json'
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  // ── Import JSON ───────────────────────────────────────────────────────────
  function handleImportJson() {
    try {
      const data = JSON.parse(pasteJson)
      importBoardData(data)
      alert('✅ JSON imported successfully!')
    } catch (e) {
      alert(`❌ Invalid JSON:\n\n${e.message}`)
    }
  }

  // ── Ask Copilot ───────────────────────────────────────────────────────────
  function handleAskCopilot(boardName) {
    const prompt = generateBoardPrompt(boardName)
    const api    = window.__vscodeApi

    if (api) {
      setCopilotStatus('loading')
      api.postMessage({ command: 'askCopilot', prompt })
    } else {
      navigator.clipboard.writeText(prompt)
        .then(()  => setCopilotStatus('copied'))
        .catch(() => setCopilotStatus('copy-failed'))
    }
  }

  // ── Pin matrix handlers ───────────────────────────────────────────────────
  function handleGeneratePins(count) {
    setPins(Array.from({ length: count }, (_, i) => makeEmptyPin(i)))
  }

  function handleAddPin() {
    setPins(prev => [...prev, makeEmptyPin(prev.length)])
  }

  function handleUpdatePin(id, field, value) {
    setPins(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  function handleDeletePin(id) {
    setPins(prev => prev.filter(p => p.id !== id))
  }

  function handleToggleCapability(id, cap) {
    setPins(prev => prev.map(p => {
      if (p.id !== id) return p
      const caps = p.capabilities.includes(cap)
        ? p.capabilities.filter(c => c !== cap)
        : [...p.capabilities, cap]
      return { ...p, capabilities: caps }
    }))
  }

  // ── Misc ──────────────────────────────────────────────────────────────────
  function handleClearForm() {
    if (!confirm('Clear all fields and pin rows? This cannot be undone.')) return
    setBoard(INITIAL_BOARD)
    setPins([])
    setPasteJson('')
    setCopilotStatus('idle')
    setCopilotError('')
  }

  function handleRefreshBoardList() {
    window.__vscodeApi?.postMessage({ command: 'listBoards' })
  }

  function handleLoadBoard(boardId) {
    window.__vscodeApi?.postMessage({ command: 'loadBoardByName', boardId })
  }

  function handleOpenPinoutLeaf() {
    try { sessionStorage.setItem('boardData', JSON.stringify(boardJson)) } catch {}
    window.open('pinout-leaf-generator.html', '_blank')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="container">
      <div className="header">
        <h1>⚡ Pinleaf Forge</h1>
        <p>Board Specification Editor</p>
      </div>

      <div className="content">
        {/* About section */}
        <div className="note" style={{ background: 'linear-gradient(135deg, #e7f3ff 0%, #f0f8ff 100%)', borderLeft: '4px solid #667eea', padding: 20, marginBottom: 25 }}>
          <h3 style={{ marginBottom: 10, color: '#667eea', fontSize: '1.1em' }}>🚀 What is Pinleaf Forge?</h3>
          <p style={{ lineHeight: 1.6 }}>
            <strong>Pinleaf Forge</strong> is an open-source, web-based editor for defining and visualizing
            microcontroller/processor board specifications. Built for embedded developers, it combines
            AI-assisted data population, a visual pin capability matrix, and structured JSON export.
          </p>
        </div>

        <div className="note">
          <strong>Board Spec vs hwrev vs Role:</strong><br />
          <strong>Board Spec</strong> = Hardware board definition (MCU target, pinout, pin capabilities)<br />
          <strong>hwrev</strong> = A specific hardware revision of your device, references a board spec<br />
          <strong>Role</strong> = Automation behavior (what the device does — defined in the Role Editor)
        </div>

        <EditExistingSection
          savedBoards={savedBoards}
          onRefresh={handleRefreshBoardList}
          onLoad={handleLoadBoard}
        />

        <AskCopilotSection
          status={copilotStatus}
          error={copilotError}
          onAsk={handleAskCopilot}
          onStatusReset={() => setCopilotStatus('idle')}
        />

        <ImportJsonSection
          value={pasteJson}
          onChange={setPasteJson}
          onImport={handleImportJson}
        />

        <BoardBasicsSection board={board} setField={setField} />

        <CpuSpecsSection board={board} setField={setField} />

        <SystemCapabilitiesSection board={board} setField={setField} />

        <PinMatrixSection
          pins={pins}
          onGenerate={handleGeneratePins}
          onAdd={handleAddPin}
          onUpdate={handleUpdatePin}
          onDelete={handleDeletePin}
          onReorder={setPins}
          onToggleCap={handleToggleCapability}
        />

        <JsonPreviewSection boardJson={boardJson} pins={pins} onReorder={setPins} />

        <ActionButtons
          onSave={handleSave}
          onClear={handleClearForm}
          onOpenPinoutLeaf={handleOpenPinoutLeaf}
          boardId={board.boardId}
          onSanityCheck={handleSanityCheck}
          sanityStatus={sanityStatus}
          sanityResult={sanityResult}
          onSanityReset={() => { setSanityStatus('idle'); setSanityResult('') }}
        />
      </div>
    </div>
  )
}
