-- =============================================================================
-- Zap Negócios — migrate_v4.sql
-- =============================================================================
-- Torna a base universal para Travel Flow CRM e WhatsApp Web.
--
-- Execute este script em bancos já existentes depois das migrações anteriores
-- necessárias. Se estiver instalando do zero, use schema.sql diretamente.
-- =============================================================================

ALTER TABLE lead_negocios
  ADD COLUMN source_platform VARCHAR(50) NOT NULL DEFAULT 'travel_flow' AFTER conversation_id;

ALTER TABLE lead_negocios
  ADD COLUMN source_conversation_id VARCHAR(191) NOT NULL DEFAULT '' AFTER source_platform;

ALTER TABLE lead_negocios
  ADD COLUMN lead_phone VARCHAR(32) NOT NULL DEFAULT '' AFTER nome_lead;

UPDATE lead_negocios
SET source_platform = 'travel_flow',
    source_conversation_id = conversation_id
WHERE source_conversation_id = '';

ALTER TABLE lead_negocios
  ADD KEY idx_lead_phone (lead_phone);

ALTER TABLE lead_negocios
  ADD KEY idx_source_context (source_platform, source_conversation_id);
