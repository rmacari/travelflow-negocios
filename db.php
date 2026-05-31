<?php
/**
 * =============================================================================
 * Travel Flow Negocios — db.php
 * =============================================================================
 * Módulo de conexão com o banco de dados MySQL e configuração de CORS.
 *
 * Fornece funções utilitárias usadas por todos os endpoints da API:
 *   - loadConfig():    lê as credenciais do arquivo db.conf
 *   - getDb():         retorna uma instância PDO singleton da conexão
 *   - sendCors():      emite os headers HTTP necessários para CORS e
 *                      encerra requisições OPTIONS (preflight) imediatamente
 *   - validateApiKey(): valida a chave secreta enviada no header da requisição
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Travel Flow Negocios
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
    $origin = $config['ALLOWED_ORIGIN'] ?? 'https://travelflow.tur.br';

    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: '  . $origin);
    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Api-Key');

    // Responde preflight CORS sem processar a lógica do endpoint
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Valida a chave secreta enviada no header X-Api-Key da requisição.
 *
 * Usada pelos endpoints de gerenciamento de campos (add_field, remove_field,
 * get_fields) para impedir que qualquer visitante possa alterar a estrutura
 * do banco de dados.
 *
 * A chave esperada é definida na chave API_KEY do arquivo db.conf.
 * A comparação usa hash_equals() para evitar ataques de timing.
 *
 * Em caso de chave ausente ou inválida, retorna 401 e encerra a execução.
 */
function validateApiKey()
{
    $config     = loadConfig(__DIR__ . '/db.conf');
    $expected   = $config['API_KEY'] ?? '';
    $received   = $_SERVER['HTTP_X_API_KEY'] ?? '';

    if ($expected === '' || !hash_equals($expected, $received)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Chave de API inválida ou ausente.']);
        exit;
    }
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
        'id', 'conversation_id', 'created_at', 'updated_at'
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
