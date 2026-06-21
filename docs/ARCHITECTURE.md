# AutoLavy — Referência de Arquitetura de Componentes

> Documento de referência para uso em prompts futuros.  
> Atualizado em: 2026-06-15

---

## 1. Fluxo de dados: quem carrega o quê

```
Supabase auth
    │
    ▼
App.jsx  ──  loadUserContext()
    │   carrega: profile, tenant (org), modules[]
    │
    ▼
TenantProvider  (value={{ tenant, modules, profile, loading }})
    │
    ├── useTenantContext()   → acesso direto ao contexto
    ├── useModules()         → módulos do plano (feature flags)
    └── usePermissions()     → permissões do usuário por role
```

Todos os dados chegam por contexto. **Nenhum componente de página faz fetch de profile ou tenant no mount** — eles leem do contexto.

---

## 2. Como acessar profile

**Arquivo fonte:** `src/core/contexts/TenantContext.jsx`

```jsx
import { useTenantContext } from '../../../../core/contexts/TenantContext'

const { profile } = useTenantContext()

profile?.id        // UUID do usuário
profile?.role      // 'superadmin' | 'admin' | 'gerente' | 'operador'
profile?.org_id    // UUID da organização
profile?.name      // nome do usuário (se existir na tabela profiles)
profile?.permissions  // objeto JSON com overrides de permissão (pode ser null)
```

**Nota:** `profile` pode ser `null` enquanto `loading === true`. Sempre use optional chaining (`?.`).

---

## 3. Como acessar orgId

`orgId` não existe como campo isolado no contexto — vem de duas fontes:

```jsx
// Via tenant (preferido — é o mesmo valor)
const { tenant } = useTenantContext()
const orgId = tenant?.id

// Via profile (alternativa se tenant não carregou)
const { profile } = useTenantContext()
const orgId = profile?.org_id
```

Na prática, use `tenant?.id` como `orgId` em todas as queries Supabase.

---

## 4. Como acessar tenant

**Arquivo fonte:** `src/core/contexts/TenantContext.jsx`

```jsx
const { tenant } = useTenantContext()

tenant?.id              // UUID da organização (= orgId)
tenant?.name            // nome do estabelecimento
tenant?.product_id      // 'loja' | 'servico' | 'beleza'  ← vertical ativa
tenant?.plan_id         // UUID do plano SaaS
tenant?.theme_color     // '#3b82f6' (cor primária da org)
tenant?.logo_url        // URL do logo (pode ser null)
tenant?.access_status   // 'ativo' | 'bloqueado'
tenant?.customer_status // 'ativo' | 'suspenso'
tenant?.is_active       // boolean
```

---

## 5. Como acessar modules[]

**Arquivo fonte:** `src/core/hooks/useModules.js`

`modules[]` é o array de `feature_key` habilitados para o plano da org, lido da tabela `saas_plan_features`.

```jsx
import { useModules } from '../../../../core/hooks/useModules'

const { modules, hasModule, hasAnyModule, hasAllModules } = useModules()

hasModule('historico')                        // true se feature habilitada
hasAnyModule(['relatorios', 'historico'])     // true se ao menos uma
hasAllModules(['relatorios', 'historico'])    // true se todas
```

**Feature keys conhecidas** (valores em `saas_plan_features.feature_key`):
- `'produtos'` — módulo de cadastro de produtos
- `'estoque'` — controle de estoque
- `'historico'` — histórico de vendas
- `'relatorios'` — relatórios financeiros / fechamento
- `'agenda'` — agendamentos (verticais servico/beleza)

Para **esconder nav items condicionalmente**, use `ModuleGuard`:

```jsx
import ModuleGuard from '../../../../shared/components/ModuleGuard'

// Esconde o filho se 'historico' não estiver no plano
<ModuleGuard module="historico">
  <SLink path="/historico" icon={History} label="Histórico" />
</ModuleGuard>

// Múltiplos módulos (OR por padrão)
<ModuleGuard modules={['relatorios', 'fechamento']}>
  ...
</ModuleGuard>

// AND (requireAll)
<ModuleGuard modules={['relatorios', 'fechamento']} requireAll>
  ...
</ModuleGuard>
```

---

## 6. Como verificar permissão por role

**Arquivo fonte:** `src/core/hooks/usePermissions.js`

```jsx
import { usePermissions } from '../../../../core/hooks/usePermissions'

const { can, role, permissions } = usePermissions()

role   // 'superadmin' | 'admin' | 'gerente' | 'operador'

can('can_open_cash')       // pode abrir caixa
can('can_do_sangria')      // pode fazer sangria
can('can_void_sale')       // pode cancelar/estornar venda
can('can_edit_stock')      // pode editar estoque
can('can_manage_products') // pode gerenciar produtos
can('can_view_reports')    // pode ver relatórios
can('can_close_cash')      // pode fechar caixa
```

