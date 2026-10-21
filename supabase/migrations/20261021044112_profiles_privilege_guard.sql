-- PRIORIDADE 1: escalada de privilegio via profiles.
--
-- Antes desta migration:
--   - UPDATE em profiles liberado para id = auth.uid() sem restricao de
--     coluna: qualquer usuario virava superadmin (is_superadmin() le
--     profiles.role) ou trocava o proprio org_id e entrava em outra loja;
--   - policy FOR ALL "Profile isolation" deixava apagar perfis de colegas;
--   - handle_new_user copiava role e org_id de raw_user_meta_data, que e
--     controlado por quem faz signUp: cadastro anonimo nascia superadmin.
--
-- Desenho: trigger BEFORE INSERT/UPDATE (regras por coluna, que policy nao
-- expressa) + policies claras por comando. Privilegio por coluna (GRANT
-- UPDATE (full_name, phone)) nao serve: o admin precisa alterar role e
-- permissions de OUTROS perfis (tela Equipe), e GRANT nao distingue "o
-- proprio perfil" de "perfil de outro".
--
-- Contexto confiavel = current_user de servidor: postgres (funcoes SECURITY
-- DEFINER como complete_store_onboarding e handle_new_user), service_role
-- (edge functions), supabase_admin / supabase_auth_admin. O cliente (supabase-js
-- com a chave publica) roda como authenticated ou anon.
--
-- Retrocompativel com o site no ar (regra 12.1): nenhuma tela altera o
-- proprio role/permissions/org_id, ninguem do cliente insere/apaga perfil,
-- e a Equipe (admin alterando outros perfis da loja) continua permitida.

-- 1. Guarda de colunas ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profiles_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_trusted     boolean := current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin');
  v_caller      uuid    := auth.uid();
  v_caller_role public.user_role;
  v_caller_org  uuid;
BEGIN
  -- Vale para todos, inclusive servidor: superadmin nunca pertence a uma
  -- loja. Barra criar "funcionario superadmin" (create-employee grava o
  -- role vindo do chamador, sempre com org_id).
  IF NEW.role = 'superadmin' AND NEW.org_id IS NOT NULL THEN
    RAISE EXCEPTION 'PERFIL_SUPERADMIN_COM_LOJA';
  END IF;

  IF v_trusted THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- so superadmin (e servidor, acima) cria perfil
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'PERFIL_SEM_PERMISSAO';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PERFIL_CAMPO_PROTEGIDO';
  END IF;

  IF public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  -- daqui pra baixo: usuario comum (nao superadmin)
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR (NEW.role = 'superadmin' AND OLD.role IS DISTINCT FROM 'superadmin')
     OR OLD.role = 'superadmin' THEN
    RAISE EXCEPTION 'PERFIL_CAMPO_PROTEGIDO';
  END IF;

  IF OLD.id = v_caller THEN
    -- o proprio perfil: so campos inofensivos (full_name, phone,
    -- last_login_at; updated_at e do trigger)
    IF NEW.role          IS DISTINCT FROM OLD.role
       OR NEW.permissions   IS DISTINCT FROM OLD.permissions
       OR NEW.access_status IS DISTINCT FROM OLD.access_status
       OR NEW.template_id   IS DISTINCT FROM OLD.template_id THEN
      RAISE EXCEPTION 'PERFIL_CAMPO_PROTEGIDO';
    END IF;
    RETURN NEW;
  END IF;

  -- perfil de outra pessoa: so o admin da MESMA loja
  SELECT role, org_id INTO v_caller_role, v_caller_org
  FROM public.profiles WHERE id = v_caller;

  IF v_caller_role IS DISTINCT FROM 'admin' OR v_caller_org IS NULL OR OLD.org_id IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'PERFIL_SEM_PERMISSAO';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.profiles_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_guard ON public.profiles;
CREATE TRIGGER trg_profiles_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard();

-- 2. Policies por comando ---------------------------------------------------
-- Sai a FOR ALL e as duplicadas. SELECT mantem a mesma regra de hoje.

DROP POLICY IF EXISTS "Profile isolation" ON public.profiles;
DROP POLICY IF EXISTS "Profile select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_isolated" ON public.profiles;
DROP POLICY IF EXISTS "Profile update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_isolated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_superadmin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_superadmin" ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR org_id = public.get_my_org_id() OR public.is_superadmin());

-- quem pode TENTAR; as colunas sao decididas pelo trigger profiles_guard
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR org_id = public.get_my_org_id() OR public.is_superadmin())
  WITH CHECK (id = auth.uid() OR org_id = public.get_my_org_id() OR public.is_superadmin());

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin());

CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

-- "superadmin lê todos os profiles" (SELECT via saas_administrators) fica
-- como esta: so leitura e a tabela e gerida so por superadmin.

-- anon nunca escreve em profiles; TRUNCATE ignora RLS
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon;
REVOKE TRUNCATE ON public.profiles FROM authenticated;

-- 3. Cadastro (auth.users -> profiles) --------------------------------------
-- raw_user_meta_data vem do signUp do cliente: nao decide role nem loja.
-- Todo perfil nasce operador e sem loja; quem vincula e o servidor
-- (complete_store_onboarding, create-owner, create-employee,
-- create-administrator), que ja grava role/org_id por conta propria.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, org_id, phone, access_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'operador',
    NULL,
    NEW.raw_user_meta_data->>'phone',
    'ativo'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;
