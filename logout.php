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
    $session = getDb()->prepare("
        SELECT u.id, u.username, u.full_name, u.role, s.id AS session_id
        FROM zap_user_sessions s
        INNER JOIN zap_users u ON u.id = s.user_id
        WHERE s.token_hash = :token_hash
        LIMIT 1
    ");
    $session->execute(['token_hash' => hash('sha256', $token)]);
    $user = $session->fetch();

    $stmt = getDb()->prepare("
        UPDATE zap_user_sessions
        SET revoked_at = NOW()
        WHERE token_hash = :token_hash
          AND revoked_at IS NULL
    ");
    $stmt->execute(['token_hash' => hash('sha256', $token)]);

    if ($user) {
        logAudit($user, 'auth.logout', 'zap_users', (int) $user['id'], [
            'session_id' => (int) $user['session_id'],
        ], null);
    }
}

echo json_encode([
    'success' => true,
    'message' => 'Sessão encerrada.'
], JSON_UNESCAPED_UNICODE);
