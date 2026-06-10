<?php
/**
 * =============================================================================
 * Zap Negócios — audit_log.php
 * =============================================================================
 * Lista eventos recentes de auditoria para admin/owner.
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
requireUser('admin');

if (!tableExists('zap_audit_log')) {
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'message' => 'Execute migrate_v7.sql no servidor para ativar auditoria.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function decodeAuditPayload($value)
{
    if ($value === null || $value === '') {
        return null;
    }

    $decoded = json_decode((string) $value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $value;
}

try {
    $limit = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
    $stmt = getDb()->prepare("
        SELECT
            id,
            actor_user_id,
            actor_username,
            actor_role,
            action,
            entity_type,
            entity_id,
            before_data,
            after_data,
            ip_address,
            user_agent,
            created_at
        FROM zap_audit_log
        ORDER BY id DESC
        LIMIT {$limit}
    ");
    $stmt->execute();

    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $row['before_data'] = decodeAuditPayload($row['before_data']);
        $row['after_data'] = decodeAuditPayload($row['after_data']);
        $rows[] = $row;
    }

    echo json_encode([
        'success' => true,
        'logs' => $rows,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao buscar auditoria.',
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
