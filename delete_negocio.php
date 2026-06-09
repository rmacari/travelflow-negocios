<?php
/**
 * =============================================================================
 * Travel Flow Negocios — delete_negocio.php
 * =============================================================================
 * Endpoint da API para exclusão de um negócio de um atendimento.
 *
 * Recebe o id do negócio e o conversation_id via POST (JSON). A exclusão só
 * é executada se ambos corresponderem ao mesmo registro no banco, impedindo
 * que um atendimento exclua negócios pertencentes a outro.
 *
 * Método:  POST
 * Body:    JSON { id: number, conversation_id: string }
 * Resposta: JSON { success: true, message } ou { success: false, message }
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Travel Flow Negocios
 * =============================================================================
 */

require __DIR__ . '/db.php';

// Envia headers CORS e responde imediatamente a requisições OPTIONS (preflight)
sendCors();

// Valida a chave de API para operações normais
validateApiKey();

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
// Ambos id e conversation_id são necessários para garantir que a exclusão
// seja restrita ao negócio correto do atendimento correto.
// ---------------------------------------------------------------------------
$id             = isset($data['id']) ? (int) $data['id'] : 0;
$conversationId = trim($data['conversation_id'] ?? '');

if ($id <= 0) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'id é obrigatório.']);
    exit;
}

if ($conversationId === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'conversation_id é obrigatório.']);
    exit;
}

// ---------------------------------------------------------------------------
// EXCLUSÃO NO BANCO
// A cláusula WHERE filtra por id E conversation_id simultaneamente.
// Se rowCount() = 0, o registro não existia ou não pertencia ao atendimento.
// ---------------------------------------------------------------------------
try {
    $stmt = getDb()->prepare(
        'DELETE FROM lead_negocios WHERE id = :id AND conversation_id = :conversation_id'
    );
    $stmt->execute([
        'id'              => $id,
        'conversation_id' => $conversationId,
    ]);

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
