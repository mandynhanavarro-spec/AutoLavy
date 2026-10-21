-- MFA no banco, Etapa 2 (sem mudanca de comportamento para quem ja tem MFA):
-- as duas checagens de superadmin que NAO passavam por is_superadmin()
-- passam a usar a funcao -- assim, quando is_superadmin() exigir aal2
-- (Etapa 4, so com o ok da Mandy), nada fica de fora.

-- organization_segments: era profiles.role = 'superadmin' direto
ALTER POLICY "superadmin gerencia segmentos" ON public.organization_segments
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- leitura de todos os perfis por e-mail em saas_administrators: redundante
-- com profiles_select (is_superadmin()) e nao exige MFA
DROP POLICY IF EXISTS "superadmin lê todos os profiles" ON public.profiles;
