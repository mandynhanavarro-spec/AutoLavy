import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { BrowserMultiFormatReader } from '@zxing/browser'

// Leitor de código de barras via câmera. Fecha a própria câmera a cada
// leitura (decodeFromVideoDevice só entrega 1 resultado por chamada) --
// quem usa decide se reabre pra ler de novo ou fecha o modal.
export default function BarcodeScannerModal({ onDetect, onClose }) {
  const videoRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let controls
    const codeReader = new BrowserMultiFormatReader()
    codeReader.decodeFromVideoDevice(undefined, videoRef.current, (result, err, ctrl) => {
      controls = ctrl
      if (result) {
        onDetect(result.getText())
        ctrl.stop()
      }
    }).catch(() => setError('Não foi possível acessar a câmera'))

    return () => { if (controls) controls.stop() }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col
      items-center justify-center p-4">
      <button onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full
          bg-white/20 flex items-center justify-center">
        <X size={18} className="text-white" />
      </button>
      {error ? (
        <p className="text-white text-sm">{error}</p>
      ) : (
        <video ref={videoRef} className="w-full max-w-sm rounded-xl" />
      )}
      <p className="text-white/70 text-xs mt-4">
        Aponte a câmera para o código de barras
      </p>
    </div>
  )
}
