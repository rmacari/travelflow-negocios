<?php
/**
 * =============================================================================
 * Travel Flow Negócios — get_negocios.php
 * =============================================================================
 * Endpoint da API para listagem de negócios de um atendimento.
 *
 * Recebe o parâmetro conversation_id via GET e retorna todos os negócios
 * vinculados a esse atendimento, ordenados do mais recente para o mais antigo.
 *
 * Método:    GET
 * Parâmetro: conversation_id (obrigatório) — ID do atendimento no Travel Flow
 * Resposta:  JSON { success: true, data: [...] } ou { success: false, message }
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Travel Flow Negócios
 * =============================================================================
 */

require __DIR__ . '/db.php';

// Envia headers CORS e responde imediatamente a requisições OPTIONS (preflight)
sendCors();

// Valida a chave de API para operações normais
validateApiKey();

// ---------------------------------------------------------------------------
// VALIDAÇÃO DE ENTRADA
// Rejeita a requisição se o conversation_id não for fornecido.
// ---------------------------------------------------------------------------
$conversationId = trim($_GET['conversation_id'] ?? '');

if ($conversationId === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'conversation_id é obrigatório.']);
    exit;
}

// ---------------------------------------------------------------------------
// CONSULTA AO BANCO
// Seleciona todos os campos relevantes dos negócios do atendimento informado,
// ordenando do ID maior para o menor (mais recente primeiro).
// ---------------------------------------------------------------------------
try {
    $stmt = getDb()->prepare("
        SELECT *
        FROM lead_negocios
        WHERE conversation_id = :conversation_id
        ORDER BY id DESC
    ");

    $stmt->execute(['conversation_id' => $conversationId]);
    $rows = $stmt->fetchAll();

    // Retorna array vazio (não erro) quando não há negócios cadastrados
    echo json_encode([
        'success' => true,
        'data'    => $rows,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao buscar negócios.',
        'error'   => $e->getMessage()
    ]);
}
