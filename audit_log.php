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
$currentUser = requirePermission('admin.audit.view');

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

function readAuditPayload()
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function fetchAuditRows($limit, $offset = 0)
{
    $stmt = getDb()->prepare("
        SELECT
            a.id,
            a.actor_user_id,
            a.actor_username,
            COALESCE(NULLIF(u.full_name, ''), a.actor_username, 'sistema') AS actor_full_name,
            a.actor_role,
            a.action,
            a.entity_type,
            a.entity_id,
            a.before_data,
            a.after_data,
            a.ip_address,
            a.user_agent,
            a.created_at
        FROM zap_audit_log a
        LEFT JOIN zap_users u ON u.id = a.actor_user_id
        ORDER BY a.id DESC
        LIMIT :limit OFFSET :offset
    ");
    $stmt->bindValue('limit', (int) $limit, PDO::PARAM_INT);
    $stmt->bindValue('offset', (int) $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $row['before_data'] = decodeAuditPayload($row['before_data']);
        $row['after_data'] = decodeAuditPayload($row['after_data']);
        $row['details'] = auditDetails($row);
        $rows[] = $row;
    }

    return $rows;
}

function auditDetails($row)
{
    $after = is_array($row['after_data']) ? $row['after_data'] : [];
    $before = is_array($row['before_data']) ? $row['before_data'] : [];
    $data = $after ?: $before;

    $parts = [];
    if (!empty($data['title'])) $parts[] = 'Tarefa: ' . $data['title'];
    if (!empty($data['nome_lead'])) $parts[] = 'Cliente: ' . $data['nome_lead'];
    if (!empty($data['lead_name'])) $parts[] = 'Cliente: ' . $data['lead_name'];
    if (!empty($data['destino'])) $parts[] = 'Destino: ' . $data['destino'];
    if (!empty($data['status'])) $parts[] = 'Status: ' . $data['status'];
    if (!empty($data['due_at'])) $parts[] = 'Prazo: ' . $data['due_at'];
    if (!empty($data['priority'])) $parts[] = 'Prioridade: ' . $data['priority'];
    if (!empty($data['username'])) $parts[] = 'Usuário: ' . $data['username'];
    if (!empty($data['role'])) $parts[] = 'Grupo: ' . $data['role'];

    if (($row['action'] ?? '') === 'field_config.update' && !empty($data['fields']) && is_array($data['fields'])) {
        $parts[] = count($data['fields']) . ' campo(s) configurado(s)';
    }
    if (($row['action'] ?? '') === 'backup.export' && !empty($data['tables']) && is_array($data['tables'])) {
        $parts[] = 'Tabelas: ' . implode(', ', array_keys($data['tables']));
    }

    return implode(' · ', array_values(array_unique(array_filter($parts))));
}

function outputAuditDownload($currentUser)
{
    $rows = fetchAuditRows(5000, 0);
    logAudit($currentUser, 'audit.export', 'zap_audit_log', date('YmdHis'), null, ['rows' => count($rows)]);
    echo json_encode([
        'success' => true,
        'project' => 'Zap Negócios',
        'type' => 'audit_log',
        'generated_at' => date('c'),
        'generated_by' => publicUser($currentUser),
        'logs' => $rows,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!userHasPermission($currentUser, 'admin.backup.edit')) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Você não pode apagar eventos de auditoria.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $data = readAuditPayload();
        if (($data['action'] ?? '') !== 'delete') {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Ação inválida.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $id = (int) ($data['id'] ?? 0);
        $stmt = getDb()->prepare('DELETE FROM zap_audit_log WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        echo json_encode(['success' => true, 'message' => 'Evento de auditoria apagado.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (($_GET['download'] ?? '') === '1') {
        outputAuditDownload($currentUser);
    }

    $limit = max(1, min(7, (int) ($_GET['limit'] ?? 7)));
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $total = (int) getDb()->query('SELECT COUNT(*) FROM zap_audit_log')->fetchColumn();
    $pages = max(1, (int) ceil($total / $limit));
    $page = min($page, $pages);
    $offset = ($page - 1) * $limit;

    echo json_encode([
        'success' => true,
        'logs' => fetchAuditRows($limit, $offset),
        'pagination' => [
            'page' => $page,
            'pages' => $pages,
            'limit' => $limit,
            'total' => $total,
        ],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao buscar auditoria.',
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
