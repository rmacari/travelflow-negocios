<?php
/**
 * =============================================================================
 * Travel Flow Negócios — save_field_config.php
 * =============================================================================
 * Salva no servidor a configuração visual dos campos do formulário:
 * ordem, rótulo, tipo e opções de listas.
 *
 * Método:  POST
 * Header:  X-Admin-Key (obrigatório)
 * Body:    JSON { fields: [{ name, label, type, options }] }
 * Resposta: JSON { success: true, message, fields }
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
validateAdminKey();

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data) || !isset($data['fields']) || !is_array($data['fields'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON inválido.']);
    exit;
}

try {
    $currentFields = getFieldDefinitions();
    $currentByName = [];
    foreach ($currentFields as $field) {
        $currentByName[$field['name']] = $field;
    }

    $db = getDb();
    $stmt = $db->prepare("
        INSERT INTO lead_negocio_field_config
            (field_name, field_label, field_type, field_options, display_order)
        VALUES
            (:field_name, :field_label, :field_type, :field_options, :display_order)
        ON DUPLICATE KEY UPDATE
            field_label = VALUES(field_label),
            field_type = VALUES(field_type),
            field_options = VALUES(field_options),
            display_order = VALUES(display_order)
    ");

    $saved = [];
    foreach (array_values($data['fields']) as $index => $field) {
        try {
            $name = sanitizeColumnName($field['name'] ?? '');
        } catch (InvalidArgumentException $e) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (!isset($currentByName[$name])) {
            http_response_code(422);
            echo json_encode([
                'success' => false,
                'message' => "O campo '{$name}' não existe na tabela."
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $type = normalizeFieldType($field['type'] ?? $currentByName[$name]['type']);
        $label = trim((string) ($field['label'] ?? ''));
        if ($label === '') {
            $label = $currentByName[$name]['label'];
        }

        $options = normalizeFieldOptions($field['options'] ?? []);
        if ($type === 'select' && !in_array('', $options, true)) {
            array_unshift($options, '');
        }
        if ($type !== 'select') {
            $options = [];
        }

        $stmt->execute([
            'field_name'    => $name,
            'field_label'   => $label,
            'field_type'    => $type,
            'field_options' => encodeFieldOptions($options),
            'display_order' => $index + 1,
        ]);

        $saved[] = [
            'name'    => $name,
            'label'   => $label,
            'type'    => $type,
            'options' => $options,
        ];
    }

    echo json_encode([
        'success' => true,
        'message' => 'Configuração dos campos salva com sucesso.',
        'fields'  => $saved,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao salvar configuração dos campos.',
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
