# ✂ Salão Studio

Sistema de gestão para cabelereiras — cadastro de clientes, atendimentos, alertas de retorno e muito mais.

---

## 🗂 Estrutura do projeto

```
salon-studio/
├── public/
├── src/
│   ├── lib/
│   │   └── supabase.js      # Cliente Supabase + camada de dados
│   ├── App.jsx              # Aplicação principal
│   ├── main.jsx             # Entrada do React
│   └── index.css            # Reset global
├── supabase/
│   └── schema.sql           # Script para criar as tabelas
├── .env.example             # Modelo das variáveis de ambiente
├── index.html
├── package.json
└── vite.config.js
```

---

## 🚀 Como rodar localmente

### 1. Clone e instale as dependências

```bash
git clone https://github.com/seu-usuario/salon-studio.git
cd salon-studio
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais do Supabase:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Rode o projeto

```bash
npm run dev
```

Acesse: `http://localhost:5173`

---

## 🗄 Configurando o Supabase

### 1. Crie uma conta em [supabase.com](https://supabase.com)

### 2. Crie um novo projeto

### 3. Crie as tabelas

- Vá em **SQL Editor** → **New query**
- Cole o conteúdo de `supabase/schema.sql`
- Clique em **Run**

### 4. Copie as credenciais

- Vá em **Settings** → **API**
- Copie a **Project URL** → `VITE_SUPABASE_URL`
- Copie a **anon public key** → `VITE_SUPABASE_ANON_KEY`

---

## ☁️ Deploy na Vercel

### 1. Suba o projeto no GitHub

```bash
git init
git add .
git commit -m "feat: initial commit — Salão Studio"
git remote add origin https://github.com/seu-usuario/salon-studio.git
git push -u origin main
```

### 2. Conecte na Vercel

- Acesse [vercel.com](https://vercel.com) e faça login
- Clique em **Add New Project**
- Selecione o repositório `salon-studio`
- Em **Framework Preset**, selecione **Vite**

### 3. Configure as variáveis de ambiente na Vercel

- Vá em **Settings** → **Environment Variables**
- Adicione as duas variáveis:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

### 4. Faça o deploy

- Clique em **Deploy**
- Aguarde ~1 minuto
- Seu sistema estará online em `https://salon-studio.vercel.app`

---

## 📦 Build para produção

```bash
npm run build
```

Os arquivos gerados ficam na pasta `dist/`.

---

## 🛣 Roadmap

### Plano Essencial (atual)
- [x] Cadastro de clientes (limite 50)
- [x] Registro de atendimentos
- [x] Histórico completo por cliente
- [x] Alertas de retorno configuráveis
- [x] Botão WhatsApp direto
- [x] Ranking de clientes por faturamento

### Plano Profissional (em desenvolvimento)
- [ ] Clientes ilimitados
- [ ] Agendamento de horários
- [ ] Lembrete automático WhatsApp (1 dia antes)
- [ ] Relatório semanal simples
- [ ] Controle de receita mensal

### Plano Negócio (planejado)
- [ ] Múltiplos profissionais com login individual
- [ ] Até 3 colaboradoras
- [ ] Relatórios por equipe
- [ ] Comissões por profissional

---

## ⚙️ Tecnologias

| Tecnologia | Uso |
|---|---|
| React 18 | Interface |
| Vite 5 | Bundler |
| Supabase | Banco de dados (PostgreSQL) |
| Vercel | Hospedagem |
| Tabler Icons | Ícones |

---

## 📄 Licença

Projeto privado — todos os direitos reservados.
