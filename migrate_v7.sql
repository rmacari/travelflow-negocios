-- =============================================================================
-- Zap Negócios — migrate_v7.sql
-- =============================================================================
-- Adiciona auditoria, exclusão reversível de negócios e base para backup/export.
--
-- Execute depois do migrate_v6.sql.
-- =============================================================================

ALTER TABLE lead_negocios
  ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER updated_at;

ALTER TABLE lead_negocios
  ADD COLUMN deleted_by_user_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER deleted_at;

ALTER TABLE lead_negocios
  ADD KEY idx_lead_negocios_deleted (deleted_at);

CREATE TABLE IF NOT EXISTS zap_audit_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
    actor_username VARCHAR(80) NOT NULL DEFAULT '',
    actor_role VARCHAR(20) NOT NULL DEFAULT '',
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(80) NOT NULL DEFAULT '',
    before_data LONGTEXT NULL,
    after_data LONGTEXT NULL,
    ip_address VARCHAR(45) NOT NULL DEFAULT '',
    user_agent VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_zap_audit_actor (actor_user_id),
    KEY idx_zap_audit_action (action),
    KEY idx_zap_audit_entity (entity_type, entity_id),
    KEY idx_zap_audit_created (created_at),
    CONSTRAINT fk_zap_audit_actor
        FOREIGN KEY (actor_user_id)
        REFERENCES zap_users (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
