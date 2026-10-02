# Check-up Técnico — AutoLavy

**Data:** 2026-07-24
**Escopo:** projeto Supabase real **`hhnbazjwdtymlouhufue`** (status `ACTIVE_HEALTHY`), consultado ao vivo via MCP — `pg_policies`, `information_schema`, `pg_proc` (corpo real das funções), `list_migrations`, `list_edge_functions` (código realmente implantado) e `get_advisors` (security + performance). Todo achado de RLS/schema abaixo reflete o banco em produção, **não** os arquivos `.sql` do repositório — eles divergem em vários pontos, e essa divergência é, em si, um achado (ver §4). Código de front-end (`src/`) foi lido diretamente do repositório, que é a fonte que a Vercel builda.

Referência lida antes da auditoria: `docs/ARCHITECTURE.md` (convenção `org_id`, `TenantContext`, `usePermissions`, `useModules`, regra de sessionStorage).

---

## Resumo executivo

| Prioridade | Qtd. | Achados-chave |
|---|---|---|
| 🔴 Crítico | 2 | Cadastro de clientes (`/registrar`) **quebrado em produção agora** — regressão introduzida pela própria correção de segurança de `store_invites`; reset de senha do "dono" da organização quebrado (`profiles.created_at` não existe) |
| 🟠 Alto | 5 | "Modo suporte" do SuperAdmin não enxerga `product_variants`/`product_attributes`/`cash_movements`/`sale_payments` da org que está atendendo; `removeDemos()` e baixa de estoque pós-venda sem checagem de erro; gateway de pagamento com secret em texto puro no client; só 2 das dezenas de mudanças de schema aplicadas estão rastreadas como migration |
| 🟡 Médio | 6 | 14 tabelas com policies RLS duplicadas (achado quantificado pelo Performance Advisor: 254 ocorrências); 6 funções com `search_path` mutável; proteção de senha vazada desligada; app "Studio" duplicado no repo; arquivos gigantes; hard delete de produtos |
| 🟢 Nice-to-have | 3 | Bucket público `org-logos` permite listagem; `audit_logs` nunca é escrita; índices não usados/FKs sem índice |

### Sobre os dois pontos já confirmados manualmente

Os dois pontos que vocês relataram como já confirmados **existiram e foram corrigidos hoje**, via migration real, rastreada no histórico do projeto:

```
list_migrations → hhnbazjwdtymlouhufue
20260724134548  fix_store_invites_public_exposure
20260724134559  fix_role_templates_delete_exposure
```

Ambos aparecem no relatório abaixo como **corrigidos**, com o antes/depois exato tirado do banco — porque o "antes" ainda está descrito nos arquivos `.sql` do repo (que nunca foram atualizados para refletir a correção) e o "depois" é o que `pg_policies` mostra agora. O fix de `store_invites`, no entanto, gerou um efeito colateral não tratado: o front-end de cadastro público nunca foi atualizado para o novo modelo de acesso, e por isso está quebrado desde que a correção entrou no ar (§1.1).

---

## 1. SEGURANÇA E RLS (prioridade máxima)

### 1.1 🔴 CRÍTICO — Cadastro de clientes (`/registrar`) quebrado: a correção de `store_invites` não foi acompanhada pelo front-end

**Antes (o que o repo ainda descreve, `schema.sql:796-800`, `:860`):** policy `store_invites_public_read_signup` (`FOR SELECT USING (is_used = FALSE AND expires_at > NOW())`) + `GRANT SELECT ... TO anon` — sem filtro por token, exposta a qualquer anônimo.

**Depois (confirmado agora via `pg_policies` no banco real):**

```
tablename: store_invites
policyname: store_invites_superadmin_manage   | cmd: ALL | qual: is_superadmin()
policyname: SuperAdmin manages invites        | cmd: ALL | qual: is_superadmin()
```

Não existe **nenhuma** policy de `SELECT` pública em `store_invites` — só as duas acima (redundantes entre si, mas ambas restritas a `is_superadmin()`). O acesso público ao convite agora é feito por duas funções `SECURITY DEFINER` novas, criadas junto com a correção, com `EXECUTE` liberado para `anon`/`authenticated` (confirmado via `pg_proc` + advisor `anon_security_definer_function_executable`):

