<?php
/**
 * =============================================================================
 * Zap Negócios — me.php
 * =============================================================================
 * Retorna o usuário logado e seu papel.
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
$user = requireUser('viewer');

echo json_encode([
    'success' => true,
    'user'    => publicUser($user),
], JSON_UNESCAPED_UNICODE);
