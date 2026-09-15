import WhiteLabelSection from '../../../../shared/components/WhiteLabelSection'

export default function Configuracoes() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* ════ Marca / White Label ════ */}
      {/* So aparece se a organizacao tiver a feature white_label no plano
          (checagem dentro do proprio componente). O restante desta tela
          de configuracoes do modulo Beleza ainda nao foi implementado. */}
      <WhiteLabelSection />

      <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm text-center space-y-3">
        <p className="text-3xl">⚙️</p>
        <h1 className="text-xl font-black text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-500">Esta funcionalidade estará disponível em breve.</p>
      </div>
    </div>
  )
}
