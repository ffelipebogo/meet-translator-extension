/**
 * Background Service Worker - Google Meet Live Translator
 * Gerencia o ciclo de vida da extensão e atalhos de teclado
 */

// ============================================
// INSTALAÇÃO E ATUALIZAÇÃO
// ============================================

/**
 * Listener de instalação da extensão
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Meet Translator: Extensão instalada/atualizada', details.reason);
  
  if (details.reason === 'install') {
    // Primeira instalação - define configurações padrão
    chrome.storage.local.set({
      apiType: 'google',
      targetLanguage: 'pt',
      isActive: false,
      translationHistory: [],
      translationStats: {
        totalTranslations: 0,
        lastUpdated: new Date().toISOString()
      }
    });
    
    console.log('Meet Translator: Configurações padrão definidas');
  }
  
  if (details.reason === 'update') {
    console.log('Meet Translator: Atualizado para versão', chrome.runtime.getManifest().version);
  }
});

// ============================================
// GERENCIAMENTO DE BADGES
// ============================================

/**
 * Atualiza o badge do ícone da extensão
 */
function updateBadge(isActive, tabId = null) {
  const badgeText = isActive ? 'ON' : '';
  const badgeColor = isActive ? '#34c759' : '#ff5252';
  
  if (tabId) {
    chrome.action.setBadgeText({ text: badgeText, tabId });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
  } else {
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });
  }
}

// ============================================
// COMUNICAÇÃO
// ============================================

/**
 * Listener de mensagens do content script e popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Atualização de status do content script
  if (message.type === 'statusUpdate') {
    const tabId = sender.tab?.id;
    updateBadge(message.isActive, tabId);
    chrome.storage.local.set({ isActive: message.isActive });
  }
  
  // Log de debug
  if (message.type === 'debug') {
    console.log('Meet Translator Debug:', message.data);
  }
  
  // Requisição de tradução do content script (se precisar fazer no background)
  if (message.type === 'translate') {
    // Por agora, as traduções são feitas no content script
    // Mas podemos mover para cá se necessário
    sendResponse({ error: 'Use content script for translations' });
  }
  
  return true;
});

// ============================================
// ATALHOS DE TECLADO
// ============================================

/**
 * Listener de comandos (atalhos de teclado)
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-translation') {
    console.log('Meet Translator: Atalho de teclado acionado');
    
    // Obtém a aba ativa
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url?.includes('meet.google.com')) {
      // Envia comando de toggle para o content script
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'toggleTranslation' });
      } catch (error) {
        console.error('Meet Translator: Erro ao enviar comando:', error);
      }
    }
  }
});

// ============================================
// MONITORAMENTO DE ABAS
// ============================================

/**
 * Listener de atualização de abas
 * Limpa o badge quando a aba muda de URL
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    // Se não é mais o Meet, limpa o badge
    if (!changeInfo.url.includes('meet.google.com')) {
      updateBadge(false, tabId);
    }
  }
});

/**
 * Listener de troca de aba ativa
 * Atualiza o badge baseado no estado da aba
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    
    if (tab.url?.includes('meet.google.com')) {
      // Tenta obter o status do content script
      try {
        const response = await chrome.tabs.sendMessage(activeInfo.tabId, { type: 'checkStatus' });
        updateBadge(response?.isActive || false, activeInfo.tabId);
      } catch {
        // Content script não está pronto ainda
        updateBadge(false, activeInfo.tabId);
      }
    } else {
      updateBadge(false, activeInfo.tabId);
    }
  } catch (error) {
    console.error('Meet Translator: Erro ao verificar aba:', error);
  }
});

// ============================================
// INICIALIZAÇÃO
// ============================================

console.log('Meet Translator: Background service worker iniciado');

