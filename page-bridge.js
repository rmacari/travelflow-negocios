/**
 * =============================================================================
 * Travel Flow Negocios — page-bridge.js
 * =============================================================================
 * Script de detecção de mudança de atendimento no Travel Flow CRM.
 *
 * O Travel Flow é um SPA (Single Page Application) que navega entre
 * atendimentos sem recarregar a página, alterando apenas a query string da URL
 * (parâmetro conversationId). Este script monitora essas mudanças e dispara
 * o evento customizado 'tfq:conversation-change' para que o content.js possa
 * recarregar os negócios do novo atendimento sem intervenção manual.
 *
 * Estratégia multi-camada para garantir detecção confiável:
 *   1. Interceptação de history.pushState e history.replaceState
 *   2. Evento popstate (navegação com botões voltar/avançar)
 *   3. Evento focus (retorno à aba após troca de janela)
 *   4. Listener de click com delays escalonados (80ms, 250ms, 700ms)
 *   5. setInterval de 500ms como fallback final
 *
 * O evento só é disparado quando o conversationId realmente muda, evitando
 * emissões duplicadas desnecessárias.
 *
 * Autor:   Ricardo Macari
 * Contato: macari@gmail.com
 * Projeto: Travel Flow Negocios
 * =============================================================================
 */

(function () {

  // ---------------------------------------------------------------------------
  // ESTADO INTERNO
  // Armazena o último conversationId emitido para evitar eventos duplicados.
  // ---------------------------------------------------------------------------
  let lastId = null;

  // ---------------------------------------------------------------------------
  // LEITURA DO conversationId
  // ---------------------------------------------------------------------------

  /**
   * Lê o parâmetro conversationId da query string da URL atual.
   * Retorna string vazia se não encontrado.
   * @returns {string}
   */
  function getConversationId() {
    return new URL(window.location.href).searchParams.get('conversationId') || '';
  }

  // ---------------------------------------------------------------------------
  // EMISSÃO DO EVENTO DE MUDANÇA
  // ---------------------------------------------------------------------------

  /**
   * Verifica se o conversationId mudou desde a última emissão e, se sim,
   * dispara o evento customizado 'tfq:conversation-change' na window.
   *
   * A verificação de rota (/atendimento-web) garante que o evento só seja
   * emitido na página de atendimento, evitando disparos desnecessários em
   * outras partes do CRM.
   *
   * @param {string} source - Identificador da origem do disparo (para debug).
   */
  function emitChange(source) {
    // Só emite na página de atendimento
    if (!window.location.pathname.includes('/atendimento-web')) return;

    const conversationId = getConversationId();

    // Só emite se houver ID e se ele for diferente do último emitido
    if (!conversationId || conversationId === lastId) return;

    lastId = conversationId;

    window.dispatchEvent(new CustomEvent('tfq:conversation-change', {
      detail: {
        conversationId,
        href: window.location.href,
        source
      }
    }));
  }

  // ---------------------------------------------------------------------------
  // INTERCEPTAÇÃO DO HISTORY API
  // Captura navegações programáticas do SPA que não disparam eventos nativos.
  // ---------------------------------------------------------------------------

  const originalPushState    = history.pushState;
  const originalReplaceState = history.replaceState;

  /**
   * Intercepta history.pushState para detectar navegações do SPA.
   * Dois disparos com delay (0ms e 150ms) garantem que a URL já foi
   * atualizada quando emitChange for executado.
   */
  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    setTimeout(() => emitChange('pushState'),      0);
    setTimeout(() => emitChange('pushState:150'), 150);
    return result;
  };

  /**
   * Intercepta history.replaceState para detectar substituições de URL pelo SPA.
   */
  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    setTimeout(() => emitChange('replaceState'),      0);
    setTimeout(() => emitChange('replaceState:150'), 150);
    return result;
  };

  // ---------------------------------------------------------------------------
  // LISTENERS DE EVENTOS NATIVOS
  // Cobrem cenários não capturados pela interceptação do History API.
  // ---------------------------------------------------------------------------

  // Navegação com botões voltar/avançar do browser
  window.addEventListener('popstate', () => emitChange('popstate'));

  // Retorno ao foco da aba após troca de janela ou aba
  window.addEventListener('focus', () => emitChange('focus'));

  /**
   * Listener de clique com delays escalonados para cobrir casos em que
   * a URL é atualizada de forma assíncrona após a interação do usuário.
   * Usa capture: true para interceptar antes de outros handlers.
   */
  document.addEventListener('click', () => {
    setTimeout(() => emitChange('click:80'),  80);
    setTimeout(() => emitChange('click:250'), 250);
    setTimeout(() => emitChange('click:700'), 700);
  }, true);

  // ---------------------------------------------------------------------------
  // FALLBACK POR INTERVALO
  // Garante detecção mesmo em fluxos não cobertos pelos eventos acima.
  // O intervalo só executa na página de atendimento (verificado em emitChange).
  // ---------------------------------------------------------------------------
  setInterval(() => emitChange('interval'), 500);

  // Disparo inicial ao carregar o script
  emitChange('init');

})();
