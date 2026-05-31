-- =============================================================================
-- Travel Flow Negocios — migrate_v2.sql
-- =============================================================================
-- Script de migração para quem já possui a tabela lead_negocios criada
-- e precisa adicionar os novos campos da versão 2.
--
-- Execute este script APENAS se o banco já existir com a estrutura anterior.
-- Se estiver instalando do zero, use o schema.sql diretamente.
--
-- Autor:   Ricardo Macari
-- Contato: macari@gmail.com
-- Projeto: Travel Flow Negocios
-- =============================================================================

-- Adiciona o campo nome do lead (lido automaticamente do DOM)
ALTER TABLE lead_negocios
  ADD COLUMN nome_lead VARCHAR(255) NOT NULL DEFAULT '' AFTER conversation_id;

-- Adiciona o campo e-mail do lead
ALTER TABLE lead_negocios
  ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT '' AFTER nome_lead;

-- Adiciona o campo idade dos viajantes
ALTER TABLE lead_negocios
  ADD COLUMN idade_viajantes VARCHAR(255) NOT NULL DEFAULT '' AFTER numero_viajantes;

-- Adiciona o campo prioridade de valor
ALTER TABLE lead_negocios
  ADD COLUMN prioridade_valor VARCHAR(100) NOT NULL DEFAULT '' AFTER tipo_compra;

-- Adiciona o campo observações (texto longo)
ALTER TABLE lead_negocios
  ADD COLUMN observacoes TEXT NOT NULL DEFAULT '' AFTER quando_reservar;

-- Remove o campo nome_negocio que foi substituído por nome_lead
-- ATENÇÃO: execute esta linha somente após confirmar que não há dados
-- importantes nesta coluna que precisem ser migrados.
ALTER TABLE lead_negocios
  DROP COLUMN nome_negocio;
