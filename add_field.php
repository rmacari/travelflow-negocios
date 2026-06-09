<?php
/**
 * =============================================================================
 * Travel Flow Negocios — add_field.php
 * =============================================================================
 * Endpoint da API para adição de um novo campo (coluna) na tabela lead_negocios.
 *
 * Executa um ALTER TABLE ... ADD COLUMN no banco MySQL para criar uma nova
 * coluna do tipo VARCHAR(255). O nome da coluna é sanitizado rigorosamente
 * para prevenir SQL injection. Verifica se a coluna já existe antes de criar.
 *
 * Método:  POST
 * Header:  X-Admin-Key (obrigatório — somente administradores)
 * Body:    JSON { field_name: string }
 *            field_name — nome da coluna (apenas letras minúsculas,
 *                         números e underscores, mínimo 2 caracteres)
 * Resposta: JSON { success: true, message, field_name }
 *           ou  { success: false, message }
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Travel Flow Negocios
 * =============================================================================
 */

require __DIR__ . '/db.php';

// Envia headers CORS e responde imediatamente a requisições OPTIONS (preflight)
sendCors();

// Valida a chave secreta antes de qualquer operação
validateAdminKey();

// ---------------------------------------------------------------------------
// LEITURA E DECODIFICAÇÃO DO BODY
// ---------------------------------------------------------------------------
$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'JSON inválido.']);
    exit;
}

// ---------------------------------------------------------------------------
// VALIDAÇÃO E SANITIZAÇÃO DO NOME DO CAMPO
// sanitizeColumnName() rejeita nomes inválidos, reservados ou muito curtos,
// prevenindo SQL injection e conflitos com colunas existentes do sistema.
// ---------------------------------------------------------------------------
$fieldName = $data['field_name'] ?? '';

try {
    $fieldName = sanitizeColumnName($fieldName);
} catch (InvalidArgumentException $e) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    exit;
}

// ---------------------------------------------------------------------------
// VERIFICAÇÃO DE EXISTÊNCIA
// Checa se já existe uma coluna com esse nome para evitar erro no ALTER TABLE.
// ---------------------------------------------------------------------------
try {
    $config = loadConfig(__DIR__ . '/db.conf');
    $dbName = $config['DB_NAME'] ?? '';
    $db     = getDb();

    $check = $db->prepare("
        SELECT COUNT(*) as total
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = :db_name
          AND TABLE_NAME   = 'lead_negocios'
          AND COLUMN_NAME  = :column_name
    ");
    $check->execute(['db_name' => $dbName, 'column_name' => $fieldName]);
    $exists = (int) $check->fetch()['total'];

    if ($exists > 0) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => "O campo '{$fieldName}' já existe na tabela."
        ]);
        exit;
    }

    // ---------------------------------------------------------------------------
    // CRIAÇÃO DA COLUNA
    // Todos os campos personalizados são VARCHAR(255) NOT NULL DEFAULT ''.
    // O nome da coluna é inserido diretamente no SQL pois já foi sanitizado
    // por sanitizeColumnName() — parâmetros PDO não funcionam em identificadores.
    // ---------------------------------------------------------------------------
    $db->exec("
        ALTER TABLE lead_negocios
        ADD COLUMN `{$fieldName}` VARCHAR(255) NOT NULL DEFAULT ''
    ");

    echo json_encode([
        'success'    => true,
        'message'    => "Campo '{$fieldName}' adicionado com sucesso.",
        'field_name' => $fieldName,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao adicionar campo.',
        'error'   => $e->getMessage()
    ]);
}
