import { useEffect, useRef, useState } from 'react'
import { X, Flashlight, FlashlightOff, Keyboard } from 'lucide-react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'

// Só os formatos de varejo: menos formatos = menos trabalho por quadro =
// leitura mais rápida (o padrão do zxing tenta todos).
const FORMATS = [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
]

// Câmera traseira, 1280 de largura (meio-termo entre nitidez pra código
// pequeno e custo por quadro no celular) e foco contínuo onde houver.
const CONSTRAINTS = {
  video: {
    facingMode: { ideal: 'environment' },
    width:  { ideal: 1280 },
    height: { ideal: 720 },
    advanced: [{ focusMode: 'continuous' }],
  },
}

const SCAN_INTERVAL_MS = 100   // padrão do zxing é 500 ms entre tentativas
const PAUSE_AFTER_READ_MS = 1500
const SAME_CODE_IGNORE_MS = 2000
const HINT_1_MS = 4000
const HINT_2_MS = 8000
const MANUAL_MS = 10000

function beep(ctxRef, ok) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    if (!ctxRef.current) ctxRef.current = new AC()
    const ctx = ctxRef.current
    if (ctx.state === 'suspended') ctx.resume()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = ok ? 1200 : 300
    gain.gain.value = 0.15
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.3))
  } catch { /* sem áudio: segue só com o visual */ }
}

function vibrate(ok) {
  try { navigator.vibrate?.(ok ? 80 : [60, 60, 60]) } catch { /* iPhone não vibra */ }
}

/**
 * Leitor de código de barras via câmera.
 *
 * onDetect(code) é chamado a cada leitura (ou código digitado). Pode
 * devolver { ok, message, close }:
 *   - ok: false  -> bip de erro e a mensagem; o leitor continua aberto;
 *   - close: true -> o leitor para (quem chamou vai fechar o modal);
 *   - nada       -> leitura aceita.
 * continuous: mantém a câmera aberta após cada leitura aceita ("vender
 * bipando"), com pausa de ~1,5 s e ignorando o mesmo código por ~2 s. Sem
 * continuous, para na primeira leitura aceita (quem chamou fecha o modal).
 */