```sql
-- get_invite_by_token(invite_token text) → registro completo, filtrado por token (usada no formulário)
-- validate_invite(invite_token text)     → só store_name/plan_type/max_registers/product_id/expires_at (sem PII)
```

Essa é a forma correta de resolver o vazamento: em vez de abrir SELECT geral na tabela, o acesso passa a exigir o token exato como parâmetro de uma função com filtro embutido.

**O problema:** `src/core/pages/Register/index.jsx:50-55` — a tela pública de cadastro — **nunca foi migrada para usar `get_invite_by_token`/`validate_invite`**. Ela ainda faz:

```js
supabase
  .from('store_invites')
  .select('*')
  .eq('token', token)
  .eq('is_used', false)
  .maybeSingle()
```

Com RLS enable e sem nenhuma policy de SELECT aplicável a `anon`/`authenticated`, essa query **sempre retorna `data: null`** (RLS filtra silenciosamente, sem lançar `error`). O código trata isso como convite inválido:

```js
if (error || !data) {
  setInviteError('Convite inválido ou já utilizado. Solicite um novo link ao administrador.')
  setStep('invalid')
  return
}
```

**Impacto real, confirmado por busca de uso no código** (`grep get_invite_by_token|validate_invite` em `src/` → 0 resultados): desde que a migration `fix_store_invites_public_exposure` entrou em produção, **todo link de convite enviado a um cliente novo mostra "Convite inválido ou já utilizado"**, mesmo sendo um convite válido — o onboarding self-service está 100% bloqueado. É o padrão exato pedido no escopo: "query retorna sem erro explícito, mas não faz nada, por mismatch entre o que o frontend espera e o que o backend agora expõe."

**Correção:** trocar a query em `Register/index.jsx` para `supabase.rpc('get_invite_by_token', { invite_token: token })`, ajustando o consumo do retorno (é uma função, retorna array/tabela, não um objeto único — usar `.then(({ data }) => data?.[0])` ou `.single()` conforme o client). Testar o fluxo de `/registrar?token=...` ponta a ponta antes de considerar a correção de segurança "fechada".

### 1.2 🔴 CRÍTICO — Reset de senha do "dono" da organização está quebrado (confirmado: função implantada + schema real)

**Onde:** função implantada `update-owner-password` (v1, `list_edge_functions` confirma que é a mesma versão desde a criação — nunca foi corrigida) + tabela `public.profiles` real.

`list_tables` confirma as colunas reais de `profiles`: `id, org_id, full_name, role, permissions, updated_at, last_login_at, access_status, phone, template_id` — **não existe `created_at`**. O código implantado (puxado direto do projeto via `get_edge_function`, idêntico ao do repo) faz:

```ts
// comentário do próprio código: "created_at ASC garante o original"
const { data: ownerProfile, error: profileErr } = await admin
  .from('profiles')
  .select('id')
  .eq('org_id', org_id)
  .eq('role', 'admin')
  .order('created_at', { ascending: true })   // coluna inexistente
  .limit(1)
  .single()

if (profileErr || !ownerProfile) {
  return respond({ error: 'Dono da organização não encontrado. Verifique se o login foi criado.' })
}
```

Como a coluna não existe, a query falha no Postgres, `profileErr` vem preenchido, e o SuperAdmin sempre recebe a mensagem enganosa "Dono da organização não encontrado" — o endpoint de redefinir senha do dono nunca funciona, para nenhuma organização.

**Correção:** trocar `order('created_at', ...)` por `order('updated_at', ...)` (coluna que existe) ou adicionar de fato `created_at timestamptz default now()` em `profiles` e reimplantar a função (`supabase functions deploy update-owner-password`).

### 1.3 🟠 "Modo suporte" do SuperAdmin não funciona em 4 tabelas — falta a cláusula `is_superadmin()`

Todas as tabelas multi-tenant do app usam o padrão `org_id = get_my_org_id() OR is_superadmin()`, que é o que permite o SuperAdmin "entrar" numa organização em modo suporte (`sessionStorage.support_org_id`, `App.jsx:274-276`) e continuar operando — porque `is_superadmin()` sempre libera acesso independente do `org_id` real do superadmin (que normalmente é `NULL`). Mas 4 tabelas, confirmadas via `pg_policies`, **não têm essa cláusula**:

