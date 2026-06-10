<?php
/**
 * =============================================================================
 * Zap Negócios — delete_negocio.php
 * =============================================================================
 * Endpoint da API para exclusão reversível de um negócio de um lead.
 *
 * Recebe o id do negócio via POST (JSON).
 * A exclusão só é executada por administradores.
 *
 * Método:  POST
 * Body:    JSON com id
 * Resposta: JSON { success: true, message } ou { success: false, message }
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Zap Negócios
 * =============================================================================
 */

require __DIR__ . '/db.php';

// Envia headers CORS e responde imediatamente a requisições OPTIONS (preflight)
sendCors();

// Excluir é uma ação sensível: exige usuário admin ou owner.
$currentUser = requireUser('admin');

// ---------------------------------------------------------------------------
// LEITURA E DECODIFICAÇÃO DO BODY
// O body deve ser um JSON válido; caso contrário a requisição é rejeitada.
// ---------------------------------------------------------------------------
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON inválido.']);
    exit;
}

// ---------------------------------------------------------------------------
// VALIDAÇÃO DOS CAMPOS OBRIGATÓRIOS
// O id identifica o negócio. A permissão de admin/owner protege a ação.
// ---------------------------------------------------------------------------
$id = isset($data['id']) ? (int) $data['id'] : 0;
$conversationId = trim($data['conversation_id'] ?? '');
$leadPhone = normalizeLeadPhone($data['lead_phone'] ?? '');
$sourcePlatform = normalizeSourcePlatform($data['source_platform'] ?? 'travel_flow');
$sourceConversationId = trim($data['source_conversation_id'] ?? $conversationId);
$forceById = !empty($data['force_by_id']);

if ($id <= 0) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'id é obrigatório.']);
    exit;
}

// ---------------------------------------------------------------------------
// EXCLUSÃO REVERSÍVEL NO BANCO
// Se rowCount() = 0, o registro não existia ou já estava excluído.
// ---------------------------------------------------------------------------
try {
    requireLeadNegocioSoftDeleteColumns();

    $select = getDb()->prepare('SELECT * FROM lead_negocios WHERE id = :id LIMIT 1');
    $select->execute(['id' => $id]);
    $before = $select->fetch();

    if (!$before) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Negócio não encontrado.']);
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
            'message' => 'O negócio selecionado não pertence ao contexto atual. Confirme para excluir pelo ID.',
            'requires_force' => true,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (isDeletedAtValue($before['deleted_at'] ?? '')) {
        echo json_encode([
            'success' => true,
            'message' => 'Negócio já estava excluído.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = getDb()->prepare(
        "UPDATE lead_negocios
         SET deleted_at = NOW(), deleted_by_user_id = :deleted_by_user_id
         WHERE id = :id"
    );
    $stmt->execute([
        'id' => $id,
        'deleted_by_user_id' => (int) $currentUser['id'],
    ]);

    if ($stmt->rowCount() < 1) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Negócio não encontrado.']);
        exit;
    }

    $afterStmt = getDb()->prepare('SELECT * FROM lead_negocios WHERE id = :id LIMIT 1');
    $afterStmt->execute(['id' => $id]);
    logAudit($currentUser, 'negocio.delete_soft', 'lead_negocios', $id, $before, $afterStmt->fetch());

    echo json_encode([
        'success' => true,
        'message' => 'Negócio excluído e enviado para recuperação.',
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao excluir negócio: ' . $e->getMessage(),
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
