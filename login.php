<?php
/**
 * =============================================================================
 * Zap Negócios — login.php
 * =============================================================================
 * Autentica um usuário e cria uma sessão temporária para a extensão.
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
validateApiKey();
requireAuthTables();

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON inválido.']);
    exit;
}

$username = strtolower(trim((string) ($data['username'] ?? '')));
$password = (string) ($data['password'] ?? '');

if ($username === '' || $password === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Informe usuário e senha.']);
    exit;
}

try {
    $stmt = getDb()->prepare("
        SELECT id, username, password_hash, full_name, role, is_active
        FROM zap_users
        WHERE username = :username
        LIMIT 1
    ");
    $stmt->execute(['username' => $username]);
    $user = $stmt->fetch();

    if (!$user || (int) $user['is_active'] !== 1 || !password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Usuário ou senha inválidos.']);
        exit;
    }

    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $expiresAt = date('Y-m-d H:i:s', time() + (60 * 60 * 24 * 30));
    $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
    $ipAddress = substr($_SERVER['REMOTE_ADDR'] ?? '', 0, 45);

    $insert = getDb()->prepare("
        INSERT INTO zap_user_sessions
            (user_id, token_hash, expires_at, ip_address, user_agent)
        VALUES
            (:user_id, :token_hash, :expires_at, :ip_address, :user_agent)
    ");
    $insert->execute([
        'user_id'    => (int) $user['id'],
        'token_hash' => $tokenHash,
        'expires_at' => $expiresAt,
        'ip_address' => $ipAddress,
        'user_agent' => $userAgent,
    ]);

    $update = getDb()->prepare('UPDATE zap_users SET last_login_at = NOW() WHERE id = :id');
    $update->execute(['id' => (int) $user['id']]);

    echo json_encode([
        'success'    => true,
        'message'    => 'Login realizado com sucesso.',
        'token'      => $token,
        'expires_at' => $expiresAt,
        'user'       => publicUser($user),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao fazer login.',
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