| Tabela | Policy real (via `pg_policies`) | Falta |
|---|---|---|
| `product_variants` | `org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())` | `OR is_superadmin()` |
| `product_attributes` | idem | idem |
| `cash_movements` | idem (`"movimentacoes da propria org"`) | idem |
| `sale_payments` | 3 policies via `EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_id AND s.org_id = get_my_org_id())` | idem |

**Impacto real:** um SuperAdmin logado como si mesmo (perfil com `org_id = NULL`) que entra em "modo suporte" numa loja para ajudar com um problema **não consegue ver variantes de produto, atributos (nº de série/IMEI/garantia), sangrias/reforços de caixa nem o detalhamento de pagamento misto de uma venda** dessa loja — porque `get_my_org_id()` continua resolvendo para o `org_id` real do superadmin (`NULL`), que nunca bate com o `org_id` da loja. Para lojas do segmento "moda"/"kit" (que dependem pesadamente de `product_variants` — ver `Produtos/index.jsx`), isso deixa boa parte do suporte inoperante.

**Correção:** alinhar as 4 policies ao padrão do resto do banco, adicionando `OR is_superadmin()` (ou `OR EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='superadmin')`, no padrão já usado em `organization_segments`).

### 1.4 🟡 Secret key de gateway de pagamento em texto puro, lida via `select('*')` pelo client

**Onde:** `src/admin/pages/SuperAdminDashboard.jsx:316,357,970-980` + tabela real `saas_gateway_configs`.

`list_tables` confirma as colunas reais: `provider, public_key, secret_key, webhook_secret, is_enabled, metadata` — todas texto puro, sem criptografia a nível de coluna. A policy real (`saas_gateway_configs_superadmin_manage`, `FOR ALL USING (is_superadmin())`) é a única proteção. O client faz `select('*')` (linha 316) e usa `secret_key` puro para pré-preencher o formulário (linha 357), e grava via `upsert` direto pelo client (linha 973) — nunca passa por uma Edge Function. `information_schema.role_table_grants` confirma `GRANT ALL` a `anon` **e** `authenticated` a nível de tabela (a única barreira real é a RLS de superadmin).

**Correção:** mover leitura/escrita de `secret_key`/`webhook_secret` para uma Edge Function com `service_role`; nunca devolver o valor puro ao client (só indicador mascarado); considerar Supabase Vault.

### 1.5 🟡 Duas formas independentes de reconhecer "superadmin" coexistem

`pg_policies` mostra, em `profiles`, uma policy adicional que ninguém documentou:

```
policyname: "superadmin lê todos os profiles"
cmd: SELECT
qual: EXISTS (SELECT 1 FROM saas_administrators sa WHERE sa.email = auth.email())
```

Isso é **independente** de `is_superadmin()` (que checa `profiles.role = 'superadmin'`). Ou seja: qualquer usuário cujo e-mail de login bata com uma linha em `saas_administrators` também consegue ler todos os profiles, mesmo que seu `profiles.role` não seja `superadmin`. Não é necessariamente um bug — pode ser intencional para dar leitura a operadores internos do SaaS sem precisar setar `role='superadmin'` — mas são dois mecanismos paralelos de autorização não documentados em nenhum lugar, o que é uma fonte natural de inconsistência futura (ex.: alguém audita achando que `is_superadmin()` é a única fonte de verdade, ou desativa um `saas_administrators` achando que revoga acesso, mas o `profiles.role` continua `superadmin`).

**Sugestão:** documentar essa dualidade no `ARCHITECTURE.md`, ou consolidar em um único mecanismo.

### 1.6 Cobertura de RLS por tabela — dados reais (`pg_policies`, todas com RLS habilitada)

