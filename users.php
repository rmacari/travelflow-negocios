<?php
/**
 * =============================================================================
 * Zap Negócios — users.php
 * =============================================================================
 * Administração de usuários e permissões.
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
$currentUser = requireUser('admin');

function readUserPayload()
{
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'JSON inválido.']);
        exit;
    }

    return $data;
}

function validateUsername($username)
{
    $username = strtolower(trim((string) $username));
    if (!preg_match('/^[a-z0-9._-]{3,80}$/', $username)) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Usuário inválido. Use 3 a 80 caracteres: letras, números, ponto, hífen ou underline.']);
        exit;
    }
    return $username;
}

function validatePassword($password)
{
    $password = (string) $password;
    if (strlen($password) < 8) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'A senha deve ter pelo menos 8 caracteres.']);
        exit;
    }
    return $password;
}

function fetchUserForManagement($id)
{
    $stmt = getDb()->prepare("
        SELECT id, username, full_name, role, is_active
        FROM zap_users
        WHERE id = :id
        LIMIT 1
    ");
    $stmt->execute(['id' => (int) $id]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Usuário não encontrado.']);
        exit;
    }

    return $user;
}

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = getDb()->query("
            SELECT id, username, full_name, role, is_active, created_at, updated_at, last_login_at
            FROM zap_users
            ORDER BY FIELD(role, 'owner', 'admin', 'editor', 'viewer'), username ASC
        ");

        echo json_encode([
            'success' => true,
            'users'   => $stmt->fetchAll(),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $data = readUserPayload();
    $action = $data['action'] ?? 'create';

    if ($action === 'create') {
        $username = validateUsername($data['username'] ?? '');
        $password = validatePassword($data['password'] ?? '');
        $fullName = trim((string) ($data['full_name'] ?? ''));
        $role = normalizeUserRole($data['role'] ?? 'editor');

        if (!canManageTargetUser($currentUser, $role)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Você não pode criar usuário com este papel.']);
            exit;
        }

        $stmt = getDb()->prepare("
            INSERT INTO zap_users (username, password_hash, full_name, role, is_active)
            VALUES (:username, :password_hash, :full_name, :role, 1)
        ");
        $stmt->execute([
            'username'      => $username,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'full_name'     => $fullName,
            'role'          => $role,
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Usuário criado com sucesso.',
            'id'      => (int) getDb()->lastInsertId(),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $target = fetchUserForManagement((int) ($data['id'] ?? 0));
    if (!canManageTargetUser($currentUser, $target['role'], (int) $target['id'])) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Você não pode alterar este usuário.']);
        exit;
    }

    if ($action === 'set_status') {
        $isActive = !empty($data['is_active']) ? 1 : 0;
        $stmt = getDb()->prepare('UPDATE zap_users SET is_active = :is_active WHERE id = :id');
        $stmt->execute(['is_active' => $isActive, 'id' => (int) $target['id']]);

        if ($isActive === 0) {
            $revoke = getDb()->prepare('UPDATE zap_user_sessions SET revoked_at = NOW() WHERE user_id = :user_id AND revoked_at IS NULL');
            $revoke->execute(['user_id' => (int) $target['id']]);
        }

        echo json_encode(['success' => true, 'message' => 'Status do usuário atualizado.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'reset_password') {
        $password = validatePassword($data['password'] ?? '');
        $stmt = getDb()->prepare('UPDATE zap_users SET password_hash = :password_hash WHERE id = :id');
        $stmt->execute([
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'id'            => (int) $target['id'],
        ]);

        $revoke = getDb()->prepare('UPDATE zap_user_sessions SET revoked_at = NOW() WHERE user_id = :user_id AND revoked_at IS NULL');
        $revoke->execute(['user_id' => (int) $target['id']]);

        echo json_encode(['success' => true, 'message' => 'Senha atualizada e sessões encerradas.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'update_role') {
        $role = normalizeUserRole($data['role'] ?? '');
        if (!canManageTargetUser($currentUser, $role, (int) $target['id'])) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Você não pode atribuir este papel.']);
            exit;
        }

        $stmt = getDb()->prepare('UPDATE zap_users SET role = :role WHERE id = :id');
        $stmt->execute(['role' => $role, 'id' => (int) $target['id']]);

        echo json_encode(['success' => true, 'message' => 'Papel do usuário atualizado.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Ação inválida.']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao gerenciar usuários.',
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
