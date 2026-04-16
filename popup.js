/**
 * Popup Script - Google Meet Live Translator
 * Gerencia a interface do popup e comunicação com content script
 */

(function() {
  'use strict';

  // ============================================
  // ELEMENTOS DO DOM
  // ============================================
  
  const elements = {
    // Status
    statusBadge: document.getElementById('status-badge'),
    notInMeetAlert: document.getElementById('not-in-meet-alert'),
    
    // API de Tradução
    apiSelect: document.getElementById('api-select'),
    apiKeyGroup: document.getElementById('api-key-group'),
    apiKeyInput: document.getElementById('api-key'),
    toggleKeyVisibility: document.getElementById('toggle-key-visibility'),
    saveApiBtn: document.getElementById('save-api-btn'),
    apiStatusIndicator: document.getElementById('api-status-indicator'),
    apiStatusText: document.getElementById('api-status-text'),
    
    // Idioma
    languageSelect: document.getElementById('language-select'),
    
    // Opções de Exibição
    showOriginalToggle: document.getElementById('show-original-toggle'),
    
    // Controles
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn'),
    
    // Estatísticas
    statTranslations: document.getElementById('stat-translations'),
    statCache: document.getElementById('stat-cache'),
    
    // Ações
    exportBtn: document.getElementById('export-btn'),
    clearCacheBtn: document.getElementById('clear-cache-btn')
  };

  // ============================================
  // ESTADO
  // ============================================
  
  let currentTab = null;
  let isInMeet = false;
  let isActive = false;

  // ============================================
  // FUNÇÕES UTILITÁRIAS
  // ============================================

  /**
   * Obtém a aba ativa do navegador
   */
  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  /**
   * Verifica se a aba atual é do Google Meet
   */
  function checkIfMeet(tab) {
    return tab?.url?.includes('meet.google.com');
  }

  /**
   * Injeta os content scripts na aba atual (útil quando a aba foi aberta antes da extensão).
   */
  async function injectContentScripts() {
    if (!currentTab?.id || !checkIfMeet(currentTab)) return false;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['config.js', 'content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: currentTab.id },
        files: ['styles.css']
      });
      return true;
    } catch (err) {
      console.warn('Meet Translator: falha ao injetar content scripts', err);
      return false;
    }
  }

  /**
   * Envia mensagem para o content script.
   * Se o content script não existir (ex.: aba aberta antes de recarregar a extensão),
   * tenta injetar os scripts e reenviar.
   */
  async function sendMessage(message) {
    if (!currentTab?.id) return null;
    
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, message);
      return response;
    } catch (error) {
      const isNoReceiver = error?.message?.includes('Receiving end does not exist') ||
        error?.message?.includes('Could not establish connection');
      
      if (isNoReceiver && checkIfMeet(currentTab)) {
        const injected = await injectContentScripts();
        if (injected) {
          await new Promise(r => setTimeout(r, 300));
          try {
            return await chrome.tabs.sendMessage(currentTab.id, message);
          } catch (retryError) {
            console.error('Erro ao enviar mensagem após injeção:', retryError);
            return null;
          }
        }
      }
      
      console.error('Erro ao enviar mensagem:', error);
      return null;
    }
  }

  /**
   * Salva configuração no storage
   */
  async function saveToStorage(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }

  /**
   * Carrega configuração do storage
   */
  async function loadFromStorage(keys) {
    return chrome.storage.local.get(keys);
  }

  // ============================================
  // ATUALIZAÇÃO DA UI
  // ============================================

  /**
   * Atualiza o badge de status
   */
  function updateStatusBadge(active) {
    isActive = active;
    const statusText = elements.statusBadge.querySelector('.status-text');
    
    if (active) {
      elements.statusBadge.classList.add('active');
      statusText.textContent = 'Ativo';
    } else {
      elements.statusBadge.classList.remove('active');
      statusText.textContent = 'Inativo';
    }
  }

  /**
   * Mostra/esconde botões de controle
   */
  function updateControlButtons(active) {
    if (active) {
      elements.startBtn.style.display = 'none';
      elements.stopBtn.style.display = 'flex';
    } else {
      elements.startBtn.style.display = 'flex';
      elements.stopBtn.style.display = 'none';
    }
  }

  /**
   * Habilita/desabilita controles baseado no estado
   */
  function setControlsEnabled(enabled) {
    elements.startBtn.disabled = !enabled;
    elements.stopBtn.disabled = !enabled;
    
    if (!enabled) {
      elements.startBtn.classList.add('disabled');
      elements.stopBtn.classList.add('disabled');
    } else {
      elements.startBtn.classList.remove('disabled');
      elements.stopBtn.classList.remove('disabled');
    }
  }

  /**
   * Mostra/esconde alerta de não estar no Meet
   */
  function showNotInMeetAlert(show) {
    elements.notInMeetAlert.style.display = show ? 'flex' : 'none';
  }

  /**
   * Atualiza o grupo de API Key baseado na API selecionada
   */
  function updateApiKeyVisibility() {
    const selectedApi = elements.apiSelect.value;
    const needsKey = selectedApi !== 'google';
    
    elements.apiKeyGroup.style.display = needsKey ? 'block' : 'none';
    elements.saveApiBtn.style.display = needsKey ? 'block' : 'none';
    
    if (needsKey) {
      updateApiStatus();
    }
  }

  /**
   * Atualiza o status da API
   */
  async function updateApiStatus() {
    const apiKey = elements.apiKeyInput.value;
    const hasKey = apiKey && apiKey.length > 10;
    
    if (hasKey) {
      elements.apiStatusIndicator.classList.add('configured');
      elements.apiStatusText.textContent = 'API configurada';
    } else {
      elements.apiStatusIndicator.classList.remove('configured');
      elements.apiStatusText.textContent = 'API não configurada';
    }
  }

  /**
   * Atualiza estatísticas
   */
  function updateStats(translations = 0, cache = 0) {
    elements.statTranslations.textContent = translations;
    elements.statCache.textContent = cache;
  }

  // ============================================
  // HANDLERS DE EVENTOS
  // ============================================

  /**
   * Handler de mudança de API
   */
  async function handleApiChange() {
    const selectedApi = elements.apiSelect.value;
    
    // Salva a seleção
    await saveToStorage(CONFIG.STORAGE_KEYS.API_TYPE, selectedApi);
    
    // Atualiza a visibilidade do campo de API Key
    updateApiKeyVisibility();
    
    // Carrega a API Key salva para esta API
    const keys = await loadFromStorage([`apiKey_${selectedApi}`]);
    const savedKey = keys[`apiKey_${selectedApi}`] || '';
    elements.apiKeyInput.value = savedKey;
    updateApiStatus();
    
    // Notifica o content script
    await sendMessage({ type: 'updateApiType', apiType: selectedApi });
    
    // Se já tem uma key salva, envia também
    if (savedKey) {
      await sendMessage({ type: 'updateApiKey', apiKey: savedKey });
    }
  }

  /**
   * Handler de salvar API Key
   */
  async function handleSaveApiKey() {
    const selectedApi = elements.apiSelect.value;
    const apiKey = elements.apiKeyInput.value.trim();
    
    // Salva no storage (específico por API)
    await saveToStorage(`apiKey_${selectedApi}`, apiKey);
    await saveToStorage(CONFIG.STORAGE_KEYS.API_KEY, apiKey);
    
    // Atualiza status
    updateApiStatus();
    
    // Notifica content script
    await sendMessage({ type: 'updateApiKey', apiKey });
    
    // Feedback visual
    const originalText = elements.saveApiBtn.innerHTML;
    elements.saveApiBtn.innerHTML = '✅ Salvo!';
    elements.saveApiBtn.disabled = true;
    
    setTimeout(() => {
      elements.saveApiBtn.innerHTML = originalText;
      elements.saveApiBtn.disabled = false;
    }, 2000);
  }

  /**
   * Handler de toggle visibilidade da API Key
   */
  function handleToggleKeyVisibility() {
    const input = elements.apiKeyInput;
    const isPassword = input.type === 'password';
    
    input.type = isPassword ? 'text' : 'password';
    elements.toggleKeyVisibility.textContent = isPassword ? '🙈' : '👁️';
  }

  /**
   * Handler de mudança de idioma
   */
  async function handleLanguageChange() {
    const selectedLang = elements.languageSelect.value;
    
    // Salva a seleção
    await saveToStorage(CONFIG.STORAGE_KEYS.TARGET_LANGUAGE, selectedLang);
    
    // Notifica content script
    await sendMessage({ type: 'updateLanguage', language: selectedLang });
  }

  /**
   * Handler de toggle mostrar texto original
   */
  async function handleShowOriginalChange() {
    const showOriginal = elements.showOriginalToggle.checked;
    
    // Salva a configuração
    await saveToStorage(CONFIG.STORAGE_KEYS.SHOW_ORIGINAL, showOriginal);
    
    // Notifica content script
    await sendMessage({ type: 'updateShowOriginal', showOriginal: showOriginal });
  }

  /**
   * Handler de iniciar tradução
   */
  async function handleStartTranslation() {
    const selectedApi = elements.apiSelect.value;
    
    // Verifica se API Key de tradução é necessária
    if (selectedApi !== 'google') {
      const apiKey = elements.apiKeyInput.value.trim();
      if (!apiKey || apiKey.length < 10) {
        alert('Por favor, configure sua API Key de tradução antes de iniciar.');
        return;
      }
    }
    
    // Envia comando para iniciar com todas as configurações
    const response = await sendMessage({ 
      type: 'startTranslation',
      translationAPI: selectedApi,
      translationApiKey: elements.apiKeyInput.value.trim(),
      targetLanguage: elements.languageSelect.value
    });
    
    if (response?.success) {
      updateStatusBadge(true);
      updateControlButtons(true);
      await saveToStorage(CONFIG.STORAGE_KEYS.IS_ACTIVE, true);
    } else if (response?.error) {
      alert('Erro ao iniciar: ' + response.error);
    } else if (response === null) {
      alert('Não foi possível conectar à página do Meet. Recarregue a aba do Meet (F5) e tente novamente.');
    }
  }

  /**
   * Handler de parar tradução
   */
  async function handleStopTranslation() {
    const response = await sendMessage({ type: 'stopTranslation' });

    updateStatusBadge(false);
    updateControlButtons(false);
    await saveToStorage(CONFIG.STORAGE_KEYS.IS_ACTIVE, false);

    if (!response?.success) {
      try {
        await chrome.runtime.sendMessage({ type: 'statusUpdate', isActive: false });
      } catch (_) {
        /* ignore */
      }
    }
  }

  /**
   * Handler de exportar histórico
   */
  async function handleExport() {
    await sendMessage({ type: 'exportHistory', format: 'json' });
    
    // Feedback visual
    const originalText = elements.exportBtn.innerHTML;
    elements.exportBtn.innerHTML = '✅ Exportado!';
    
    setTimeout(() => {
      elements.exportBtn.innerHTML = originalText;
    }, 2000);
  }

  /**
   * Handler de limpar cache
   */
  async function handleClearCache() {
    await sendMessage({ type: 'clearCache' });
    
    // Atualiza estatísticas
    updateStats(parseInt(elements.statTranslations.textContent) || 0, 0);
    
    // Feedback visual
    const originalText = elements.clearCacheBtn.innerHTML;
    elements.clearCacheBtn.innerHTML = '✅ Limpo!';
    
    setTimeout(() => {
      elements.clearCacheBtn.innerHTML = originalText;
    }, 2000);
  }

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  /**
   * Carrega configurações salvas
   */
  async function loadSavedSettings() {
    const settings = await loadFromStorage([
      CONFIG.STORAGE_KEYS.API_TYPE,
      CONFIG.STORAGE_KEYS.TARGET_LANGUAGE,
      CONFIG.STORAGE_KEYS.IS_ACTIVE,
      CONFIG.STORAGE_KEYS.STATS,
      CONFIG.STORAGE_KEYS.SHOW_ORIGINAL
    ]);
    
    // API Type de Tradução
    const apiType = settings[CONFIG.STORAGE_KEYS.API_TYPE] || 'google';
    elements.apiSelect.value = apiType;
    updateApiKeyVisibility();
    
    // Carrega API Key específica
    const apiKeySettings = await loadFromStorage([`apiKey_${apiType}`]);
    const savedApiKey = apiKeySettings[`apiKey_${apiType}`] || '';
    elements.apiKeyInput.value = savedApiKey;
    updateApiStatus();
    
    // Target Language
    const language = settings[CONFIG.STORAGE_KEYS.TARGET_LANGUAGE] || 'pt';
    elements.languageSelect.value = language;
    
    // Show Original (padrão: true)
    const showOriginal = settings[CONFIG.STORAGE_KEYS.SHOW_ORIGINAL];
    elements.showOriginalToggle.checked = showOriginal !== false; // true por padrão
    
    // Stats
    const stats = settings[CONFIG.STORAGE_KEYS.STATS] || {};
    updateStats(stats.totalTranslations || 0, 0);
  }

  /**
   * Verifica status atual do content script
   */
  async function checkContentStatus() {
    const response = await sendMessage({ type: 'checkStatus' });
    
    if (response) {
      updateStatusBadge(response.isActive);
      updateControlButtons(response.isActive);
      updateStats(response.translationCount || 0, 0);
    }
  }

  /**
   * Configura event listeners
   */
  function setupEventListeners() {
    // API de Tradução
    elements.apiSelect.addEventListener('change', handleApiChange);
    elements.saveApiBtn.addEventListener('click', handleSaveApiKey);
    elements.toggleKeyVisibility.addEventListener('click', handleToggleKeyVisibility);
    elements.apiKeyInput.addEventListener('input', updateApiStatus);
    
    // Idioma
    elements.languageSelect.addEventListener('change', handleLanguageChange);
    
    // Opções de Exibição
    elements.showOriginalToggle.addEventListener('change', handleShowOriginalChange);
    
    // Controles
    elements.startBtn.addEventListener('click', handleStartTranslation);
    elements.stopBtn.addEventListener('click', handleStopTranslation);
    
    // Ações
    elements.exportBtn.addEventListener('click', handleExport);
    elements.clearCacheBtn.addEventListener('click', handleClearCache);
  }

  /**
   * Inicializa o popup
   */
  async function init() {
    try {
      // Obtém a aba atual
      currentTab = await getCurrentTab();
      isInMeet = checkIfMeet(currentTab);
      
      // Atualiza UI baseado no estado
      if (!isInMeet) {
        showNotInMeetAlert(true);
        setControlsEnabled(false);
      } else {
        showNotInMeetAlert(false);
        setControlsEnabled(true);
        
        // Verifica status do content script
        await checkContentStatus();
      }
      
      // Carrega configurações salvas
      await loadSavedSettings();
      
      // Configura eventos
      setupEventListeners();
      
      console.log('Meet Translator Popup: Inicializado');
    } catch (error) {
      console.error('Erro ao inicializar popup:', error);
    }
  }

  // ============================================
  // LISTENER DE MENSAGENS
  // ============================================

  /**
   * Listener para atualizações do content script
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'statusUpdate') {
      updateStatusBadge(message.isActive);
      updateControlButtons(message.isActive);
    }
    
    if (message.type === 'statsUpdate') {
      updateStats(message.translations || 0, message.cache || 0);
    }
  });

  // Inicia o popup
  init();
})();

