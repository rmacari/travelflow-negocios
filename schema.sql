-- =============================================================================
-- Travel Flow Negócios — schema.sql
-- =============================================================================
-- Script de criação da tabela principal do sistema no MySQL.
--
-- A tabela lead_negocios armazena múltiplos negócios vinculados a um
-- atendimento do Travel Flow CRM, identificado pelo conversation_id.
-- Cada negócio representa uma cotação ou interesse de viagem distinto
-- do mesmo lead, permitindo que o operador gerencie várias propostas
-- simultaneamente dentro de um único atendimento.
--
-- Autor:   Ricardo Macari
-- Contato: macari@gmail.com
-- Projeto: Travel Flow Negócios
-- =============================================================================

CREATE TABLE IF NOT EXISTS lead_negocios (

    -- -------------------------------------------------------------------------
    -- IDENTIFICAÇÃO
    -- -------------------------------------------------------------------------

    -- Chave primária com incremento automático, única por negócio
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    -- ID do atendimento no Travel Flow CRM (parâmetro conversationId da URL).
    -- Vínculo principal entre a extensão e os negócios armazenados.
    conversation_id VARCHAR(191) NOT NULL,

    -- -------------------------------------------------------------------------
    -- DADOS DO LEAD
    -- -------------------------------------------------------------------------

    -- Nome completo do lead, lido automaticamente do DOM da página de atendimento
    nome_lead VARCHAR(255) NOT NULL DEFAULT '',

    -- E-mail do lead
    email VARCHAR(255) NOT NULL DEFAULT '',

    -- -------------------------------------------------------------------------
    -- DADOS DO NEGÓCIO
    -- Todos os campos de texto aceitam string vazia como valor padrão,
    -- pois o preenchimento parcial é comum durante o atendimento.
    -- -------------------------------------------------------------------------

    -- Destino da viagem (cidade, país ou região)
    destino VARCHAR(255) NOT NULL DEFAULT '',

    -- Status comercial do negócio
    status_negocio VARCHAR(100) NOT NULL DEFAULT '',

    -- Temperatura comercial do lead: Frio, Morno, Quente
    temperatura_lead VARCHAR(100) NOT NULL DEFAULT '',

    -- Próxima data combinada para contato ou retorno
    proximo_contato VARCHAR(100) NOT NULL DEFAULT '',

    -- Valor estimado do negócio
    valor_estimado VARCHAR(100) NOT NULL DEFAULT '',

    -- Pessoa responsável pelo acompanhamento
    responsavel VARCHAR(255) NOT NULL DEFAULT '',

    -- Data ou estimativa de viagem em texto livre (ex: "setembro de 2026")
    data_viagem VARCHAR(100) NOT NULL DEFAULT '',

    -- Duração da viagem (ex: "7 noites", "10 dias")
    duracao_viagem VARCHAR(100) NOT NULL DEFAULT '',

    -- Quantidade de viajantes
    numero_viajantes VARCHAR(100) NOT NULL DEFAULT '',

    -- Idades dos viajantes (ex: "45, 42, 17")
    idade_viajantes VARCHAR(255) NOT NULL DEFAULT '',

    -- Cidade de origem / embarque
    cidade_origem VARCHAR(255) NOT NULL DEFAULT '',

    -- Orçamento estimado pelo lead
    orcamento VARCHAR(100) NOT NULL DEFAULT '',

    -- Tipo de produto: Pacote completo, Aéreo + Hotel, Só hotel, etc.
    tipo_compra VARCHAR(100) NOT NULL DEFAULT '',

    -- Prioridade de valor do lead: Preço, Custo-Benefício, Conforto, etc.
    prioridade_valor VARCHAR(100) NOT NULL DEFAULT '',

    -- Intenção de compra: Hoje, Esta semana, Este mês, etc.
    quando_reservar VARCHAR(100) NOT NULL DEFAULT '',

    -- Observações livres sobre o negócio ou o lead (texto longo)
    observacoes TEXT NULL,

    -- -------------------------------------------------------------------------
    -- CONTROLE DE DATAS
    -- Preenchidos automaticamente pelo MySQL.
    -- -------------------------------------------------------------------------

    -- Data e hora de criação do registro
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Data e hora da última atualização (atualizado automaticamente no UPDATE)
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- -------------------------------------------------------------------------
    -- ÍNDICES
    -- -------------------------------------------------------------------------

    PRIMARY KEY (id),

    -- Índice simples para buscas por conversation_id (get_negocios.php)
    KEY idx_conversation_id (conversation_id),

    -- Índice composto para ordenação por data de atualização por atendimento
    KEY idx_conversation_updated (conversation_id, updated_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_negocio_field_config (

    -- Nome da coluna real em lead_negocios
    field_name VARCHAR(64) NOT NULL,

    -- Rótulo exibido no formulário da extensão
    field_label VARCHAR(255) NOT NULL DEFAULT '',

    -- Tipo visual do campo: text, textarea, select, date, number ou currency
    field_type VARCHAR(20) NOT NULL DEFAULT 'text',

    -- Opções do tipo select em JSON
    field_options TEXT NULL,

    -- Ordem de exibição no formulário
    display_order INT UNSIGNED NOT NULL DEFAULT 0,

    -- Data da última alteração da configuração
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (field_name)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
