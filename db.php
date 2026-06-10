<?php
/**
 * =============================================================================
 * Zap Negócios — db.php
 * =============================================================================
 * Módulo de conexão com o banco de dados MySQL e configuração de CORS.
 *
 * Fornece funções utilitárias usadas por todos os endpoints da API:
 *   - loadConfig():        lê as credenciais do arquivo db.conf
 *   - getDb():             retorna uma instância PDO singleton da conexão
 *   - sendCors():          emite os headers HTTP necessários para CORS e
 *                          encerra requisições OPTIONS (preflight)
 *   - validateApiKey():    valida a chave de usuário (API_KEY) — operações normais
 *   - validateAdminKey():  valida a chave de administrador (ADMIN_KEY) —
 *                          gerenciamento de campos (add_field, remove_field, get_fields)
 *   - getLeadNegocioFields(): lista os campos editáveis da tabela lead_negocios
 *   - getFieldDefinitions(): lista campos com rótulo, tipo, opções e ordem
 *   - sanitizeColumnName(): sanitiza nomes de coluna para ALTER TABLE seguro
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Zap Negócios
 * =============================================================================
 */

/**
 * Lê e parseia o arquivo de configuração db.conf.
 *
 * O arquivo deve conter pares CHAVE=VALOR, um por linha.
 * Linhas em branco e linhas iniciadas com # são ignoradas.
 *
 * @param  string $file Caminho absoluto para o arquivo db.conf.
 * @return array        Array associativo com as chaves e valores do arquivo.
 */
function loadConfig($file)
{
    if (!file_exists($file)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Arquivo db.conf não encontrado.']);
        exit;
    }

    $config = [];
    $lines  = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

    foreach ($lines as $line) {
        $line = trim($line);

        // Ignora linhas em branco e comentários
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }

        // Divide apenas no primeiro '=' para suportar senhas com '=' no valor
        $parts = explode('=', $line, 2);
        if (count($parts) === 2) {
            $config[trim($parts[0])] = trim($parts[1]);
        }
    }

    return $config;
}

/**
 * Retorna a instância singleton da conexão PDO com o MySQL.
 *
 * Usa o padrão singleton (variável estática) para evitar múltiplas conexões
 * durante o ciclo de vida de uma requisição.
 * Em caso de falha na conexão, retorna JSON de erro e encerra a execução.
 *
 * @return PDO Instância ativa da conexão com o banco de dados.
 */
