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

function ensureLoginAttemptTable()
{
    getDb()->exec("
        CREATE TABLE IF NOT EXISTS zap_login_attempts (
            username VARCHAR(80) NOT NULL,
            ip_address VARCHAR(45) NOT NULL DEFAULT '',
            attempts INT UNSIGNED NOT NULL DEFAULT 0,
            last_attempt_at DATETIME NOT NULL,
            locked_until DATETIME NULL DEFAULT NULL,
            PRIMARY KEY (username, ip_address),
            KEY idx_zap_login_attempts_locked (locked_until)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

function getLoginIpAddress()
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function enforceLoginRateLimit($username, $ipAddress)
{
    ensureLoginAttemptTable();

    $stmt = getDb()->prepare("
        SELECT attempts, locked_until
        FROM zap_login_attempts
        WHERE username = :username
          AND ip_address = :ip_address
        LIMIT 1
    ");
    $stmt->execute(['username' => $username, 'ip_address' => $ipAddress]);
    $row = $stmt->fetch();

    if (!$row || empty($row['locked_until'])) {
        return;
    }

    if (strtotime((string) $row['locked_until']) > time()) {
        http_response_code(429);
        echo json_encode([
            'success' => false,
            'message' => 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

function registerLoginFailure($username, $ipAddress)
{
    ensureLoginAttemptTable();

    $stmt = getDb()->prepare("
        SELECT attempts, last_attempt_at
        FROM zap_login_attempts
        WHERE username = :username
          AND ip_address = :ip_address
        LIMIT 1
    ");
    $stmt->execute(['username' => $username, 'ip_address' => $ipAddress]);
    $row = $stmt->fetch();

    $attempts = 1;
    if ($row && strtotime((string) $row['last_attempt_at']) > time() - (30 * 60)) {
        $attempts = (int) $row['attempts'] + 1;
    }

    $lockedUntil = $attempts >= 5 ? date('Y-m-d H:i:s', time() + (15 * 60)) : null;

    $upsert = getDb()->prepare("
        INSERT INTO zap_login_attempts (username, ip_address, attempts, last_attempt_at, locked_until)
        VALUES (:username, :ip_address, :attempts, NOW(), :locked_until)
        ON DUPLICATE KEY UPDATE
            attempts = VALUES(attempts),
            last_attempt_at = NOW(),
            locked_until = VALUES(locked_until)
    ");
    $upsert->execute([
        'username' => $username,
        'ip_address' => $ipAddress,
        'attempts' => $attempts,
        'locked_until' => $lockedUntil,
    ]);
}

function clearLoginFailures($username, $ipAddress)
{
    ensureLoginAttemptTable();

    $stmt = getDb()->prepare("
        DELETE FROM zap_login_attempts
        WHERE username = :username
          AND ip_address = :ip_address
    ");
    $stmt->execute(['username' => $username, 'ip_address' => $ipAddress]);
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON inválido.']);
    exit;
}

$username = strtolower(trim((string) ($data['username'] ?? '')));
$password = (string) ($data['password'] ?? '');
$ipAddress = getLoginIpAddress();

if ($username === '' || $password === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Informe usuário e senha.']);
    exit;
}

try {
    enforceLoginRateLimit($username, $ipAddress);

    $stmt = getDb()->prepare("
        SELECT id, username, password_hash, full_name, role, is_active
        FROM zap_users
        WHERE username = :username
        LIMIT 1
    ");
    $stmt->execute(['username' => $username]);
    $user = $stmt->fetch();

    if (!$user || (int) $user['is_active'] !== 1 || !password_verify($password, $user['password_hash'])) {
        registerLoginFailure($username, $ipAddress);
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Usuário ou senha inválidos.']);
        exit;
    }

    clearLoginFailures($username, $ipAddress);

    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $expiresAt = date('Y-m-d H:i:s', time() + (60 * 60 * 24 * 30));
    $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);

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
    logAudit(publicUser($user), 'auth.login', 'zap_users', (int) $user['id'], null, [
        'username' => $user['username'],
        'session_expires_at' => $expiresAt,
    ]);

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
