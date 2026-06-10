<?php
/**
 * =============================================================================
 * Zap Negócios — save_negocio.php
 * =============================================================================
 * Endpoint da API para criação e atualização de negócios de um lead.
 *
 * Quando o campo 'id' do payload for 0 ou ausente, cria um novo registro.
 * Quando 'id' for maior que 0, atualiza o registro existente — mas somente
 * se algum identificador do contexto corresponder ao enviado, impedindo
 * edição cruzada entre leads/conversas diferentes.
 *
 * Método:  POST
 * Body:    JSON com os campos do negócio (ver $payload abaixo)
 * Resposta: JSON { success: true, message, id } ou { success: false, message }
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Zap Negócios
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
$conversationId       = trim($data['conversation_id'] ?? '');
$sourcePlatform       = normalizeSourcePlatform($data['source_platform'] ?? 'travel_flow');
$sourceConversationId = trim($data['source_conversation_id'] ?? $conversationId);
$leadPhone            = normalizeLeadPhone($data['lead_phone'] ?? '');

if ($conversationId === '' && $leadPhone === '' && $sourceConversationId === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Informe conversation_id, lead_phone ou source_conversation_id.']);
    exit;
}

// Payload com todos os campos editáveis existentes no banco, incluindo campos personalizados
$editableFields = getLeadNegocioFields();
$hasLeadPhoneColumn = in_array('lead_phone', $editableFields, true);
$hasSourceContextColumns = in_array('source_platform', $editableFields, true)
    && in_array('source_conversation_id', $editableFields, true);
$hasUniversalContext = $hasLeadPhoneColumn || $hasSourceContextColumns;

if ($conversationId === '' && !$hasUniversalContext) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Execute migrate_v4.sql para salvar negócios fora do Travel Flow.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$payload = [];

foreach ($editableFields as $field) {
    if ($field === 'conversation_id') {
        $payload[$field] = $conversationId;
    } elseif ($field === 'source_platform') {
        $payload[$field] = $sourcePlatform;
    } elseif ($field === 'source_conversation_id') {
        $payload[$field] = $sourceConversationId;
    } elseif ($field === 'lead_phone') {
        $payload[$field] = $leadPhone;
    } else {
        $payload[$field] = trim($data[$field] ?? '');
    }
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
        // Verifica se o negócio pertence ao contexto informado antes de atualizar.
        // ---------------------------------------------------------------------------
        $identityWhere = [];
        $identityParams = ['id' => $id];

        if ($conversationId !== '') {
            $identityWhere[] = 'conversation_id = :identity_conversation_id';
            $identityParams['identity_conversation_id'] = $conversationId;
        }
        if ($leadPhone !== '' && $hasLeadPhoneColumn) {
            $identityWhere[] = 'lead_phone = :identity_lead_phone';
            $identityParams['identity_lead_phone'] = $leadPhone;
        }
        if ($sourceConversationId !== '' && $hasSourceContextColumns) {
            $identityWhere[] = '(source_platform = :identity_source_platform AND source_conversation_id = :identity_source_conversation_id)';
            $identityParams['identity_source_platform'] = $sourcePlatform;
            $identityParams['identity_source_conversation_id'] = $sourceConversationId;
        }

        $check = $db->prepare(
            'SELECT id FROM lead_negocios WHERE id = :id AND (' . implode(' OR ', $identityWhere) . ') LIMIT 1'
        );
        $check->execute($identityParams);

        if (!$check->fetch()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Negócio não encontrado.']);
            exit;
        }

        $updateFields = array_values(array_filter(
            $editableFields,
            fn($field) => !in_array($field, ['conversation_id', 'source_platform', 'source_conversation_id'], true)
        ));
        $assignments  = array_map(fn($field) => "`{$field}` = :{$field}", $updateFields);
        $sql = "UPDATE lead_negocios SET "
             . implode(', ', $assignments)
             . " WHERE id = :id";

        $stmt = $db->prepare($sql);
        $updateParams = array_intersect_key($payload, array_flip($updateFields));
        $stmt->execute($updateParams + ['id' => $id]);

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
