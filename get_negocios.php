<?php
/**
 * =============================================================================
 * Zap Negócios — get_negocios.php
 * =============================================================================
 * Lista negócios por atendimento, telefone do lead ou conversa de origem.
 *
 * Método:    GET
 * Parâmetros aceitos:
 *   - conversation_id
 *   - lead_phone
 *   - lead_name
 *   - source_platform
 *   - source_conversation_id
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
$currentUser = requireUser('viewer');

$conversationId       = trim($_GET['conversation_id'] ?? '');
$leadPhone            = normalizeLeadPhone($_GET['lead_phone'] ?? '');
$leadName             = trim($_GET['lead_name'] ?? '');
$sourcePlatform       = normalizeSourcePlatform($_GET['source_platform'] ?? '');
$sourceConversationId = trim($_GET['source_conversation_id'] ?? '');
$includeDeleted       = !empty($_GET['include_deleted']);

$where  = [];
$params = [];
$columns = array_column(getLeadNegocioColumnMeta(), 'COLUMN_NAME');
$hasLeadPhone = in_array('lead_phone', $columns, true);
$hasLeadName = in_array('nome_lead', $columns, true);
$hasDeletedAt = in_array('deleted_at', $columns, true);
$hasSourceContext = in_array('source_platform', $columns, true)
    && in_array('source_conversation_id', $columns, true);

if ($includeDeleted && !userHasRole($currentUser, 'admin')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Somente administradores podem listar negócios excluídos.'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($conversationId !== '') {
    $where[] = 'conversation_id = :conversation_id';
    $params['conversation_id'] = $conversationId;
}

if ($leadPhone !== '' && $hasLeadPhone) {
    $where[] = 'lead_phone = :lead_phone';
    $params['lead_phone'] = $leadPhone;
}

if ($sourcePlatform === 'whatsapp_web' && $leadPhone === '' && $leadName !== '' && strlen($leadName) >= 3 && $hasLeadName) {
    $where[] = 'nome_lead = :lead_name';
    $params['lead_name'] = $leadName;
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
        'message' => 'Informe conversation_id ou execute migrate_v4.sql para usar telefone e WhatsApp Web.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $deletedFilter = ($hasDeletedAt && !$includeDeleted) ? ' AND deleted_at IS NULL' : '';
    $stmt = getDb()->prepare("
        SELECT *
        FROM lead_negocios
        WHERE (" . implode(' OR ', $where) . ")
        {$deletedFilter}
        ORDER BY id DESC
    ");

    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'data'    => $rows,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao buscar negócios.',
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
