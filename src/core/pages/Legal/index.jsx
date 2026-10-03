import { useEffect, useState } from 'react'
import MarkdownView from '../../../shared/components/MarkdownView'
import { TERMS_PATH, PRIVACY_PATH } from '../../../shared/lib/legal'

function LegalDocPage({ path, fallbackTitle }) {
  const [markdown, setMarkdown] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    setMarkdown(null)
    setError(false)
    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error('not found')
        return res.text()
      })
      .then((text) => { if (active) setMarkdown(text) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [path])

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 p-6 sm:p-10">
        {error && (
          <p className="text-sm text-red-600 mb-4">
            Não foi possível carregar {fallbackTitle} agora. Tente novamente mais tarde.
          </p>
        )}
        {!error && markdown === null && (
          <p className="text-sm text-gray-400">Carregando...</p>
        )}
        {!error && markdown !== null && <MarkdownView markdown={markdown} />}
        <div className="mt-8 pt-4 border-t border-gray-100">
          <a href="/login" className="text-sm text-blue-600 underline">Voltar</a>
        </div>
      </div>
    </div>
  )
}

export function TermosPage() {
  return <LegalDocPage path={TERMS_PATH} fallbackTitle="os Termos de Uso" />
}

export function PrivacidadePage() {
  return <LegalDocPage path={PRIVACY_PATH} fallbackTitle="a Política de Privacidade" />
}
