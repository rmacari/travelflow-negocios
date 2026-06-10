<?php
/**
 * =============================================================================
 * Zap Negócios — logout.php
 * =============================================================================
 * Revoga a sessão atual do usuário.
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
validateApiKey();
requireAuthTables();

$token = getBearerToken();
if ($token !== '') {
    $stmt = getDb()->prepare("
        UPDATE zap_user_sessions
        SET revoked_at = NOW()
        WHERE token_hash = :token_hash
          AND revoked_at IS NULL
    ");
    $stmt->execute(['token_hash' => hash('sha256', $token)]);
}

echo json_encode([
    'success' => true,
    'message' => 'Sessão encerrada.'
], JSON_UNESCAPED_UNICODE);
