<?php
/**
 * =============================================================================
 * Travel Flow Negocios — get_form_fields.php
 * =============================================================================
 * Endpoint da API para listar os campos editáveis do formulário de negócios.
 *
 * Método:  GET
 * Header:  X-Api-Key (obrigatório)
 * Resposta: JSON { success: true, fields: [...] }
 *           ou  { success: false, message }
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
validateApiKey();

$defaultLabels = [
    'nome_lead'        => 'Nome do Lead',
    'email'            => 'Email',
    'destino'          => 'Destino',
    'data_viagem'      => 'Data da Viagem',
    'duracao_viagem'   => 'Duração da Viagem',
    'numero_viajantes' => 'Nº de Viajantes',
    'idade_viajantes'  => 'Idade dos Viajantes',
    'cidade_origem'    => 'Cidade de Origem',
    'orcamento'        => 'Orçamento',
    'tipo_compra'      => 'Tipo de Compra',
    'prioridade_valor' => 'Prioridade de Valor',
    'quando_reservar'  => 'Quando Pretende Reservar',
    'observacoes'      => 'Observações',
];

$selectOptions = [
    'tipo_compra' => ['', 'Pacote completo', 'Aéreo + Hotel', 'Só hotel', 'Só aéreo', 'Cruzeiro', 'Seguro', 'Outro'],
    'prioridade_valor' => ['', 'Preço', 'Custo-Benefício', 'Conforto', 'Experiências', 'Luxo'],
    'quando_reservar' => ['', 'Hoje', 'Esta semana', 'Este mês', 'Em 30 dias', 'Só pesquisando'],
];

try {
    $fields = [];

    foreach (getLeadNegocioFields() as $fieldName) {
        if ($fieldName === 'conversation_id') {
            continue;
        }

        $field = [
            'key'   => $fieldName,
            'label' => $defaultLabels[$fieldName] ?? ucwords(str_replace('_', ' ', $fieldName)),
            'type'  => $fieldName === 'observacoes' ? 'textarea' : 'text',
        ];

        if ($fieldName === 'nome_lead') {
            $field['auto'] = true;
        }

        if (isset($selectOptions[$fieldName])) {
            $field['type']    = 'select';
            $field['options'] = $selectOptions[$fieldName];
        }

        $fields[] = $field;
    }

    echo json_encode(['success' => true, 'fields' => $fields]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao buscar campos do formulário.',
        'error'   => $e->getMessage()
    ]);
}