| Tabela | Cobertura real | Observação |
|---|---|---|
| `autolavy_products` | SELECT público | catálogo estático, ok |
| `organizations` | SELECT/UPDATE própria org ou superadmin; INSERT/DELETE só superadmin; UPDATE também liberado a `admin`/`gerente` da própria org (policy extra `"Org update"`) | ok — mais permissivo que o repo sugeria, mas coerente |
| `profiles` | SELECT/UPDATE própria linha, mesma org, superadmin **ou** e-mail em `saas_administrators` (§1.5); INSERT/DELETE só superadmin | ok, com a ressalva do §1.5 |
| `cash_registers`, `categories`, `products`, `cash_sessions`, `sales`, `sale_items`, `audit_logs`, `cash_closings` | `org_id = get_my_org_id() OR is_superadmin()`, todas com policy duplicada (ver §4) | ok funcionalmente |
| `store_invites` | só superadmin (`ALL`); acesso público via RPC parametrizada | ok — mas ver §1.1 (front-end não migrado) |
| `saas_plans`, `saas_plan_limits`, `saas_subscriptions`, `saas_payments`, `saas_administrators`, `saas_system_logs` | só superadmin | ok |
| `saas_plan_features` | escrita só superadmin; **leitura liberada a qualquer usuário autenticado, mas escopada ao plano da própria org** via policy `"usuarios podem ler features do seu plano"` (`plan_id IN (SELECT organizations.plan_id FROM organizations WHERE id = (SELECT org_id FROM profiles WHERE id=auth.uid())))`) | ✅ confirmado correto — **não é mais um problema**, como já indicado |
| `saas_gateway_configs` | só superadmin | ok na RLS, mas ver §1.4 (exposição via client) |
| `role_templates` | SELECT: superadmin, própria org, ou template global (`org_id IS NULL`); escrita (`ALL`): só superadmin para globais, só a própria org para os demais | ✅ corrigido hoje (§ resumo executivo) — sem a brecha de DELETE por qualquer autenticado que o repo ainda descreve |
| `product_variants`, `product_attributes`, `cash_movements`, `sale_payments` | escopo de org correto, **sem bypass de superadmin** | 🟠 ver §1.3 |
| `organization_segments` | leitura própria org; gestão via checagem direta de `profiles.role='superadmin'` | ok |
| `segments`, `grade_templates`, `segment_attribute_templates` | SELECT público para autenticados; sem policy de escrita (só `service_role`/dashboard grava) | ok — são catálogos de referência geridos fora do client |
| `beleza_clients`, `beleza_services`, `beleza_config` | `tenant_id = (SELECT org_id FROM profiles WHERE id=auth.uid())` | ✅ **`tenant_id` é `uuid` na tabela real**, não `text` como o arquivo `src/modules/beleza/lib/schema.sql` do repo sugere — a policy funciona corretamente; o arquivo do repo está desatualizado (ver §4) |

---

## 2. BUGS CONHECIDOS

### 2.1 🟠 `removeDemos()` sem checagem de erro — mesmo padrão já corrigido na função vizinha

**Onde:** `src/modules/loja/pages/Produtos/index.jsx:1533-1537` (achado de código, não depende do estado do banco — mantido do relatório anterior).

```js
async function removeDemos() {
  if (!window.confirm('Remover todos os produtos demo desta loja?')) return
  await supabase.from('products').delete().eq('org_id', orgId).eq('is_demo', true)
  setProducts(prev => prev.filter(p => !p.is_demo))
}
```

A função `del()` logo acima (linhas 1515-1530) já captura `{ error }` antes de atualizar o estado local. `removeDemos()` não — se o delete falhar (ex.: produto demo já vendido, com linha em `sale_items` — a mesma FK que motivou a correção anterior no `del()`), os produtos somem da tela sem terem sido removidos do banco.

**Correção:** aplicar o mesmo padrão de `del()`.

### 2.2 🟠 Baixa de estoque pós-venda não verifica erro

**Onde:** `src/modules/loja/pages/Caixa/index.jsx:629-644` (achado de código).

```js
await Promise.all([
  ...regularItems.map(i => supabase.from('products').update({ stock_quantity: ... }).eq('id', ...).eq('org_id', orgId)),
  ...variantItems.map(i => supabase.from('product_variants').update({ stock_quantity: ... }).eq('id', ...).eq('org_id', orgId)),
])
// sem checar nenhum resultado:
setProducts(prev => prev.map(p => ({ ...p, stock_quantity: p.stock_quantity - sold.qty })))
```

