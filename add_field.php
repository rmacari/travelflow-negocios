<?php
/**
 * =============================================================================
 * Zap Negócios — add_field.php
 * =============================================================================
 * Endpoint da API para adição de um novo campo (coluna) na tabela lead_negocios.
 *
 * Executa um ALTER TABLE ... ADD COLUMN no banco MySQL para criar uma nova
 * coluna. O nome da coluna é sanitizado rigorosamente para prevenir SQL
 * injection. Verifica se a coluna já existe antes de criar.
 *
 * Método:  POST
 * Permissão: usuário admin ou owner
 * Body:    JSON { field_name, field_label, field_type, field_options }
 *            field_name — nome da coluna (apenas letras minúsculas,
 *                         números e underscores, mínimo 2 caracteres)
 * Resposta: JSON { success: true, message, field_name }
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

$fieldLabel = trim((string) ($data['field_label'] ?? ''));
$fieldType  = normalizeFieldType($data['field_type'] ?? 'text');
$options    = normalizeFieldOptions($data['field_options'] ?? []);

if ($fieldLabel === '') {
    $fieldLabel = getGeneratedFieldLabel($fieldName);
}

if ($fieldType === 'select' && !in_array('', $options, true)) {
    array_unshift($options, '');
}
if ($fieldType !== 'select') {
    $options = [];
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
    // O tipo visual do campo define apenas o tipo seguro da coluna criada.
    // O nome da coluna é inserido diretamente no SQL pois já foi sanitizado
    // por sanitizeColumnName() — parâmetros PDO não funcionam em identificadores.
    // ---------------------------------------------------------------------------
    $columnSql = getColumnSqlForFieldType($fieldType);
    $db->exec("
        ALTER TABLE lead_negocios
        ADD COLUMN `{$fieldName}` {$columnSql}
    ");

    $displayOrder = count(getFieldDefinitions()) + 1;
    $config = $db->prepare("
        INSERT INTO lead_negocio_field_config
            (field_name, field_label, field_type, field_options, display_order)
        VALUES
            (:field_name, :field_label, :field_type, :field_options, :display_order)
        ON DUPLICATE KEY UPDATE
            field_label = VALUES(field_label),
            field_type = VALUES(field_type),
            field_options = VALUES(field_options),
            display_order = VALUES(display_order)
    ");
    $config->execute([
        'field_name'    => $fieldName,
        'field_label'   => $fieldLabel,
        'field_type'    => $fieldType,
        'field_options' => encodeFieldOptions($options),
        'display_order' => $displayOrder,
    ]);

    echo json_encode([
        'success'    => true,
        'message'    => "Campo '{$fieldName}' adicionado com sucesso.",
        'field_name' => $fieldName,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao adicionar campo.',
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
