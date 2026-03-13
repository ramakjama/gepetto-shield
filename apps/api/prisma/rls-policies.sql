-- ═══════════════════════════════════════════════════════════
-- COPILOT OCCIDENT — Row-Level Security Policies
-- Execute AFTER Prisma migrations
-- ═══════════════════════════════════════════════════════════

-- Helper: Create the app settings if they don't exist
-- These are set per-connection by the tenant interceptor

-- ═══ CLIENTS TABLE ═══
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" FORCE ROW LEVEL SECURITY;

-- Agente exclusivo titular: only their clients
CREATE POLICY agent_clients ON "Client"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) IN ('AGENTE_EXCLUSIVO_TITULAR', 'AGENTE_EXCLUSIVO_EMPLEADO')
        AND "mediadorId" = current_setting('app.tenant_id', true)
    );

-- Corredor: only brokered clients
CREATE POLICY broker_clients ON "Client"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'CORREDOR'
        AND "corredorId" = current_setting('app.tenant_id', true)
    );

-- Cliente particular: only themselves
CREATE POLICY self_client ON "Client"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'CLIENTE_PARTICULAR'
        AND nif = current_setting('app.tenant_nif', true)
    );

-- Cliente empresa: only company clients
CREATE POLICY company_client ON "Client"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'CLIENTE_EMPRESA'
        AND "empresaCif" = current_setting('app.tenant_cif', true)
    );

-- ═══ POLICIES TABLE ═══
ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy" FORCE ROW LEVEL SECURITY;

-- Agente: own portfolio
CREATE POLICY agent_policies ON "Policy"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) IN ('AGENTE_EXCLUSIVO_TITULAR', 'AGENTE_EXCLUSIVO_EMPLEADO')
        AND "mediadorId" = current_setting('app.tenant_id', true)
    );

-- Corredor: brokered policies
CREATE POLICY broker_policies ON "Policy"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'CORREDOR'
        AND "corredorId" = current_setting('app.tenant_id', true)
    );

-- Perito: only policies linked to assigned claims
CREATE POLICY perito_policies ON "Policy"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'PERITO'
        AND EXISTS (
            SELECT 1 FROM "Claim" c
            WHERE c."polizaId" = "Policy".id
            AND c."peritoAsignadoId" = current_setting('app.tenant_id', true)
        )
    );

-- Cliente particular: own policies
CREATE POLICY self_policies ON "Policy"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'CLIENTE_PARTICULAR'
        AND "clienteNif" = current_setting('app.tenant_nif', true)
    );

-- Cliente empresa: company policies
CREATE POLICY company_policies ON "Policy"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'CLIENTE_EMPRESA'
        AND "clienteNif" IN (
            SELECT nif FROM "Client"
            WHERE "empresaCif" = current_setting('app.tenant_cif', true)
        )
    );

-- ═══ CLAIMS TABLE ═══
ALTER TABLE "Claim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Claim" FORCE ROW LEVEL SECURITY;

-- Agente: own claims
CREATE POLICY agent_claims ON "Claim"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) IN ('AGENTE_EXCLUSIVO_TITULAR', 'AGENTE_EXCLUSIVO_EMPLEADO')
        AND "mediadorId" = current_setting('app.tenant_id', true)
    );

-- Corredor: brokered claims
CREATE POLICY broker_claims ON "Claim"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'CORREDOR'
        AND EXISTS (
            SELECT 1 FROM "Policy" p
            WHERE p.id = "Claim"."polizaId"
            AND p."corredorId" = current_setting('app.tenant_id', true)
        )
    );

-- Perito: assigned claims only
CREATE POLICY perito_claims ON "Claim"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'PERITO'
        AND "peritoAsignadoId" = current_setting('app.tenant_id', true)
    );

-- Abogado: assigned legal cases only
CREATE POLICY abogado_claims ON "Claim"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'ABOGADO_PREPERSA'
        AND "abogadoId" = current_setting('app.tenant_id', true)
    );

-- Reparador: claims with assigned work orders
CREATE POLICY reparador_claims ON "Claim"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'REPARADOR'
        AND EXISTS (
            SELECT 1 FROM "WorkOrder" wo
            WHERE wo."siniestroId" = "Claim".id
            AND wo."reparadorId" = current_setting('app.tenant_id', true)
        )
    );

-- Taller: claims with assigned repairs
CREATE POLICY taller_claims ON "Claim"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'TALLER_AUTOPRESTO'
        AND EXISTS (
            SELECT 1 FROM "WorkOrder" wo
            WHERE wo."siniestroId" = "Claim".id
            AND wo."tallerId" = current_setting('app.tenant_id', true)
        )
    );

-- Empleado siniestros: territory + ramo
CREATE POLICY empleado_claims ON "Claim"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'EMPLEADO_SINIESTROS'
        AND territorio = current_setting('app.tenant_territory', true)
        AND ramo::text = current_setting('app.tenant_department', true)
    );

-- Cliente particular: own claims
CREATE POLICY self_claims ON "Claim"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'CLIENTE_PARTICULAR'
        AND EXISTS (
            SELECT 1 FROM "Policy" p
            WHERE p.id = "Claim"."polizaId"
            AND p."clienteNif" = current_setting('app.tenant_nif', true)
        )
    );

-- ═══ WORK ORDERS TABLE ═══
ALTER TABLE "WorkOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkOrder" FORCE ROW LEVEL SECURITY;

-- Reparador: assigned work orders
CREATE POLICY reparador_orders ON "WorkOrder"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'REPARADOR'
        AND "reparadorId" = current_setting('app.tenant_id', true)
    );

-- Taller: assigned vehicle repairs
CREATE POLICY taller_orders ON "WorkOrder"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'TALLER_AUTOPRESTO'
        AND "tallerId" = current_setting('app.tenant_id', true)
    );

-- Agente: work orders for own claims
CREATE POLICY agent_orders ON "WorkOrder"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) IN ('AGENTE_EXCLUSIVO_TITULAR', 'AGENTE_EXCLUSIVO_EMPLEADO')
        AND EXISTS (
            SELECT 1 FROM "Claim" c
            WHERE c.id = "WorkOrder"."siniestroId"
            AND c."mediadorId" = current_setting('app.tenant_id', true)
        )
    );

-- ═══ COMMISSIONS TABLE (most sensitive between agents) ═══
ALTER TABLE "Commission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Commission" FORCE ROW LEVEL SECURITY;

-- ONLY the agency titular can see their commissions
CREATE POLICY titular_commissions ON "Commission"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'AGENTE_EXCLUSIVO_TITULAR'
        AND "mediadorId" = current_setting('app.tenant_id', true)
    );

-- Corredor: brokered commissions
CREATE POLICY broker_commissions ON "Commission"
    FOR SELECT USING (
        current_setting('app.tenant_role', true) = 'CORREDOR'
        AND EXISTS (
            SELECT 1 FROM "Policy" p
            WHERE p.id = "Commission"."polizaId"
            AND p."corredorId" = current_setting('app.tenant_id', true)
        )
    );

-- ═══ AUDIT EVENTS (no RLS — admin access only via application) ═══
-- AuditEvent table intentionally does NOT have RLS
-- Access is controlled at application level via RBAC scopes

-- ═══ CANARY TOKENS (no RLS — internal system table) ═══
-- CanaryToken table is internal, accessed only by system services