Diferente do resto da mesma função (que confere `error` para venda, itens e pagamentos), a baixa de estoque não verifica nada — e o cliente Supabase-js não rejeita a Promise em caso de erro (`{ data, error }` sempre resolve), então o `try/catch` da função nunca pega essa falha. Estado local do estoque diverge silenciosamente do banco.

**Correção:** verificar os resultados do `Promise.all`; idealmente mover a baixa de estoque para dentro de uma função Postgres transacional junto com a criação da venda.

### 2.3 Documentação de migrations desatualizada — sem impacto funcional confirmado

**Onde:** `setup_migration.sql`, `setup_migration_final.sql`, `create_get_my_registers.sql` (3 definições diferentes de `get_my_registers()`).

A função real, confirmada via `pg_get_functiondef`, é:

```sql
CREATE OR REPLACE FUNCTION public.get_my_registers()
 RETURNS TABLE(id uuid, name text, description text, is_active boolean, product_filter jsonb)
 ...
 ORDER BY r.name ASC;
```

Sem `org_id` nem `created_at` no retorno — mais enxuta que **todas as 3** versões do repo (nenhuma bate exatamente). Verificado que o front-end (`src/core/hooks/useMultiPDV.js:14`, `src/modules/loja/pages/Caixa/index.jsx:404`) só consome `id`, `name`, `description`, `is_active`, `product_filter` — **não há bug funcional hoje**, mas nenhum arquivo do repo documenta corretamente o que está de fato implantado. Ver §4 para a causa raiz e recomendação.

### 2.4 Ordem SuperAdmin vs. organização — ok

`src/App.jsx:373` (checa `role === 'superadmin'`) roda antes de `:412` (checa `!tenant`) — superadmin sem organização não é bloqueado. Confirmado correto, sem mudança em relação à revisão anterior (achado de código puro).

### 2.5 sessionStorage de módulos — ok

`src/App.jsx:311` só grava cache se `loadedModules.length > 0`, seguindo `docs/ARCHITECTURE.md:297`. Como `saas_plan_features` está com RLS correta (§1.6), esse caminho agora é exercitado normalmente em produção (diferente do que uma leitura só do `schema.sql` sugeriria).

---

## 3. QUALIDADE DE CÓDIGO E CONSISTÊNCIA

*(achados de código-fonte — não dependem do estado do banco, mantidos após nova leitura dos arquivos)*

### 3.1 🟡 `console.log` de debug em produção

| Arquivo:linha | Conteúdo |
|---|---|
| `SuperAdminDashboard.jsx:648,652,655,660-665,673,676` | trace de exclusão de organização |
| `SuperAdminDashboard.jsx:705,706,708` | payload/resultado de update de organização |
| `SuperAdminDashboard.jsx:779,780,781` | **loga o `token` do convite gerado** no console |
| `Configuracoes/index.jsx:123,130,362` | payload/resultado de registro e troca de senha |
| `Produtos/index.jsx:1502,1506` | payload de `product_attributes` |

### 3.2 🟡 App "Studio" standalone duplicado dentro do repositório

`Studio/` (raiz do repo) é o protótipo single-tenant original do "Salão Studio", já portado para `src/modules/beleza/`. Tem `package.json`, `vite.config.js` e `supabase/schema.sql` próprios (RLS desabilitada deliberadamente, `GRANT ... TO anon` em tudo — aceitável para o protótipo isolado original, mas arriscado como artefato morto dentro do monorepo do SaaS em produção). Nenhum `import` do app principal referencia `Studio/`.

**Correção:** mover para repositório separado ou remover.

### 3.3 🟡 Arquivos grandes — candidatos a refatoração

| Arquivo | Linhas |
|---|---|
| `SuperAdminDashboard.jsx` | 2376 |
| `Produtos/index.jsx` | 2107 |
| `Caixa/index.jsx` | 1660 |
| `ClientOnboarding.jsx` | 1437 |
| `Configuracoes/index.jsx` | 1009 |
| `Historico/index.jsx` | 893 |
| `Equipe/index.jsx` | 844 |
| `Fechamento/index.jsx` | 666 |

