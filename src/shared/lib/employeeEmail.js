/**
 * Formato oficial do e-mail fictício usado como login de funcionários no
 * Supabase Auth: <login-normalizado>@<slug-da-org>.local
 *
 * - O domínio usa o SLUG da organização (sempre único -- já carrega um
 *   sufixo gerado quando há conflito de nome), não o nome da loja. Até
 *   outubro/2026 o domínio vinha do nome da loja + .com, o que causava
 *   dois problemas reais: (1) colisão -- duas lojas com o mesmo nome
 *   geravam o mesmo e-mail para funcionários homônimos; (2) e-mails de
 *   sistema (ex.: reset de senha) podiam ir parar na caixa de um
 *   estranho dono do domínio real (isac.com, fernando.com, etc.).
 * - O TLD .local é reservado para uso especial (RFC 6762 / registro
 *   IANA de domínios especiais) e nunca é roteável/entregue na internet
 *   pública, mesmo que outra empresa registre o mesmo nome em .com.
 *   Confirmado empiricamente que o Supabase Auth aceita esse formato em
 *   auth.admin.createUser (sonda de QA, ver relatório da tarefa).
 *
 * Mesma fórmula usada em supabase/functions/create-employee/index.ts --
 * se mudar aqui, mude lá também (Edge Functions rodam em Deno, fora do
 * bundle do frontend, então não dá pra importar este arquivo direto).
 *
 * Este preview cobre o caso normal (sem colisão de login dentro da
 * mesma org). Se dois funcionários da mesma loja escolherem o mesmo
 * login, a edge function resolve a colisão sozinha (ana -> ana2 ->
 * ana3 ...) e devolve o e-mail final de verdade em `data.email` -- é
 * esse valor, nunca o preview, que deve ser salvo/copiado/exibido após
 * a criação ter de fato acontecido.
 */

export function normalizeForEmail(value) {
  return (value || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function previewEmployeeEmail(login, orgSlug) {
  const local = normalizeForEmail(login) || 'usuario'
  const domain = orgSlug || 'empresa'
  return `${local}@${domain}.local`
}
