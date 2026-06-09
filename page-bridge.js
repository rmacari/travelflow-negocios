/**
 * =============================================================================
 * Travel Flow Negócios — page-bridge.js
 * =============================================================================
 * Script de detecção de mudança de atendimento no Travel Flow CRM.
 *
 * O Travel Flow é um SPA (Single Page Application) que navega entre
 * atendimentos sem recarregar a página, alterando apenas a query string da URL
 * (parâmetro conversationId). Este script monitora essas mudanças e dispara
 * o evento customizado 'tfq:conversation-change' para que o content.js possa
 * recarregar os negócios do novo atendimento sem intervenção manual.
 *
 * O evento inclui o nome do lead capturado do DOM no momento da troca
 * (detail.leadName), permitindo que o content.js atualize o título do painel
 * imediatamente, antes mesmo de aguardar o loadNegocios terminar.
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
 * Projeto: Travel Flow Negócios
 * =============================================================================
 */

(function () {

  // ---------------------------------------------------------------------------
  // ESTADO INTERNO
  // Armazena o último conversationId emitido para evitar eventos duplicados.
  // ---------------------------------------------------------------------------
  let lastId = null;

  // ---------------------------------------------------------------------------
  // SELETOR DO NOME DO LEAD
  // Mesmo seletor usado pelo content.js — deve ser mantido em sincronia.
  // Identificado na interface do Travel Flow como h3.font-semibold.
  // ---------------------------------------------------------------------------
  const LEAD_NAME_SELECTOR = 'h3.font-semibold';

  // ---------------------------------------------------------------------------
  // LEITURA DO conversationId E NOME DO LEAD
  // ---------------------------------------------------------------------------

  /**
   * Lê o parâmetro conversationId da query string da URL atual.
   * Retorna string vazia se não encontrado.
   * @returns {string}
   */
  function getConversationId() {
    return new URL(window.location.href).searchParams.get('conversationId') || '';
  }

  /**
   * Tenta ler o nome do lead do DOM da página de atendimento.
   * Como o Travel Flow é um SPA, o elemento pode não estar atualizado
   * imediatamente após a troca de URL. Tenta até 6 vezes com delays
   * crescentes (0, 80, 200, 400, 700, 1200ms) antes de desistir.
   *
   * Chama o callback com o nome encontrado ou string vazia se não encontrar.
   *
   * @param {Function} callback - Função chamada com o nome do lead (string).
   */
  function getLeadNameAsync(callback) {
    const delays  = [0, 80, 200, 400, 700, 1200];
    let attempt   = 0;

    function tryRead() {
      const el   = document.querySelector(LEAD_NAME_SELECTOR);
      const name = el ? el.textContent.trim() : '';

      if (name) {
        callback(name);
        return;
      }

      attempt++;
      if (attempt < delays.length) {
        setTimeout(tryRead, delays[attempt]);
      } else {
        callback('');
      }
    }

    tryRead();
  }

  // ---------------------------------------------------------------------------
  // EMISSÃO DO EVENTO DE MUDANÇA
  // ---------------------------------------------------------------------------

  /**
   * Verifica se o conversationId mudou desde a última emissão e, se sim,
   * dispara o evento customizado 'tfq:conversation-change' na window,
   * incluindo o nome do lead capturado do DOM.
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

    // Captura o nome do lead de forma assíncrona com retentativas,
    // pois o SPA pode ainda não ter atualizado o DOM no momento do disparo
    getLeadNameAsync(leadName => {
      window.dispatchEvent(new CustomEvent('tfq:conversation-change', {
        detail: {
          conversationId,
          leadName,
          href:   window.location.href,
          source
        }
      }));
    });
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
