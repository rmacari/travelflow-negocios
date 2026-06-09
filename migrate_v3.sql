-- =============================================================================
-- Travel Flow Negócios — migrate_v3.sql
-- =============================================================================
-- Adiciona campos de acompanhamento comercial e a tabela de configuração
-- persistida dos campos.
--
-- Execute este script em bancos já existentes. Se estiver instalando do zero,
-- use schema.sql diretamente.
-- =============================================================================

ALTER TABLE lead_negocios
  ADD COLUMN status_negocio VARCHAR(100) NOT NULL DEFAULT '' AFTER destino;

ALTER TABLE lead_negocios
  ADD COLUMN temperatura_lead VARCHAR(100) NOT NULL DEFAULT '' AFTER status_negocio;

ALTER TABLE lead_negocios
  ADD COLUMN proximo_contato VARCHAR(100) NOT NULL DEFAULT '' AFTER temperatura_lead;

ALTER TABLE lead_negocios
  ADD COLUMN valor_estimado VARCHAR(100) NOT NULL DEFAULT '' AFTER proximo_contato;

ALTER TABLE lead_negocios
  ADD COLUMN responsavel VARCHAR(255) NOT NULL DEFAULT '' AFTER valor_estimado;

CREATE TABLE IF NOT EXISTS lead_negocio_field_config (
    field_name VARCHAR(64) NOT NULL,
    field_label VARCHAR(255) NOT NULL DEFAULT '',
    field_type VARCHAR(20) NOT NULL DEFAULT 'text',
    field_options TEXT NULL,
    display_order INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (field_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
