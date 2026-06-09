<?php
/**
 * =============================================================================
 * Travel Flow Negócios — get_form_fields.php
 * =============================================================================
 * Lista os campos exibidos no formulário da extensão, já com ordem, rótulo,
 * tipo e opções salvos no servidor.
 *
 * Método:  GET
 * Header:  X-Api-Key (obrigatório)
 * Resposta: JSON { success: true, fields: [...] }
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
validateApiKey();

try {
    $fields = array_map(function ($field) {
        $item = [
            'key'   => $field['key'],
            'label' => $field['label'],
            'type'  => $field['type'],
        ];

        if (!empty($field['auto'])) {
            $item['auto'] = true;
        }

        if ($field['type'] === 'select') {
            $item['options'] = $field['options'];
        }

        return $item;
    }, getFieldDefinitions());

    echo json_encode(['success' => true, 'fields' => $fields], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao buscar campos do formulário.',
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
