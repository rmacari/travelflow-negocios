<?php
/**
 * =============================================================================
 * Travel Flow Negocios — get_fields.php
 * =============================================================================
 * Endpoint da API para listagem das colunas atuais da tabela lead_negocios.
 *
 * Retorna todas as colunas da tabela, separando os campos padrão (fixos,
 * não removíveis) dos campos personalizados (criados pelo usuário).
 * Usado pela interface de configuração de campos da extensão para montar
 * dinamicamente o formulário de negócios.
 *
 * Método:   GET
 * Header:   X-Admin-Key (obrigatório — somente administradores)
 * Resposta: JSON { success: true, fields: [...] } onde cada item contém:
 *           { name, label, type, is_default, removable }
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
// CAMPOS PADRÃO DO SISTEMA
// Estes campos são fixos — existem sempre na tabela e não podem ser removidos
// pela interface de configuração (apenas renomeados e reordenados).
// ---------------------------------------------------------------------------
$defaultFields = [
    'nome_lead', 'email', 'destino', 'data_viagem', 'duracao_viagem',
    'numero_viajantes', 'idade_viajantes', 'cidade_origem', 'orcamento',
    'tipo_compra', 'prioridade_valor', 'quando_reservar', 'observacoes'
];

// Colunas internas de controle — nunca expostas na interface
$systemColumns = ['id', 'conversation_id', 'created_at', 'updated_at'];

// ---------------------------------------------------------------------------
// CONSULTA DAS COLUNAS ATUAIS DO BANCO
// Usa INFORMATION_SCHEMA para listar todas as colunas da tabela,
// preservando a ordem definida no banco (ORDINAL_POSITION).
// ---------------------------------------------------------------------------
try {
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
    $columns = $stmt->fetchAll();

    $fields = [];

    foreach ($columns as $col) {
        $name = $col['COLUMN_NAME'];

        // Ignora colunas internas de controle
        if (in_array($name, $systemColumns, true)) continue;

        $isDefault = in_array($name, $defaultFields, true);

        $fields[] = [
            'name'      => $name,
            'type'      => $col['DATA_TYPE'],   // varchar ou text
            'is_default' => $isDefault,
            'removable' => !$isDefault,          // apenas campos personalizados são removíveis
        ];
    }

    echo json_encode([
        'success' => true,
        'fields'  => $fields,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao buscar campos.',
        'error'   => $e->getMessage()
    ]);
}
