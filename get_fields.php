<?php
/**
 * =============================================================================
 * Travel Flow Negócios — get_fields.php
 * =============================================================================
 * Lista os campos atuais da tabela lead_negocios com metadados administráveis:
 * rótulo, tipo visual, opções de select, ordem, campo padrão e removível.
 *
 * Método:   GET
 * Header:   X-Admin-Key (obrigatório)
 * Resposta: JSON { success: true, fields: [...] }
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
validateAdminKey();

try {
    echo json_encode([
        'success' => true,
        'fields'  => getFieldDefinitions(),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao buscar campos.',
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
