<?php
/**
 * =============================================================================
 * Zap Negócios — remove_field.php
 * =============================================================================
 * Endpoint da API para remoção de um campo (coluna) da tabela lead_negocios.
 *
 * Executa um ALTER TABLE ... DROP COLUMN no banco MySQL.
 * Protegido por duas camadas:
 *   1. Permissão de usuário admin ou owner
 *   2. Bloqueio de campos padrão — apenas colunas personalizadas podem
 *      ser removidas; os campos fixos do sistema são intocáveis.
 *
 * ATENÇÃO: a remoção de uma coluna apaga permanentemente todos os dados
 * armazenados nela. Esta operação é irreversível.
 *
 * Método:  POST
 * Permissão: usuário admin ou owner
 * Body:    JSON { field_name: string }
 * Resposta: JSON { success: true, message }
 *           ou  { success: false, message }
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Zap Negócios
 * =============================================================================
 */

require __DIR__ . '/db.php';

// Envia headers CORS e responde imediatamente a requisições OPTIONS (preflight)
sendCors();

// Gerenciar campos exige usuário admin ou owner.
requireUser('admin');

// ---------------------------------------------------------------------------
// CAMPOS PADRÃO PROTEGIDOS
// Estes campos não podem ser removidos pela API — fazem parte da estrutura
// essencial do sistema. Qualquer tentativa de removê-los é rejeitada com 403.
// ---------------------------------------------------------------------------
$protectedFields = array_merge(
    getDefaultFieldNames(),
    ['id', 'conversation_id', 'source_platform', 'source_conversation_id', 'created_at', 'updated_at']
);

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
// ---------------------------------------------------------------------------
$fieldName = $data['field_name'] ?? '';

try {
    $fieldName = sanitizeColumnName($fieldName);
} catch (InvalidArgumentException $e) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    exit;
}

// Bloqueia tentativas de remover campos padrão do sistema
if (in_array($fieldName, $protectedFields, true)) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'message' => "O campo '{$fieldName}' é um campo padrão e não pode ser removido."
    ]);
    exit;
}

// ---------------------------------------------------------------------------
// VERIFICAÇÃO DE EXISTÊNCIA
// Confirma que a coluna existe antes de tentar removê-la.
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

    if ($exists === 0) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'message' => "O campo '{$fieldName}' não existe na tabela."
        ]);
        exit;
    }

    // ---------------------------------------------------------------------------
    // REMOÇÃO DA COLUNA
    // O nome já foi sanitizado por sanitizeColumnName(), tornando segura
    // a interpolação direta no SQL (necessária pois PDO não aceita
    // parâmetros em posição de identificadores).
    // ---------------------------------------------------------------------------
    $db->exec("ALTER TABLE lead_negocios DROP COLUMN `{$fieldName}`");

    $deleteConfig = $db->prepare(
        'DELETE FROM lead_negocio_field_config WHERE field_name = :field_name'
    );
    $deleteConfig->execute(['field_name' => $fieldName]);

    echo json_encode([
        'success' => true,
        'message' => "Campo '{$fieldName}' removido com sucesso.",
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao remover campo.',
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