### 3.4 🟢 `audit_logs` nunca é escrita

Tabela existe, tem RLS correta, mas nenhuma chamada `supabase.from('audit_logs')` existe em `src/` — auditoria "de papel", não funcional hoje.

---

## 4. ARQUITETURA DE MIGRATIONS — o achado mais importante desta seção, confirmado ao vivo

`list_migrations` no projeto real retorna **exatamente 2 linhas**:

```
20260724134548  fix_store_invites_public_exposure
20260724134559  fix_role_templates_delete_exposure
```

Ou seja: de tudo que existe hoje no banco — 27 tabelas, ~15 funções, dezenas de policies, o schema inteiro do módulo Beleza, `product_variants`/`product_attributes`/`cash_movements`/`sale_payments`/`organization_segments`/`segments`/`grade_templates`/`segment_attribute_templates`, todas as colunas adicionadas depois do schema base (`sales.status/voided_at/voided_by/void_reason`, `sale_items.variant_id`, `products.is_demo`, `profiles.template_id`, `organizations.segment/grade_config/onboarding_completed/min_stock_alert`, etc.) — **nada disso está rastreado como migration**, exceto os dois fixes de hoje. Isso inclui os 3 arquivos que já estão em `supabase/migrations/` no repo (`add_min_stock_alert_hierarchical.sql`, `add_onboarding_completed.sql`, `add_preset_categories_to_invites.sql`): seu conteúdo existe no banco (as colunas estão lá), mas **nenhum deles aparece no histórico de migrations aplicadas** — foram rodados manualmente fora do fluxo do CLI, igual aos scripts soltos na raiz.

**Consequência prática:** não é possível recriar este banco do zero a partir do repositório Git. `supabase/migrations/` não é a fonte de verdade — é um registro parcial e não confiável do schema real. Qualquer novo ambiente (staging, disaster recovery, um segundo dev rodando `supabase db reset`) fica sem boa parte do schema.

**Recomendação, em ordem de prioridade:**
1. `supabase db dump --schema-only` (ou `pg_dump`) no projeto ativo agora, gerar um baseline real, e registrar isso como a migration `0000_baseline` — a partir daqui todo mundo trabalha com o schema real, não com a reconstrução aproximada dos arquivos soltos.
2. Apagar os 7 scripts soltos da raiz (`schema.sql`, `setup_migration.sql`, `setup_migration_final.sql`, `role_templates.sql`, `categories_migration.sql`, `multiregister_migration.sql`, `pdv_migration.sql`, `create_get_my_registers.sql`) e `src/modules/beleza/lib/schema.sql` — todos divergem do banco real em pelo menos um ponto verificado nesta auditoria (tipo de `tenant_id`, assinatura de `get_my_registers()`, policy de `role_templates`) e хoje mais atrapalham do que ajudam.
3. Doravante, toda alteração de schema nasce em `supabase/migrations/` via `supabase migration new <nome>` + `supabase db push`, nunca mais direto no SQL Editor do dashboard — os dois fixes de hoje já seguiram esse padrão corretamente; é questão de manter.

### 4.1 Policies duplicadas — confirmado e quantificado pelo Performance Advisor

O advisor de performance aponta **254 ocorrências** do lint `Multiple Permissive Policies` — duas (ou mais) policies permissivas cobrindo o mesmo comando na mesma tabela, o que faz o Postgres avaliar ambas em toda query (RLS combina policies permissivas com `OR`, então funcionalmente inofensivo aqui, mas é custo de performance real e evidência direta da duplicação de definições vinda dos vários arquivos soltos). Tabelas afetadas, confirmadas via `pg_policies`: `store_invites`, `sales`, `sale_items`, `profiles`, `products`, `organizations`, `categories`, `cash_sessions`, `cash_registers`, `audit_logs`, `role_templates`, `autolavy_products`, `saas_plan_features`, `organization_segments` — em quase todas, uma policy com nome antigo em `PascalCase`/espaços (ex. `"Tenant Isolation"`, `"Org select"`) coexiste com uma policy mais nova em `snake_case` (ex. `products_tenant_isolation`) fazendo exatamente a mesma checagem. Isso resolve junto com a recomendação do item 4 — ao recriar o baseline, essas duplicatas somem.

