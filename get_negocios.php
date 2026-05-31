<?php
/**
 * =============================================================================
 * Travel Flow Negocios — get_negocios.php
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
 * Projeto: Travel Flow Negocios
 * =============================================================================
 */

require __DIR__ . '/db.php';

// Envia headers CORS e responde imediatamente a requisições OPTIONS (preflight)
sendCors();

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
        SELECT
            id,
            conversation_id,
            nome_lead,
            email,
            destino,
            data_viagem,
            duracao_viagem,
            numero_viajantes,
            idade_viajantes,
            cidade_origem,
            orcamento,
            tipo_compra,
            prioridade_valor,
            quando_reservar,
            observacoes,
            created_at,
            updated_at
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
