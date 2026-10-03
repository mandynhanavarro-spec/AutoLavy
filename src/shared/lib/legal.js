// Fonte única de verdade das versões vigentes dos documentos legais.
// Trocar aqui (ex.: TERMS_VERSION = '1.1') é o que dispara, pro
// dono/admin da loja, o modal bloqueante de "Atualizamos nossos
// Termos" -- ver App.jsx. Precisa existir um arquivo .md
// correspondente em public/legal/ pra nova versão (termos-v1.1.md).
export const TERMS_VERSION = '1.0'
export const PRIVACY_VERSION = '1.0'

export const TERMS_PATH = `/legal/termos-v${TERMS_VERSION}.md`
export const PRIVACY_PATH = `/legal/privacidade-v${PRIVACY_VERSION}.md`
