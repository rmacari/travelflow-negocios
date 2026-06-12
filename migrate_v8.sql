-- =============================================================================
-- Zap Negócios — migrate_v8.sql
-- =============================================================================
-- Adiciona permissões configuráveis por grupo/papel.
-- Execute depois do migrate_v7.sql.
-- =============================================================================


CREATE TABLE IF NOT EXISTS zap_role_permissions (
    role VARCHAR(20) NOT NULL,
    permissions_json LONGTEXT NOT NULL,
    updated_by_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (role),
    CONSTRAINT fk_zap_role_permissions_updated_by
        FOREIGN KEY (updated_by_user_id)
        REFERENCES zap_users (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO zap_role_permissions (role, permissions_json)
VALUES
  ('viewer', '["negocio.view","tasks.view"]'),
  ('editor', '["negocio.view","negocio.edit","tasks.view","tasks.edit"]'),
  ('admin', '["negocio.view","negocio.edit","negocio.delete","negocio.restore","tasks.view","tasks.edit","tasks.admin","admin.access","admin.appearance.view","admin.appearance.edit","admin.window.view","admin.window.edit","admin.notifications.view","admin.notifications.edit","admin.fields.view","admin.fields.edit","admin.users.view","admin.users.edit","admin.audit.view","admin.backup.edit"]'),
  ('owner', '["*"]')
ON DUPLICATE KEY UPDATE permissions_json = permissions_json;
