// Fonte unica da marca mostrada ao cliente por vertical (product_id).
// Usado em qualquer tela compartilhada entre verticais -- login,
// bloqueio por inadimplencia, placeholder de vertical em construcao --
// pra nunca vazar "AutoLavy" ou o nome interno (loja/servico/beleza)
// pro usuario final.
export const VERTICAL_BRAND = {
  loja:    { name: 'Meu Caixa',   logo: '/Meu_Caixa_Logo.png' },
  servico: { name: 'Meu Serviço', logo: null },
  beleza:  { name: 'Meu Studio',  logo: null },
}

export function getVerticalBrand(productId) {
  return VERTICAL_BRAND[productId] || VERTICAL_BRAND.loja
}
