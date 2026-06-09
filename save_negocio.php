<?php
/**
 * =============================================================================
 * Travel Flow Negócios — save_negocio.php
 * =============================================================================
 * Endpoint da API para criação e atualização de negócios de um atendimento.
 *
 * Quando o campo 'id' do payload for 0 ou ausente, cria um novo registro.
 * Quando 'id' for maior que 0, atualiza o registro existente — mas somente
 * se o conversation_id do registro corresponder ao enviado, impedindo que
 * um atendimento edite negócios de outro.
 *
 * Método:  POST
 * Body:    JSON com os campos do negócio (ver $payload abaixo)
 * Resposta: JSON { success: true, message, id } ou { success: false, message }
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
// EXTRAÇÃO E VALIDAÇÃO DOS CAMPOS OBRIGATÓRIOS
// ---------------------------------------------------------------------------

// id = 0 indica criação; id > 0 indica atualização
$id             = isset($data['id']) ? (int) $data['id'] : 0;
$conversationId = trim($data['conversation_id'] ?? '');

if ($conversationId === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'conversation_id é obrigatório.']);
    exit;
}

// Payload com todos os campos editáveis existentes no banco, incluindo campos personalizados
$editableFields = getLeadNegocioFields();
$payload = [];

foreach ($editableFields as $field) {
    $payload[$field] = $field === 'conversation_id'
        ? $conversationId
        : trim($data[$field] ?? '');
}

// nome_lead é o único campo obrigatório
if ($payload['nome_lead'] === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'nome_lead é obrigatório.']);
    exit;
}

// ---------------------------------------------------------------------------
// OPERAÇÃO NO BANCO — UPDATE ou INSERT
// ---------------------------------------------------------------------------
try {
    $db = getDb();

    if ($id > 0) {
        // ---------------------------------------------------------------------------
        // ATUALIZAÇÃO DE NEGÓCIO EXISTENTE
        // Verifica se o negócio pertence ao conversation_id informado antes de
        // atualizar, evitando edição cruzada entre atendimentos diferentes.
        // ---------------------------------------------------------------------------
        $check = $db->prepare(
            'SELECT id FROM lead_negocios WHERE id = :id AND conversation_id = :conversation_id LIMIT 1'
        );
        $check->execute(['id' => $id, 'conversation_id' => $conversationId]);

        if (!$check->fetch()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Negócio não encontrado.']);
            exit;
        }

        $updateFields = array_values(array_filter($editableFields, fn($field) => $field !== 'conversation_id'));
        $assignments  = array_map(fn($field) => "`{$field}` = :{$field}", $updateFields);
        $sql = "UPDATE lead_negocios SET "
             . implode(', ', $assignments)
             . " WHERE id = :id AND conversation_id = :conversation_id";

        $stmt = $db->prepare($sql);
        $stmt->execute($payload + ['id' => $id]);

        echo json_encode([
            'success' => true,
            'message' => 'Negócio atualizado com sucesso.',
            'id'      => $id,
        ]);
        exit;
    }

    // ---------------------------------------------------------------------------
    // CRIAÇÃO DE NOVO NEGÓCIO
    // Insere um novo registro vinculado ao conversation_id informado.
    // Retorna o ID gerado pelo AUTO_INCREMENT para que o frontend possa
    // selecionar o item recém-criado no dropdown.
    // ---------------------------------------------------------------------------
    $columns      = array_map(fn($field) => "`{$field}`", $editableFields);
    $placeholders = array_map(fn($field) => ":{$field}", $editableFields);
    $sql = "INSERT INTO lead_negocios ("
         . implode(', ', $columns)
         . ") VALUES ("
         . implode(', ', $placeholders)
         . ")";

    $stmt = $db->prepare($sql);
    $stmt->execute($payload);

    echo json_encode([
        'success' => true,
        'message' => 'Negócio criado com sucesso.',
        'id'      => (int) $db->lastInsertId(),
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao salvar negócio.',
        'error'   => $e->getMessage()
    ]);
}
