-- =============================================================================
-- Zap Negócios — migrate_v9.sql
-- =============================================================================
-- Adiciona permissões específicas por usuário.
-- Execute depois do migrate_v8.sql.
-- =============================================================================


CREATE TABLE IF NOT EXISTS zap_user_permissions (
    user_id BIGINT UNSIGNED NOT NULL,
    permissions_json LONGTEXT NOT NULL,
    updated_by_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_zap_user_permissions_user
        FOREIGN KEY (user_id)
        REFERENCES zap_users (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_zap_user_permissions_updated_by
        FOREIGN KEY (updated_by_user_id)
        REFERENCES zap_users (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
