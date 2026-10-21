-- Complemento do profiles_guard: um admin NAO altera outro admin da loja
-- (rebaixar, mudar permissoes, bloquear, "excluir" -- a exclusao da Equipe e
-- access_status = 'excluido', tambem um UPDATE). So o superadmin faz isso.
-- O admin continua gerenciando gerentes e operadores da propria loja e pode
-- criar outro admin (create-employee) -- lojas com 2 socios.
--
-- Retrocompativel: so acrescenta uma recusa (PERFIL_ADMIN_PROTEGIDO), ja
-- traduzida no frontend.

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
  IF NEW.role = 'superadmin' AND NEW.org_id IS NOT NULL THEN
    RAISE EXCEPTION 'PERFIL_SUPERADMIN_COM_LOJA';
  END IF;

  IF v_trusted THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'PERFIL_SEM_PERMISSAO';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PERFIL_CAMPO_PROTEGIDO';
  END IF;

  IF public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR (NEW.role = 'superadmin' AND OLD.role IS DISTINCT FROM 'superadmin')
     OR OLD.role = 'superadmin' THEN
    RAISE EXCEPTION 'PERFIL_CAMPO_PROTEGIDO';
  END IF;

  IF OLD.id = v_caller THEN
    IF NEW.role          IS DISTINCT FROM OLD.role
       OR NEW.permissions   IS DISTINCT FROM OLD.permissions
       OR NEW.access_status IS DISTINCT FROM OLD.access_status
       OR NEW.template_id   IS DISTINCT FROM OLD.template_id THEN
      RAISE EXCEPTION 'PERFIL_CAMPO_PROTEGIDO';
    END IF;
    RETURN NEW;
  END IF;

  SELECT role, org_id INTO v_caller_role, v_caller_org
  FROM public.profiles WHERE id = v_caller;

  IF v_caller_role IS DISTINCT FROM 'admin' OR v_caller_org IS NULL OR OLD.org_id IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'PERFIL_SEM_PERMISSAO';
  END IF;

  -- outro admin da loja: so o superadmin altera
  IF OLD.role = 'admin' THEN
    RAISE EXCEPTION 'PERFIL_ADMIN_PROTEGIDO';
  END IF;

  RETURN NEW;
END;
$function$;
