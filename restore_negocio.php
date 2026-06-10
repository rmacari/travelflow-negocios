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
$forceById = !empty($data['force_by_id']);

if ($id <= 0) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'id é obrigatório.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    requireLeadNegocioSoftDeleteColumns();

    $select = getDb()->prepare('SELECT * FROM lead_negocios WHERE id = :id LIMIT 1');
    $select->execute(['id' => $id]);
    $before = $select->fetch();

    if (!$before) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Negócio não encontrado.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $hasContext = $conversationId !== '' || $leadPhone !== '' || $sourceConversationId !== '';
    if (
        $hasContext
        && !$forceById
        && !leadNegocioMatchesContext($before, $conversationId, $leadPhone, $sourcePlatform, $sourceConversationId)
    ) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'O negócio selecionado não pertence ao contexto atual. Confirme para restaurar pelo ID.',
            'requires_force' => true,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!isDeletedAtValue($before['deleted_at'] ?? '')) {
        echo json_encode([
            'success' => true,
            'message' => 'Negócio já estava ativo.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = getDb()->prepare(
        "UPDATE lead_negocios
         SET deleted_at = NULL, deleted_by_user_id = NULL
         WHERE id = :id"
    );
    $stmt->execute(['id' => $id]);

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
        'message' => 'Erro ao restaurar negócio: ' . $e->getMessage(),
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