export default function BarcodeScannerModal({ onDetect, onClose, continuous = false }) {
  const videoRef     = useRef(null)
  const controlsRef  = useRef(null)
  const audioRef     = useRef(null)
  const pausedUntil  = useRef(0)
  const lastRead     = useRef({ code: null, at: 0 })
  const stoppedRef   = useRef(false)
  const onDetectRef  = useRef(onDetect)
  onDetectRef.current = onDetect

  const [error, setError]           = useState('')
  const [startedAt, setStartedAt]   = useState(null)
  const [now, setNow]               = useState(Date.now())
  const [feedback, setFeedback]     = useState(null)  // { code, ok, message }
  const [torchOk, setTorchOk]       = useState(false)
  const [torchOn, setTorchOn]       = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')

  function handleCode(code, fromCamera) {
    const result = onDetectRef.current?.(code) || {}
    const ok = result.ok !== false
    if (fromCamera) {
      beep(audioRef, ok)
      vibrate(ok)
    }
    setFeedback({ code, ok, message: result.message || '' })
    if (result.close || (ok && !continuous)) {
      stoppedRef.current = true
      controlsRef.current?.stop()
      return
    }
    // continua lendo: reinicia as dicas e o aviso de 10 s
    setStartedAt(Date.now())
    if (ok) setManualCode('')
  }

  useEffect(() => {
    let cancelled = false
    const hints  = new Map([[DecodeHintType.POSSIBLE_FORMATS, FORMATS]])
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: SCAN_INTERVAL_MS,
      delayBetweenScanSuccess:  SCAN_INTERVAL_MS,
    })

    reader.decodeFromConstraints(CONSTRAINTS, videoRef.current, result => {
      if (!result || stoppedRef.current) return
      const t = Date.now()
      if (t < pausedUntil.current) return
      const code = result.getText()
      if (code === lastRead.current.code && t - lastRead.current.at < SAME_CODE_IGNORE_MS) return
      lastRead.current  = { code, at: t }
      pausedUntil.current = t + PAUSE_AFTER_READ_MS
      handleCode(code, true)
    }).then(controls => {
      if (cancelled) { controls.stop(); return }
      controlsRef.current = controls
      setTorchOk(typeof controls.switchTorch === 'function')
      setStartedAt(Date.now())
    }).catch(() => {
      if (cancelled) return
      setError('Não foi possível acessar a câmera')
      setManualOpen(true)
    })

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      audioRef.current?.close?.()
    }
  }, [])

  // relógio das dicas (só enquanto procura)
  useEffect(() => {
    if (!startedAt || error) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [startedAt, error])

  // a mensagem da última leitura some sozinha (modo contínuo)
  useEffect(() => {
    if (!feedback || !continuous) return
    const t = setTimeout(() => setFeedback(null), 2500)
    return () => clearTimeout(t)
  }, [feedback, continuous])

  async function toggleTorch() {
    try {
      await controlsRef.current?.switchTorch?.(!torchOn)
      setTorchOn(v => !v)
    } catch { setTorchOk(false) }
  }

  function submitManual(e) {
    e.preventDefault()
    const code = manualCode.trim()
    if (code) handleCode(code, false)
  }

  const elapsed  = startedAt ? now - startedAt : 0
  const showSlow = !error && elapsed >= MANUAL_MS
  const hint = error ? null
    : elapsed >= HINT_2_MS ? 'Precisa de mais luz?'
    : elapsed >= HINT_1_MS ? 'Aproxime ou afaste um pouco'
    : null

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 flex flex-col
      items-center justify-center p-4">
      <button onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full
          bg-white/20 flex items-center justify-center">
        <X size={18} className="text-white" />
      </button>

      {error ? (
        <p className="text-white text-sm mb-4">{error}</p>
      ) : (
        <div className="relative w-full max-w-sm">
          <video ref={videoRef} className="w-full rounded-xl" muted playsInline />
          {/* moldura de leitura */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative w-4/5 h-2/5">
              <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg" />
              <span className="absolute left-2 right-2 top-1/2 h-0.5 bg-red-500/80 animate-pulse" />
            </div>
          </div>
          {torchOk && (
            <button
              type="button"
              onClick={toggleTorch}
              className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center"
              title={torchOn ? 'Desligar lanterna' : 'Ligar lanterna'}
            >
              {torchOn
                ? <FlashlightOff size={18} className="text-yellow-300" />
                : <Flashlight size={18} className="text-white" />}
            </button>
          )}
        </div>
      )}

      {/* status / dicas */}
      <div className="mt-4 min-h-[40px] text-center">
        {feedback ? (
          <>
            <p className={`text-sm font-black ${feedback.ok ? 'text-green-400' : 'text-amber-400'}`}>
              {feedback.code}
            </p>
            {feedback.message && (
              <p className={`text-xs mt-0.5 ${feedback.ok ? 'text-green-200' : 'text-amber-200'}`}>
                {feedback.message}
              </p>
            )}
          </>
        ) : !error && (
          <>
            <p className="text-white text-sm font-semibold">Procurando código…</p>
            <p className="text-white/70 text-xs mt-0.5">
              {hint || 'Aponte a câmera para o código de barras'}
            </p>
          </>
        )}
      </div>

      {/* digitar o código: aparece sozinho depois de ~10 s (ou sem câmera) */}
      {(manualOpen || showSlow) ? (
        <form onSubmit={submitManual} className="mt-3 w-full max-w-sm">
          {showSlow && !manualOpen && (
            <p className="text-amber-300 text-xs text-center mb-2">
              Não está conseguindo ler? Digite o código:
            </p>
          )}
          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              inputMode="numeric"
              placeholder="Código de barras"
              className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
              autoFocus={manualOpen}
            />
            <button type="submit"
              className="px-4 py-2.5 rounded-xl bg-white text-gray-900 text-sm font-bold">
              OK
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="mt-3 flex items-center gap-1.5 text-white/70 text-xs font-semibold"
        >
          <Keyboard size={14} /> Digitar código
        </button>
      )}
    </div>
  )
}
