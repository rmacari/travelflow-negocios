<?php
/**
 * =============================================================================
 * Zap Negócios — setup_owner.php
 * =============================================================================
 * Cria o primeiro usuário owner. Pode ser usado pelo navegador com formulário
 * web ou via JSON. Só funciona enquanto não existir owner ativo.
 * =============================================================================
 */

require __DIR__ . '/db.php';

function wantsJson()
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';

    return stripos($contentType, 'application/json') !== false
        || stripos($accept, 'application/json') !== false;
}

function h($value)
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function renderSetupPage($message = '', $type = 'info', $values = [])
{
    $username = $values['username'] ?? '';
    $fullName = $values['full_name'] ?? '';
    $ownerExists = false;
    $tablesReady = false;

    try {
        $tablesReady = tableExists('zap_users') && tableExists('zap_user_sessions');
        if ($tablesReady) {
            $ownerCheck = getDb()->query("SELECT COUNT(*) AS total FROM zap_users WHERE role = 'owner' AND is_active = 1");
            $ownerExists = (int) $ownerCheck->fetch()['total'] > 0;
        }
    } catch (Throwable $e) {
        $message = $message ?: 'Não foi possível acessar o banco. Verifique db.conf e a conexão MySQL.';
        $type = 'error';
    }

    if (!$tablesReady && $message === '') {
        $message = 'Execute migrate_v5.sql antes de criar o primeiro owner.';
        $type = 'error';
    }

    if ($ownerExists && $message === '') {
        $message = 'Já existe um usuário owner ativo. Use a página de Opções da extensão para fazer login.';
        $type = 'success';
    }

    $disabled = (!$tablesReady || $ownerExists) ? 'disabled' : '';

    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Zap Negócios — Primeiro usuário</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f4f7fb;
      color: #1f2937;
    }
    .wrap {
      width: min(680px, calc(100% - 32px));
      margin: 48px auto;
      background: #fff;
      border: 1px solid #d8deea;
      border-radius: 8px;
      box-shadow: 0 16px 36px rgba(15, 23, 42, .12);
      overflow: hidden;
    }
    header {
      padding: 24px 28px;
      background: #0a6c74;
      color: #fff;
    }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; }
    header p { margin: 8px 0 0; opacity: .92; line-height: 1.45; }
    main { padding: 28px; }
    .alert {
      padding: 12px 14px;
      border-radius: 6px;
      margin-bottom: 18px;
      font-weight: 700;
      line-height: 1.45;
    }
    .info { background: #eef6ff; color: #174a7c; }
    .success { background: #e9f8ef; color: #166534; }
    .error { background: #fdecec; color: #991b1b; }
    label {
      display: block;
      margin: 14px 0 6px;
      font-size: 13px;
      font-weight: 700;
      color: #334155;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 12px;
      font: 15px/1.3 Arial, sans-serif;
    }
    input:focus {
      outline: 2px solid rgba(10, 108, 116, .24);
      border-color: #0a6c74;
    }
    button {
      margin-top: 20px;
      border: 0;
      border-radius: 6px;
      padding: 12px 16px;
      background: #0a6c74;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    button:disabled {
      opacity: .5;
      cursor: not-allowed;
    }
    .hint {
      margin-top: 18px;
      color: #64748b;
      font-size: 13px;
      line-height: 1.5;
    }
    code {
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Zap Negócios</h1>
      <p>Criação do primeiro usuário owner</p>
    </header>
    <main>';

    if ($message !== '') {
        echo '<div class="alert ' . h($type) . '">' . h($message) . '</div>';
    } else {
        echo '<div class="alert info">Preencha os dados abaixo para criar o primeiro usuário com controle total.</div>';
    }

    echo '<form method="post" action="">
        <label for="api_key">API Key</label>
        <input id="api_key" name="api_key" type="password" autocomplete="off" required ' . $disabled . '>

        <label for="setup_key">Setup Key</label>
        <input id="setup_key" name="setup_key" type="password" autocomplete="off" required ' . $disabled . '>

        <label for="username">Usuário</label>
        <input id="username" name="username" type="text" value="' . h($username) . '" autocomplete="username" required ' . $disabled . '>

        <label for="full_name">Nome</label>
        <input id="full_name" name="full_name" type="text" value="' . h($fullName) . '" autocomplete="name" ' . $disabled . '>

        <label for="password">Senha do owner</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required ' . $disabled . '>

        <button type="submit" ' . $disabled . '>Criar primeiro owner</button>
      </form>

      <p class="hint">
        A <code>API_KEY</code> e a <code>SETUP_KEY</code> ficam no arquivo <code>db.conf</code>.
        Depois que o primeiro owner for criado, esta tela deixa de permitir novas criações.
      </p>
    </main>
  </div>
</body>
</html>';
}

function respondJson($statusCode, $payload)
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function getSetupInput()
{
    if (wantsJson()) {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    return $_POST;
}

function validateSetupCredentials($apiKey, $setupKey)
{
    $config = loadConfig(__DIR__ . '/db.conf');
    $expectedApi = $config['API_KEY'] ?? '';
    $expectedSetup = $config['SETUP_KEY'] ?? '';

    if ($expectedApi === '' || !hash_equals($expectedApi, (string) $apiKey)) {
        return 'API Key inválida.';
    }

    if ($expectedSetup === '' || !hash_equals($expectedSetup, (string) $setupKey)) {
        return 'Setup Key inválida.';
    }

    return '';
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    renderSetupPage();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    if (wantsJson()) {
        respondJson(405, ['success' => false, 'message' => 'Método não permitido.']);
    }
    renderSetupPage('Método não permitido.', 'error');
    exit;
}

$data = getSetupInput();
$isJson = wantsJson();

$apiKey = $data['api_key'] ?? ($_SERVER['HTTP_X_API_KEY'] ?? '');
$setupKey = $data['setup_key'] ?? ($_SERVER['HTTP_X_SETUP_KEY'] ?? '');
$username = strtolower(trim((string) ($data['username'] ?? '')));
$password = (string) ($data['password'] ?? '');
$fullName = trim((string) ($data['full_name'] ?? ''));

if (!tableExists('zap_users') || !tableExists('zap_user_sessions')) {
    $message = 'Execute migrate_v5.sql antes de criar o primeiro owner.';
    if ($isJson) respondJson(503, ['success' => false, 'message' => $message]);
    renderSetupPage($message, 'error', $data);
    exit;
}

$credentialError = validateSetupCredentials($apiKey, $setupKey);
if ($credentialError !== '') {
    if ($isJson) respondJson(403, ['success' => false, 'message' => $credentialError]);
    renderSetupPage($credentialError, 'error', $data);
    exit;
}

if (!preg_match('/^[a-z0-9._-]{3,80}$/', $username)) {
    $message = 'Usuário inválido. Use 3 a 80 caracteres: letras, números, ponto, hífen ou underline.';
    if ($isJson) respondJson(422, ['success' => false, 'message' => $message]);
    renderSetupPage($message, 'error', $data);
    exit;
}

if (strlen($password) < 10) {
    $message = 'A senha do owner deve ter pelo menos 10 caracteres.';
    if ($isJson) respondJson(422, ['success' => false, 'message' => $message]);
    renderSetupPage($message, 'error', $data);
    exit;
}

try {
    $ownerCheck = getDb()->query("SELECT COUNT(*) AS total FROM zap_users WHERE role = 'owner' AND is_active = 1");
    if ((int) $ownerCheck->fetch()['total'] > 0) {
        $message = 'Já existe um usuário owner ativo.';
        if ($isJson) respondJson(409, ['success' => false, 'message' => $message]);
        renderSetupPage($message, 'success');
        exit;
    }

    $stmt = getDb()->prepare("
        INSERT INTO zap_users (username, password_hash, full_name, role, is_active)
        VALUES (:username, :password_hash, :full_name, 'owner', 1)
    ");
    $stmt->execute([
        'username'      => $username,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'full_name'     => $fullName,
    ]);

    $user = [
        'id'        => (int) getDb()->lastInsertId(),
        'username'  => $username,
        'full_name' => $fullName,
        'role'      => 'owner',
    ];

    if ($isJson) {
        respondJson(200, [
            'success' => true,
            'message' => 'Usuário owner criado com sucesso.',
            'user'    => $user,
        ]);
    }

    renderSetupPage('Usuário owner criado com sucesso. Agora abra as Opções da extensão e faça login.', 'success');
} catch (Throwable $e) {
    $message = 'Erro ao criar usuário owner: ' . $e->getMessage();
    if ($isJson) respondJson(500, ['success' => false, 'message' => 'Erro ao criar usuário owner.', 'error' => $e->getMessage()]);
    renderSetupPage($message, 'error', $data);
}