---

## 5. GAPS CONHECIDOS (status atual confirmado)

| Gap | Status confirmado |
|---|---|
| **Integração de gateway de pagamento** | Não implementado. Só existe a tela de configuração que grava `secret_key`/`public_key`/`webhook_secret` (§1.4). `saas_gateway_configs` real não tem nenhuma coluna de tokenização/nonce/últimos-4-dígitos — é armazenamento bruto. Nenhuma Edge Function de checkout/webhook existe (`list_edge_functions` só retorna as 5 já conhecidas: `create-employee`, `create-owner`, `delete-organization`, `reset-employee-password`, `update-owner-password`). |
| **Arquivamento de produtos** | Ainda é hard delete — `products.delete()` em `Produtos/index.jsx:1520`. A tabela real não tem `is_archived`/`archived_at`. |
| **Módulo Meu Serviço** | Não é mais HTML standalone (`_referencias/` vazio). Ainda não implementado em React: `src/modules/servico/` só tem pastas vazias, comentado como fase 2 em `App.jsx:54`. |
| **Navegação mobile do SuperAdmin** | Ainda ausente — `SuperAdminDashboard.jsx:1066` renderiza `<aside className="w-[220px] shrink-0 ...">` fixo, sem nenhuma classe responsiva, ao contrário de `loja/components/Layout.jsx` (que já tem sidebar desktop + topbar/bottom-nav/drawer mobile). |

---

## 6. PONTOS FORTES

1. **A correção de `store_invites` foi feita do jeito certo no banco** — trocar uma policy pública ampla por RPCs `SECURITY DEFINER` parametrizadas por token, em vez de simplesmente remendar a policy, é a abordagem correta. O problema não é a correção em si, é o front-end não ter acompanhado (§1.1) — vale reconhecer o padrão usado, só falta fechar o loop.
2. **`saas_plan_features` tem exatamente a policy certa** para o caso de uso real (leitura pelo próprio tenant, escopada por `organizations.plan_id`, sem abrir a tabela inteira) — confirmado ao vivo.
3. **Separação anon/service_role é limpa**: client só usa `VITE_SUPABASE_ANON_KEY`; toda operação privilegiada vive nas 5 Edge Functions, que sempre revalidam `role`/`org_id` do chamador via JWT antes de agir.
4. **Ordem de checagem SuperAdmin-vs-organização está correta** (`App.jsx:373` antes de `:412`).
5. **Modelo de permissões "role como piso mínimo"** (`usePermissions.js:62-70`) é uma decisão de design sólida e segue implementada sem alterações.
6. **`belezaService.js`** isola toda a lógica de acesso a dado numa camada de serviço própria, sempre checando `error` — o padrão mais consistente do repo, bom modelo para estender a `loja`/`admin`.

---

## Observações de segurança adicionais (Security Advisor, não solicitadas explicitamente mas relevantes)

- **6 funções com `search_path` mutável** (`get_my_org_id`, `is_superadmin`, `set_updated_at`, `handle_new_user`, `slugify`, a versão antiga de `complete_store_onboarding`): sem `SET search_path` fixo, uma função `SECURITY DEFINER` pode ser enganada por um `search_path` malicioso da sessão chamadora. As funções criadas nos fixes de hoje (`get_invite_by_token`, `validate_invite`, a nova `complete_store_onboarding`) já vieram com `SET search_path TO 'public'` — só falta aplicar o mesmo tratamento nas mais antigas.
- **Proteção contra senha vazada (HaveIBeenPwned) está desligada** no Supabase Auth — ativação é um toggle em Authentication → Policies, sem custo de desenvolvimento.
- **Bucket `org-logos` é público e permite listagem** (policy `"Org logos public read"` sem restringir a `SELECT` de objeto individual) — qualquer um pode enumerar todos os arquivos do bucket, não só buscar uma URL conhecida. Se a única necessidade é servir a logo de cada org por URL direta, considerar restringir a policy para não permitir `list`.