function getDb()
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = loadConfig(__DIR__ . '/db.conf');
    $dsn    = 'mysql:host=' . ($config['DB_HOST'] ?? 'localhost')
            . ';dbname='   . ($config['DB_NAME'] ?? '')
            . ';charset=utf8mb4';

    try {
        $pdo = new PDO($dsn, $config['DB_USER'] ?? '', $config['DB_PASS'] ?? '', [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Erro ao conectar no banco.', 'error' => $e->getMessage()]);
        exit;
    }

    return $pdo;
}

/**
 * Emite os headers HTTP de CORS e Content-Type para todas as respostas da API.
 *
 * A origem permitida é lida do db.conf (chave ALLOWED_ORIGIN), garantindo que
 * apenas o domínio autorizado possa consumir a API via browser.
 *
 * Requisições OPTIONS (preflight do CORS) são respondidas imediatamente com
 * status 204 No Content, sem processar nenhuma lógica de negócio.
 *
 * IMPORTANTE: esta função deve ser chamada no topo de cada endpoint PHP,
 * antes de qualquer outra lógica, para garantir que os headers sejam enviados
 * mesmo em caso de erro de configuração.
 */
function sendCors()
{
    $config = loadConfig(__DIR__ . '/db.conf');
    $allowedOrigins = array_filter(array_map(
        'trim',
        explode(',', $config['ALLOWED_ORIGIN'] ?? 'https://travelflow.tur.br,https://web.whatsapp.com')
    ));
    $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $origin = in_array($requestOrigin, $allowedOrigins, true)
        ? $requestOrigin
        : ($allowedOrigins[0] ?? 'https://travelflow.tur.br');

    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: '  . $origin);
    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Api-Key, X-Admin-Key');

    // Responde preflight CORS sem processar a lógica do endpoint
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Valida a chave de usuário enviada no header X-Api-Key da requisição.
 *
 * Usada pelos endpoints de operações normais (get_negocios, save_negocio,
 * delete_negocio) para autenticar requisições de todos os usuários.
 *
 * A chave esperada é definida na chave API_KEY do arquivo db.conf.
 * A comparação usa hash_equals() para evitar ataques de timing.
 *
 * Em caso de chave ausente ou inválida, retorna 401 e encerra a execução.
 */
function validateApiKey()
{
    $config   = loadConfig(__DIR__ . '/db.conf');
    $expected = $config['API_KEY'] ?? '';
    $received = $_SERVER['HTTP_X_API_KEY'] ?? '';

    if ($expected === '' || !hash_equals($expected, $received)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Chave de API inválida ou ausente.']);
        exit;
    }
}

/**
 * Valida a chave de administrador enviada no header X-Admin-Key da requisição.
 *
 * Usada exclusivamente pelos endpoints de gerenciamento de campos
 * (get_fields, add_field, remove_field) para restringir essas operações
 * destrutivas apenas a usuários administradores.
 *
 * A chave esperada é definida na chave ADMIN_KEY do arquivo db.conf,
 * que deve ser diferente da API_KEY e compartilhada apenas com admins.
 * A comparação usa hash_equals() para evitar ataques de timing.
 *
 * Em caso de chave ausente ou inválida, retorna 403 e encerra a execução.
 */
function validateAdminKey()
{
    $config   = loadConfig(__DIR__ . '/db.conf');
    $expected = $config['ADMIN_KEY'] ?? '';
    $received = $_SERVER['HTTP_X_ADMIN_KEY'] ?? '';

    if ($expected === '' || !hash_equals($expected, $received)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Acesso negado. Chave de administrador inválida ou ausente.']);
        exit;
    }
}

function getDefaultFieldMeta()
{
    return [
        'nome_lead'        => ['label' => 'Nome do Lead', 'type' => 'text', 'auto' => true],
        'lead_phone'       => ['label' => 'Telefone do Lead', 'type' => 'text', 'auto' => true],
        'email'            => ['label' => 'Email', 'type' => 'text'],
        'destino'          => ['label' => 'Destino', 'type' => 'text'],
        'status_negocio'   => [
            'label'   => 'Status do Negócio',
            'type'    => 'select',
            'options' => ['', 'Novo', 'Em atendimento', 'Cotação enviada', 'Aguardando retorno', 'Fechado', 'Perdido'],
        ],
        'temperatura_lead' => [
            'label'   => 'Temperatura do Lead',
            'type'    => 'select',
            'options' => ['', 'Frio', 'Morno', 'Quente'],
        ],
        'proximo_contato'  => ['label' => 'Próximo Contato', 'type' => 'date'],
        'valor_estimado'   => ['label' => 'Valor Estimado', 'type' => 'currency'],
        'responsavel'      => ['label' => 'Responsável', 'type' => 'text'],
        'data_viagem'      => ['label' => 'Data da Viagem', 'type' => 'text'],
        'duracao_viagem'   => ['label' => 'Duração da Viagem', 'type' => 'text'],
        'numero_viajantes' => ['label' => 'Nº de Viajantes', 'type' => 'number'],
        'idade_viajantes'  => ['label' => 'Idade dos Viajantes', 'type' => 'text'],
        'cidade_origem'    => ['label' => 'Cidade de Origem', 'type' => 'text'],
        'orcamento'        => ['label' => 'Orçamento', 'type' => 'currency'],
        'tipo_compra'      => [
            'label'   => 'Tipo de Compra',
            'type'    => 'select',
            'options' => ['', 'Pacote completo', 'Aéreo + Hotel', 'Só hotel', 'Só aéreo', 'Cruzeiro', 'Seguro', 'Outro'],
        ],
        'prioridade_valor' => [
            'label'   => 'Prioridade de Valor',
            'type'    => 'select',
            'options' => ['', 'Preço', 'Custo-Benefício', 'Conforto', 'Experiências', 'Luxo'],
        ],
        'quando_reservar'  => [
            'label'   => 'Quando Pretende Reservar',
            'type'    => 'select',
            'options' => ['', 'Hoje', 'Esta semana', 'Este mês', 'Em 30 dias', 'Só pesquisando'],
        ],
        'observacoes'      => ['label' => 'Observações', 'type' => 'textarea'],
    ];
}

function getDefaultFieldNames()
{
    return array_keys(getDefaultFieldMeta());
}

function normalizeFieldType($type)
{
    $type = strtolower(trim((string) $type));
    $allowed = ['text', 'textarea', 'select', 'date', 'number', 'currency'];

    return in_array($type, $allowed, true) ? $type : 'text';
}

function normalizeFieldOptions($options)
{
    if (is_string($options)) {
        $decoded = json_decode($options, true);
        if (is_array($decoded)) {
            $options = $decoded;
        } else {
            $options = preg_split('/\r\n|\r|\n/', $options);
        }
    }

    if (!is_array($options)) {
        return [];
    }

    $normalized = [];
    foreach ($options as $option) {
        $value = trim((string) $option);
        if ($value === '' && in_array('', $normalized, true)) {
            continue;
        }
        if ($value !== '' && in_array($value, $normalized, true)) {
            continue;
        }
        $normalized[] = $value;
    }

    return $normalized;
}

function encodeFieldOptions($options)
{
    return json_encode(normalizeFieldOptions($options), JSON_UNESCAPED_UNICODE);
}

function decodeFieldOptions($options)
{
    $decoded = json_decode((string) $options, true);
    return normalizeFieldOptions(is_array($decoded) ? $decoded : []);
}

function getColumnSqlForFieldType($type)
{
    return normalizeFieldType($type) === 'textarea'
        ? 'TEXT NULL'
        : "VARCHAR(255) NOT NULL DEFAULT ''";
}

function ensureFieldConfigTable()
{
    getDb()->exec("
        CREATE TABLE IF NOT EXISTS lead_negocio_field_config (
            field_name VARCHAR(64) NOT NULL,
            field_label VARCHAR(255) NOT NULL DEFAULT '',
            field_type VARCHAR(20) NOT NULL DEFAULT 'text',
            field_options TEXT NULL,
            display_order INT UNSIGNED NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (field_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

function getLeadNegocioColumnMeta()
{
    $config = loadConfig(__DIR__ . '/db.conf');
    $dbName = $config['DB_NAME'] ?? '';

    $stmt = getDb()->prepare("
        SELECT COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = :db_name
          AND TABLE_NAME   = 'lead_negocios'
        ORDER BY ORDINAL_POSITION ASC
    ");
    $stmt->execute(['db_name' => $dbName]);

    return $stmt->fetchAll();
}

function getGeneratedFieldLabel($fieldName)
{
    return ucwords(str_replace('_', ' ', $fieldName));
}

function normalizeLeadPhone($phone)
{
    return preg_replace('/\D+/', '', (string) $phone);
}

function normalizeSourcePlatform($platform)
{
    $platform = strtolower(trim((string) $platform));
    return preg_match('/^[a-z0-9_]{2,50}$/', $platform) ? $platform : 'unknown';
}

function ensureFieldConfigRows($columns)
{
    ensureFieldConfigTable();

    $db = getDb();
    $defaultMeta = getDefaultFieldMeta();
    $insert = $db->prepare("
        INSERT INTO lead_negocio_field_config
            (field_name, field_label, field_type, field_options, display_order)
        VALUES
            (:field_name, :field_label, :field_type, :field_options, :display_order)
        ON DUPLICATE KEY UPDATE field_name = field_name
    ");

    foreach ($columns as $column) {
        $name = $column['COLUMN_NAME'];
        if (
            !preg_match('/^[a-z][a-z0-9_]{1,63}$/', $name)
            || in_array($name, ['conversation_id', 'source_platform', 'source_conversation_id'], true)
        ) {
            continue;
        }

        $meta = $defaultMeta[$name] ?? [];
        $type = normalizeFieldType($meta['type'] ?? ($column['DATA_TYPE'] === 'text' ? 'textarea' : 'text'));

        $insert->execute([
            'field_name'    => $name,
            'field_label'   => $meta['label'] ?? getGeneratedFieldLabel($name),
            'field_type'    => $type,
            'field_options' => encodeFieldOptions($meta['options'] ?? []),
            'display_order' => max(0, (int) $column['ORDINAL_POSITION']),
        ]);
    }
}

function getFieldDefinitions()
{
    $columns = getLeadNegocioColumnMeta();
    ensureFieldConfigRows($columns);

    $systemColumns = ['id', 'conversation_id', 'source_platform', 'source_conversation_id', 'created_at', 'updated_at'];
    $defaultMeta = getDefaultFieldMeta();
    $columnByName = [];

    foreach ($columns as $column) {
        $columnByName[$column['COLUMN_NAME']] = $column;
    }

    $stmt = getDb()->query("
        SELECT field_name, field_label, field_type, field_options, display_order
        FROM lead_negocio_field_config
        ORDER BY display_order ASC, field_name ASC
    ");

    $fields = [];
    foreach ($stmt->fetchAll() as $row) {
        $name = $row['field_name'];
        if (!isset($columnByName[$name]) || in_array($name, $systemColumns, true)) {
            continue;
        }
        if (!preg_match('/^[a-z][a-z0-9_]{1,63}$/', $name)) {
            continue;
        }

        $type = normalizeFieldType($row['field_type']);
        $options = decodeFieldOptions($row['field_options'] ?? '[]');

        if ($type === 'select' && !in_array('', $options, true)) {
            array_unshift($options, '');
        }

        $isDefault = array_key_exists($name, $defaultMeta);
        $definition = [
            'name'          => $name,
            'key'           => $name,
            'label'         => $row['field_label'] ?: ($defaultMeta[$name]['label'] ?? getGeneratedFieldLabel($name)),
            'type'          => $type,
            'options'       => $type === 'select' ? $options : [],
            'is_default'    => $isDefault,
            'removable'     => !$isDefault,
            'column_type'   => $columnByName[$name]['DATA_TYPE'],
            'display_order' => (int) $row['display_order'],
        ];

        if (!empty($defaultMeta[$name]['auto'])) {
            $definition['auto'] = true;
        }

        $fields[] = $definition;
    }

    return $fields;
}

/**
 * Retorna os campos editáveis da tabela lead_negocios, preservando a ordem real
 * das colunas no banco e excluindo colunas internas de controle.
 *
 * @return array Lista de colunas editáveis.
 */
function getLeadNegocioFields()
{
    $config = loadConfig(__DIR__ . '/db.conf');
    $dbName = $config['DB_NAME'] ?? '';

    $stmt = getDb()->prepare("
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = :db_name
          AND TABLE_NAME   = 'lead_negocios'
        ORDER BY ORDINAL_POSITION ASC
    ");
    $stmt->execute(['db_name' => $dbName]);

    $systemColumns = ['id', 'created_at', 'updated_at'];
    $fields = [];

    foreach ($stmt->fetchAll() as $column) {
        $name = $column['COLUMN_NAME'];
        if (in_array($name, $systemColumns, true)) {
            continue;
        }
        if (preg_match('/^[a-z][a-z0-9_]{1,63}$/', $name)) {
            $fields[] = $name;
        }
    }

    return $fields;
}

/**
 * Sanitiza um nome de coluna MySQL, permitindo apenas letras minúsculas,
 * números e underscores. Rejeita nomes reservados do MySQL e limita
 * o comprimento a 64 caracteres (limite do MySQL para identificadores).
 *
 * Usada por add_field.php e remove_field.php antes de executar ALTER TABLE,
 * como proteção contra SQL injection em identificadores dinâmicos.
 *
 * @param  string $name Nome da coluna a ser sanitizado.
 * @return string       Nome sanitizado em letras minúsculas.
 * @throws InvalidArgumentException Se o nome for inválido ou reservado.
 */
function sanitizeColumnName($name)
{
    // Palavras reservadas do MySQL que não podem ser usadas como nomes de coluna
    $reserved = [
        'select', 'insert', 'update', 'delete', 'drop', 'alter', 'create',
        'table', 'index', 'from', 'where', 'join', 'order', 'group', 'by',
        'having', 'limit', 'offset', 'and', 'or', 'not', 'null', 'true',
        'false', 'int', 'varchar', 'text', 'timestamp', 'primary', 'key',
        'id', 'conversation_id', 'source_platform', 'source_conversation_id',
        'created_at', 'updated_at'
    ];

    $name = strtolower(trim($name));

    // Permite apenas letras minúsculas, números e underscores
    if (!preg_match('/^[a-z][a-z0-9_]{1,63}$/', $name)) {
        throw new InvalidArgumentException(
            'Nome de campo inválido. Use apenas letras minúsculas, números e underscores (mínimo 2 caracteres).'
        );
    }

    // Bloqueia nomes reservados
    if (in_array($name, $reserved, true)) {
        throw new InvalidArgumentException(
            "O nome '{$name}' é reservado e não pode ser usado como campo."
        );
    }

    return $name;
}
