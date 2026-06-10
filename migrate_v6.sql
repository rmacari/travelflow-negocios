-- =============================================================================
-- Zap Negócios — migrate_v6.sql
-- =============================================================================
-- Adiciona tarefas, lembretes e notificações vinculadas ao lead/conversa.
--
-- Execute depois do migrate_v5.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lead_tasks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    conversation_id VARCHAR(191) NOT NULL DEFAULT '',
    source_platform VARCHAR(50) NOT NULL DEFAULT 'travel_flow',
    source_conversation_id VARCHAR(191) NOT NULL DEFAULT '',
    lead_name VARCHAR(255) NOT NULL DEFAULT '',
    lead_phone VARCHAR(32) NOT NULL DEFAULT '',

    negocio_id BIGINT UNSIGNED NULL DEFAULT NULL,

    title VARCHAR(255) NOT NULL,
    notes TEXT NULL,
    due_at DATETIME NULL DEFAULT NULL,
    priority ENUM('baixa', 'normal', 'alta') NOT NULL DEFAULT 'normal',
    status ENUM('pendente', 'concluida', 'cancelada', 'arquivada') NOT NULL DEFAULT 'pendente',
    responsavel VARCHAR(255) NOT NULL DEFAULT '',

    assigned_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
    created_by_user_id BIGINT UNSIGNED NULL DEFAULT NULL,
    updated_by_user_id BIGINT UNSIGNED NULL DEFAULT NULL,

    completed_at DATETIME NULL DEFAULT NULL,
    canceled_at DATETIME NULL DEFAULT NULL,
    archived_at DATETIME NULL DEFAULT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_lead_tasks_context (source_platform, source_conversation_id),
    KEY idx_lead_tasks_conversation (conversation_id),
    KEY idx_lead_tasks_phone (lead_phone),
    KEY idx_lead_tasks_name (lead_name),
    KEY idx_lead_tasks_status_due (status, due_at),
    KEY idx_lead_tasks_assigned_due (assigned_user_id, due_at),
    KEY idx_lead_tasks_negocio (negocio_id),

    CONSTRAINT fk_lead_tasks_negocio
        FOREIGN KEY (negocio_id)
        REFERENCES lead_negocios (id)
        ON DELETE SET NULL,

    CONSTRAINT fk_lead_tasks_assigned_user
        FOREIGN KEY (assigned_user_id)
        REFERENCES zap_users (id)
        ON DELETE SET NULL,

    CONSTRAINT fk_lead_tasks_created_by
        FOREIGN KEY (created_by_user_id)
        REFERENCES zap_users (id)
        ON DELETE SET NULL,

    CONSTRAINT fk_lead_tasks_updated_by
        FOREIGN KEY (updated_by_user_id)
        REFERENCES zap_users (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
