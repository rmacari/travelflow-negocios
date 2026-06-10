<?php
/**
 * =============================================================================
 * Zap Negócios — delete_negocio.php
 * =============================================================================
 * Endpoint da API para exclusão de um negócio de um lead.
 *
 * Recebe o id do negócio e identificadores do contexto via POST (JSON).
 * A exclusão só é executada por administradores e se o registro pertencer
 * ao contexto informado.
 *
 * Método:  POST
 * Body:    JSON com id e identificadores do contexto
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

// Excluir é uma ação destrutiva: exige usuário admin ou owner.
requireUser('admin');

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
// id e ao menos um identificador garantem que a exclusão seja restrita
// ao negócio correto do lead/conversa correta.
// ---------------------------------------------------------------------------
$id             = isset($data['id']) ? (int) $data['id'] : 0;
$conversationId       = trim($data['conversation_id'] ?? '');
$leadPhone            = normalizeLeadPhone($data['lead_phone'] ?? '');
$sourcePlatform       = normalizeSourcePlatform($data['source_platform'] ?? 'travel_flow');
$sourceConversationId = trim($data['source_conversation_id'] ?? $conversationId);

if ($id <= 0) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'id é obrigatório.']);
    exit;
}

if ($conversationId === '' && $leadPhone === '' && $sourceConversationId === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Informe conversation_id, lead_phone ou source_conversation_id.']);
    exit;
}

// ---------------------------------------------------------------------------
// EXCLUSÃO NO BANCO
// A cláusula WHERE filtra por id E contexto simultaneamente.
// Se rowCount() = 0, o registro não existia ou não pertencia ao lead/conversa.
// ---------------------------------------------------------------------------
try {
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
            'message' => 'Execute migrate_v4.sql para excluir negócios fora do Travel Flow.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = getDb()->prepare(
        'DELETE FROM lead_negocios WHERE id = :id AND (' . implode(' OR ', $where) . ')'
    );
    $stmt->execute($params);

    if ($stmt->rowCount() < 1) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Negócio não encontrado.']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'message' => 'Negócio excluído com sucesso.',
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao excluir negócio.',
        'error'   => $e->getMessage()
    ]);
}
