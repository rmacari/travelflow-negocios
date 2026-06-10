<?php
/**
 * =============================================================================
 * Zap Negócios — sync_lead_identity.php
 * =============================================================================
 * Sincroniza identificadores universais do lead em negócios já existentes.
 *
 * Uso principal: quando o Travel Flow mostra o telefone do lead, preenche
 * automaticamente lead_phone nos negócios antigos daquela conversa para que
 * os mesmos registros também sejam encontrados no WhatsApp Web.
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
requireUser('editor');

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON inválido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$conversationId = trim($data['conversation_id'] ?? '');
$sourcePlatform = normalizeSourcePlatform($data['source_platform'] ?? 'travel_flow');
$sourceConversationId = trim($data['source_conversation_id'] ?? $conversationId);
$leadPhone = normalizeLeadPhone($data['lead_phone'] ?? '');
$leadName = trim((string) ($data['lead_name'] ?? ''));

if ($leadPhone === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Telefone do lead não encontrado.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $columns = array_column(getLeadNegocioColumnMeta(), 'COLUMN_NAME');
    $hasLeadPhone = in_array('lead_phone', $columns, true);
    $hasSourceContext = in_array('source_platform', $columns, true)
        && in_array('source_conversation_id', $columns, true);
    $hasLeadName = in_array('nome_lead', $columns, true);

    if (!$hasLeadPhone) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'message' => 'Execute migrate_v4.sql para ativar telefone universal.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $where = [];
    $params = [
        'lead_phone' => $leadPhone,
    ];

    if ($conversationId !== '') {
        $where[] = 'conversation_id = :conversation_id';
        $params['conversation_id'] = $conversationId;
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
            'message' => 'Informe conversation_id ou source_conversation_id para sincronizar o telefone.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $assignments = ['lead_phone = :lead_phone'];

    if ($hasSourceContext) {
        $assignments[] = "source_platform = CASE WHEN source_platform = '' OR source_platform = 'unknown' THEN :source_platform ELSE source_platform END";
        $assignments[] = "source_conversation_id = CASE WHEN source_conversation_id = '' THEN :source_conversation_id ELSE source_conversation_id END";
        $params['source_platform'] = $sourcePlatform;
        $params['source_conversation_id'] = $sourceConversationId;
    }

    if ($hasLeadName && $leadName !== '') {
        $assignments[] = "nome_lead = CASE WHEN nome_lead = '' THEN :lead_name ELSE nome_lead END";
        $params['lead_name'] = $leadName;
    }

    $stmt = getDb()->prepare("
        UPDATE lead_negocios
        SET " . implode(",\n            ", $assignments) . "
        WHERE (" . implode(' OR ', $where) . ")
          AND lead_phone = ''
    ");
    $stmt->execute($params);

    echo json_encode([
        'success' => true,
        'message' => 'Telefone do lead sincronizado nos negócios existentes.',
        'updated' => $stmt->rowCount(),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao sincronizar telefone do lead.',
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
