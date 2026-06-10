<?php
/**
 * =============================================================================
 * Zap Negócios — restore_negocio.php
 * =============================================================================
 * Restaura um negócio excluído de forma reversível.
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
$currentUser = requireUser('admin');

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON inválido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$id = isset($data['id']) ? (int) $data['id'] : 0;
$conversationId = trim($data['conversation_id'] ?? '');
$leadPhone = normalizeLeadPhone($data['lead_phone'] ?? '');
$sourcePlatform = normalizeSourcePlatform($data['source_platform'] ?? 'travel_flow');
$sourceConversationId = trim($data['source_conversation_id'] ?? $conversationId);

if ($id <= 0) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'id é obrigatório.'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($conversationId === '' && $leadPhone === '' && $sourceConversationId === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Informe conversation_id, lead_phone ou source_conversation_id.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    requireLeadNegocioSoftDeleteColumns();

    $columns = array_column(getLeadNegocioColumnMeta(), 'COLUMN_NAME');
    $hasLeadPhone = in_array('lead_phone', $columns, true);
    $hasSourceContext = in_array('source_platform', $columns, true)
        && in_array('source_conversation_id', $columns, true);
    $where = [];
    $params = ['id' => $id];

    if ($conversationId !== '') {
        $where[] = 'conversation_id = :conversation_id';
        $params['conversation_id'] = $conversationId;
    }
    if ($leadPhone !== '' && $hasLeadPhone) {
        $where[] = 'lead_phone = :lead_phone';
        $params['lead_phone'] = $leadPhone;
    }
    if ($sourceConversationId !== '' && $hasSourceContext) {
        $where[] = '(source_platform = :source_platform AND source_conversation_id = :source_conversation_id)';
        $params['source_platform'] = $sourcePlatform;
        $params['source_conversation_id'] = $sourceConversationId;
    }

    if (empty($where)) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'message' => 'Execute migrate_v4.sql para restaurar negócios fora do Travel Flow.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $select = getDb()->prepare(
        'SELECT * FROM lead_negocios WHERE id = :id AND (' . implode(' OR ', $where) . ') LIMIT 1'
    );
    $select->execute($params);
    $before = $select->fetch();

    if (!$before) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Negócio não encontrado.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (empty($before['deleted_at'])) {
        echo json_encode([
            'success' => true,
            'message' => 'Negócio já estava ativo.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = getDb()->prepare(
        'UPDATE lead_negocios
         SET deleted_at = NULL, deleted_by_user_id = NULL
         WHERE id = :id AND (' . implode(' OR ', $where) . ') AND deleted_at IS NOT NULL'
    );
    $stmt->execute($params);

    if ($stmt->rowCount() < 1) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Negócio não encontrado para restauração.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $afterStmt = getDb()->prepare('SELECT * FROM lead_negocios WHERE id = :id LIMIT 1');
    $afterStmt->execute(['id' => $id]);
    logAudit($currentUser, 'negocio.restore', 'lead_negocios', $id, $before, $afterStmt->fetch());

    echo json_encode([
        'success' => true,
        'message' => 'Negócio restaurado com sucesso.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao restaurar negócio.',
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