**Hierarquia de permissões** (role grants são garantias mínimas; `profile.permissions` só pode adicionar, nunca remover):

| permissão            | operador | gerente | admin | superadmin |
|----------------------|----------|---------|-------|------------|
| can_open_cash        | ✓        | ✓       | ✓     | ✓          |
| can_do_sangria       | ✓        | ✓       | ✓     | ✓          |
| can_close_cash       |          | ✓       | ✓     | ✓          |
| can_edit_stock       |          | ✓       | ✓     | ✓          |
| can_view_reports     |          | ✓       | ✓     | ✓          |
| can_void_sale        |          |         | ✓     | ✓          |
| can_manage_products  |          |         | ✓     | ✓          |

Para guardar **por role diretamente** (sem passar por `can()`):
```jsx
const canReforco = ['admin', 'gerente', 'superadmin'].includes(role)
```

---

## 7. Padrão de query Supabase

**Sempre filtre por `org_id`** nas tabelas multitenantes. Nunca busque dados sem escopo de org.

```jsx
const { tenant } = useTenantContext()
const orgId = tenant?.id

// Leitura
const { data, error } = await supabase
  .from('products')
  .select('id, name, price, stock_quantity')
  .eq('org_id', orgId)
  .order('name')

// Inserção
const { data, error } = await supabase
  .from('sales')
  .insert({
    org_id:      orgId,
    user_id:     profile?.id ?? null,
    total_amount: cartTotal,
  })
  .select('id')
  .single()

// Atualização com escopo de segurança duplo
await supabase
  .from('products')
  .update({ stock_quantity: newQty })
  .eq('id', productId)
  .eq('org_id', orgId)   // ← sempre inclua o org_id no update também
```

**RPCs** (funções Postgres): não precisam de `org_id` explícito — a função extrai do JWT do usuário autenticado via `auth.uid()`.

```jsx
const { data } = await supabase.rpc('get_my_registers')
```

**Guards antes de queries:** sempre valide que `orgId` existe antes de disparar:
```jsx
useEffect(() => {
  if (!orgId) return
  // fetch...
}, [orgId])
```

---

## 8. Exemplo real: componente usando tudo junto

Baseado em `src/modules/loja/pages/Caixa/index.jsx`:

```jsx
import { useTenantContext } from '../../../../core/contexts/TenantContext'
import { usePermissions } from '../../../../core/hooks/usePermissions'
import { useModules } from '../../../../core/hooks/useModules'

export default function MinhaPagina() {
  // 1. Contexto base
  const { tenant, profile } = useTenantContext()
  const orgId = tenant?.id
  const color  = tenant?.theme_color || '#3b82f6'

  // 2. Permissões de ação
  const { can, role } = usePermissions()
  const canEditar = can('can_edit_stock')
  const isAdmin   = ['admin', 'superadmin'].includes(role)

  // 3. Feature flags do plano
  const { hasModule } = useModules()
  const temRelatorios = hasModule('relatorios')

  // 4. Query com escopo de org
  useEffect(() => {
    if (!orgId) return
    supabase
      .from('products')
      .select('*')
      .eq('org_id', orgId)
      .then(({ data }) => setProducts(data || []))
  }, [orgId])

  // 5. Inserção com user_id e org_id
  async function salvar() {
    await supabase.from('alguma_tabela').insert({
      org_id:  orgId,
      user_id: profile?.id ?? null,
      // ...
    })
  }

  return (
    <div style={{ color }}>
      {canEditar && <button>Editar</button>}
      {isAdmin   && <button>Ação admin</button>}
      {temRelatorios && <Relatorio />}
    </div>
  )
}
```

---

## 9. Onde cada arquivo vive

| O que               | Arquivo                                                    |
|---------------------|------------------------------------------------------------|
| Contexto central    | `src/core/contexts/TenantContext.jsx`                      |
| Hook de módulos     | `src/core/hooks/useModules.js`                             |
| Hook de permissões  | `src/core/hooks/usePermissions.js`                         |
| Guard de módulo     | `src/shared/components/ModuleGuard.jsx`                    |
| Carrega os dados    | `src/App.jsx` → `loadUserContext()`                        |
| Layout da loja      | `src/modules/loja/components/Layout.jsx`                   |
| Exemplo completo    | `src/modules/loja/pages/Caixa/index.jsx`                   |

---

## 10. O que NÃO fazer

- **Não buscar profile/tenant em páginas** — já está no contexto.
- **Não usar `profile?.org_id` em queries** se `tenant?.id` estiver disponível — são o mesmo UUID mas `tenant` já é o registro completo da org.
- **Não fazer query sem `.eq('org_id', orgId)`** em tabelas multitenantes — vazamento de dados entre orgs.
- **Não renderizar dados protegidos antes de checar `can()`** — fazer a verificação no render, não só na action.
- **Não salvar `[]` no sessionStorage** para módulos — o cache só é escrito se `loadedModules.length > 0`.
