/**
 * Content Script - Google Meet Live Translator
 * Captura legendas do Google Meet e traduz em tempo real
 */

(function() {
  'use strict';

  // ============================================
  // ESTADO GLOBAL
  // ============================================
  
  let isActive = false;                    // Se a tradução está ativa
  let observer = null;                     // MutationObserver das legendas
  let translationBox = null;               // Elemento da caixa de tradução
  let currentApiType = CONFIG.APIS.GOOGLE; // API selecionada
  let currentApiKey = '';                  // Chave da API
  let targetLanguage = 'pt';               // Idioma alvo
  let lastCaptionText = '';                // Último texto capturado
  let lastSpeakerName = '';                // Último falante identificado
  let debounceTimer = null;                // Timer do debounce
  let translationCache = new Map();        // Cache de traduções
  let translationHistory = [];             // Histórico de traduções
  let translationCount = 0;                // Contador de traduções
  let isDragging = false;                  // Estado do drag
  let dragOffset = { x: 0, y: 0 };         // Offset do drag
  let isResizing = false;                  // Estado do resize
  let resizeDirection = '';                // Direção do resize
  let resizeStart = { x: 0, y: 0 };        // Posição inicial do resize
  let boxStartSize = { w: 0, h: 0 };       // Tamanho inicial ao começar resize
  let boxStartPos = { x: 0, y: 0 };        // Posição inicial ao começar resize
  let showOriginalText = true;             // Mostrar texto original (padrão: true)

  // ============================================
  // FUNÇÕES DE TRADUÇÃO
  // ============================================

  /**
   * Traduz texto usando Google Translate (gratuito)
   * @param {string} text - Texto para traduzir
   * @param {string} targetLang - Código do idioma alvo
   * @returns {Promise<string>} Texto traduzido
   */
  async function translateWithGoogle(text, targetLang) {
    const url = `${CONFIG.ENDPOINTS.GOOGLE}?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Google Translate error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // O resultado vem em um formato específico: [[["tradução","original",null,null,1]],...]
    if (data && data[0] && Array.isArray(data[0])) {
      return data[0].map(item => item[0]).join('');
    }
    
    throw new Error('Formato de resposta inválido do Google Translate');
  }

  /**
   * Traduz texto usando Claude API (Anthropic)
   * @param {string} text - Texto para traduzir
   * @param {string} targetLang - Código do idioma alvo
   * @param {string} apiKey - Chave da API Anthropic
   * @returns {Promise<string>} Texto traduzido
   */
  async function translateWithClaude(text, targetLang, apiKey) {
    const languageName = CONFIG.LANGUAGE_NAMES[targetLang] || targetLang;
    
    const response = await fetch(CONFIG.ENDPOINTS.CLAUDE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: CONFIG.MODELS.CLAUDE,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Translate the following text to ${languageName}. Respond with ONLY the translation, nothing else:\n\n${text}`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        throw new Error('INVALID_API_KEY');
      }
      if (response.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      throw new Error(`Claude API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    
    if (data.content && data.content[0] && data.content[0].text) {
      return data.content[0].text.trim();
    }
    
    throw new Error('Formato de resposta inválido da Claude API');
  }

  /**
   * Traduz texto usando OpenAI API
   * @param {string} text - Texto para traduzir
   * @param {string} targetLang - Código do idioma alvo
   * @param {string} apiKey - Chave da API OpenAI
   * @returns {Promise<string>} Texto traduzido
   */
  async function translateWithOpenAI(text, targetLang, apiKey) {
    const languageName = CONFIG.LANGUAGE_NAMES[targetLang] || targetLang;
    
    const response = await fetch(CONFIG.ENDPOINTS.OPENAI, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.MODELS.OPENAI,
        messages: [
          {
            role: 'system',
            content: `You are a translator. Translate the user's text to ${languageName}. Respond with ONLY the translation, nothing else.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 1024,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        throw new Error('INVALID_API_KEY');
      }
      if (response.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    }
    
    throw new Error('Formato de resposta inválido da OpenAI API');
  }

  /**
   * Função principal de tradução com retry
   * @param {string} text - Texto para traduzir
   * @returns {Promise<string>} Texto traduzido
   */
  async function translate(text) {
    // Verifica cache primeiro
    const cacheKey = `${currentApiType}-${targetLanguage}-${text}`;
    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    let lastError = null;
    
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      try {
        let translation;
        
        switch (currentApiType) {
          case CONFIG.APIS.GOOGLE:
            translation = await translateWithGoogle(text, targetLanguage);
            break;
          case CONFIG.APIS.CLAUDE:
            if (!currentApiKey) {
              throw new Error('NO_API_KEY');
            }
            translation = await translateWithClaude(text, targetLanguage, currentApiKey);
            break;
          case CONFIG.APIS.OPENAI:
            if (!currentApiKey) {
              throw new Error('NO_API_KEY');
            }
            translation = await translateWithOpenAI(text, targetLanguage, currentApiKey);
            break;
          default:
            translation = await translateWithGoogle(text, targetLanguage);
        }

        // Salva no cache
        if (translationCache.size >= CONFIG.CACHE_SIZE) {
          // Remove a entrada mais antiga
          const firstKey = translationCache.keys().next().value;
          translationCache.delete(firstKey);
        }
        translationCache.set(cacheKey, translation);

        // Salva no histórico
        addToHistory(text, translation);
        
        // Incrementa contador
        translationCount++;
        updateStats();

        return translation;
      } catch (error) {
        lastError = error;
        console.warn(`Tentativa ${attempt} falhou:`, error.message);
        
        // Se for erro de API key ou rate limit, não tenta novamente
        if (error.message === 'INVALID_API_KEY' || error.message === 'NO_API_KEY') {
          throw error;
        }
        
        if (attempt < CONFIG.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attempt));
        }
      }
    }
    
    throw lastError || new Error('Falha ao traduzir após múltiplas tentativas');
  }

  // ============================================
  // HISTÓRICO E ESTATÍSTICAS
  // ============================================

  /**
   * Adiciona tradução ao histórico
   */
  function addToHistory(original, translated, speaker = '') {
    const entry = {
      timestamp: new Date().toISOString(),
      speaker: speaker || lastSpeakerName || 'Desconhecido',
      original: original,
      translated: translated,
      api: currentApiType,
      targetLang: targetLanguage
    };
    
    translationHistory.unshift(entry);
    
    // Limita tamanho do histórico
    if (translationHistory.length > CONFIG.HISTORY_SIZE) {
      translationHistory = translationHistory.slice(0, CONFIG.HISTORY_SIZE);
    }
    
    // Salva no storage
    chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.HISTORY]: translationHistory });

    // Atualiza a lista de mensagens na UI
    if (translationBox) {
      renderHistoryList();
    }
  }

  /**
   * Atualiza estatísticas
   */
  function updateStats() {
    chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.STATS]: {
        totalTranslations: translationCount,
        lastUpdated: new Date().toISOString()
      }
    });
  }

  /**
   * Exporta histórico como JSON ou TXT
   */
  function exportHistory(format = 'json') {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(translationHistory, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meet-translations-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'txt') {
      const text = translationHistory.map(entry => 
        `[${entry.timestamp}]\n👤 ${entry.speaker || 'Desconhecido'}\nOriginal: ${entry.original}\nTradução: ${entry.translated}\n---`
      ).join('\n\n');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meet-translations-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // ============================================
  // INTERFACE DA CAIXA DE TRADUÇÃO
  // ============================================

  /**
   * Cria a caixa flutuante de tradução
   */
  function createTranslationBox() {
    if (translationBox) return;

    translationBox = document.createElement('div');
    translationBox.id = 'meet-translator-box';
    translationBox.innerHTML = `
      <div class="mt-header" id="mt-header">
        <div class="mt-title">
          <span class="mt-icon">🌐</span>
          <span>Meet Translator</span>
          <span class="mt-badge" id="mt-status-badge">Ativo</span>
        </div>
        <div class="mt-controls">
          <button class="mt-btn-icon" id="mt-export-btn" title="Exportar histórico">📥</button>
          <button class="mt-btn-icon" id="mt-close-btn" title="Fechar">✕</button>
        </div>
      </div>
      <div class="mt-content">
        <div class="mt-speaker-section" id="mt-speaker-section">
          <span class="mt-speaker-icon">🎤</span>
          <span class="mt-speaker-name" id="mt-speaker-name">Aguardando...</span>
        </div>
        <div class="mt-section mt-original">
          <div class="mt-label">Original</div>
          <div class="mt-text" id="mt-original-text">Aguardando legendas...</div>
        </div>
        <div class="mt-section mt-translated">
          <div class="mt-label">Tradução (${CONFIG.LANGUAGES[targetLanguage] || targetLanguage})</div>
          <div class="mt-text" id="mt-translated-text">-</div>
        </div>
        <div class="mt-loading" id="mt-loading" style="display: none;">
          <div class="mt-spinner"></div>
          <span>Traduzindo...</span>
        </div>
        <div class="mt-error" id="mt-error" style="display: none;"></div>
        <div class="mt-history-section" id="mt-history-section">
          <div class="mt-history-header">
            <span>Mensagens anteriores</span>
            <button class="mt-btn-icon mt-history-toggle" id="mt-history-toggle" title="Expandir/recolher histórico">▼</button>
          </div>
          <div class="mt-history-list" id="mt-history-list"></div>
        </div>
      </div>
      <div class="mt-footer">
        <span class="mt-stats" id="mt-stats">Traduções: 0</span>
        <span class="mt-api">API: ${currentApiType.toUpperCase()}</span>
      </div>
      
      <!-- Handles de redimensionamento -->
      <div class="mt-resize-handle mt-resize-n" data-direction="n"></div>
      <div class="mt-resize-handle mt-resize-s" data-direction="s"></div>
      <div class="mt-resize-handle mt-resize-e" data-direction="e"></div>
      <div class="mt-resize-handle mt-resize-w" data-direction="w"></div>
      <div class="mt-resize-handle mt-resize-ne" data-direction="ne"></div>
      <div class="mt-resize-handle mt-resize-nw" data-direction="nw"></div>
      <div class="mt-resize-handle mt-resize-se" data-direction="se"></div>
      <div class="mt-resize-handle mt-resize-sw" data-direction="sw"></div>
    `;

    document.body.appendChild(translationBox);

    // Carrega tamanho/posição salvos
    loadBoxSizeAndPosition();

    // Aplica configuração de mostrar/ocultar texto original
    updateOriginalTextVisibility(showOriginalText);

    // Event listeners
    setupDragAndDrop();
    setupResize();
    setupBoxEvents();

    // Preenche lista de mensagens anteriores
    renderHistoryList();

    // Animação de entrada
    requestAnimationFrame(() => {
      translationBox.classList.add('mt-visible');
    });
  }

  /**
   * Configura drag and drop da caixa
   */
  function setupDragAndDrop() {
    const header = document.getElementById('mt-header');
    if (!header) return;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.mt-btn-icon')) return;
      
      isDragging = true;
      const rect = translationBox.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      translationBox.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      
      // Limita às bordas da tela
      const maxX = window.innerWidth - translationBox.offsetWidth;
      const maxY = window.innerHeight - translationBox.offsetHeight;
      
      translationBox.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
      translationBox.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
      translationBox.style.right = 'auto';
      translationBox.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        if (translationBox) {
          translationBox.style.cursor = '';
        }
        // Salva posição após arrastar
        saveBoxSizeAndPosition();
      }
    });
  }

  /**
   * Configura redimensionamento da caixa
   */
  function setupResize() {
    const handles = translationBox.querySelectorAll('.mt-resize-handle');
    
    handles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        isResizing = true;
        resizeDirection = handle.dataset.direction;
        resizeStart = { x: e.clientX, y: e.clientY };
        
        const rect = translationBox.getBoundingClientRect();
        boxStartSize = { w: rect.width, h: rect.height };
        boxStartPos = { x: rect.left, y: rect.top };
        
        document.body.style.cursor = getResizeCursor(resizeDirection);
        translationBox.classList.add('mt-resizing');
      });
    });
    
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
  }
  
  /**
   * Retorna o cursor apropriado para a direção do resize
   */
  function getResizeCursor(direction) {
    const cursors = {
      'n': 'ns-resize',
      's': 'ns-resize',
      'e': 'ew-resize',
      'w': 'ew-resize',
      'ne': 'nesw-resize',
      'sw': 'nesw-resize',
      'nw': 'nwse-resize',
      'se': 'nwse-resize'
    };
    return cursors[direction] || 'default';
  }
  
  /**
   * Handler do movimento de resize
   */
  function handleResize(e) {
    if (!isResizing) return;
    
    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;
    
    let newWidth = boxStartSize.w;
    let newHeight = boxStartSize.h;
    let newLeft = boxStartPos.x;
    let newTop = boxStartPos.y;
    
    // Calcular novas dimensões baseado na direção
    if (resizeDirection.includes('e')) {
      newWidth = Math.max(CONFIG.UI.BOX_MIN_WIDTH, Math.min(CONFIG.UI.BOX_MAX_WIDTH, boxStartSize.w + deltaX));
    }
    if (resizeDirection.includes('w')) {
      const potentialWidth = boxStartSize.w - deltaX;
      if (potentialWidth >= CONFIG.UI.BOX_MIN_WIDTH && potentialWidth <= CONFIG.UI.BOX_MAX_WIDTH) {
        newWidth = potentialWidth;
        newLeft = boxStartPos.x + deltaX;
      }
    }
    if (resizeDirection.includes('s')) {
      newHeight = Math.max(CONFIG.UI.BOX_MIN_HEIGHT, Math.min(CONFIG.UI.BOX_MAX_HEIGHT, boxStartSize.h + deltaY));
    }
    if (resizeDirection.includes('n')) {
      const potentialHeight = boxStartSize.h - deltaY;
      if (potentialHeight >= CONFIG.UI.BOX_MIN_HEIGHT && potentialHeight <= CONFIG.UI.BOX_MAX_HEIGHT) {
        newHeight = potentialHeight;
        newTop = boxStartPos.y + deltaY;
      }
    }
    
    // Aplicar novas dimensões
    translationBox.style.width = `${newWidth}px`;
    translationBox.style.height = `${newHeight}px`;
    translationBox.style.left = `${newLeft}px`;
    translationBox.style.top = `${newTop}px`;
    translationBox.style.right = 'auto';
    translationBox.style.bottom = 'auto';
  }
  
  /**
   * Para o resize e salva o tamanho
   */
  function stopResize() {
    if (!isResizing) return;
    
    isResizing = false;
    resizeDirection = '';
    document.body.style.cursor = '';
    translationBox.classList.remove('mt-resizing');
    
    // Salva tamanho e posição
    saveBoxSizeAndPosition();
  }
  
  /**
   * Salva tamanho e posição da caixa
   */
  function saveBoxSizeAndPosition() {
    if (!translationBox) return;
    
    const rect = translationBox.getBoundingClientRect();
    
    chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.BOX_SIZE]: {
        width: rect.width,
        height: rect.height
      },
      [CONFIG.STORAGE_KEYS.BOX_POSITION]: {
        x: rect.left,
        y: rect.top
      }
    });
  }
  
  /**
   * Carrega tamanho e posição salvos da caixa
   */
  async function loadBoxSizeAndPosition() {
    try {
      const result = await chrome.storage.local.get([
        CONFIG.STORAGE_KEYS.BOX_SIZE,
        CONFIG.STORAGE_KEYS.BOX_POSITION
      ]);
      
      const savedSize = result[CONFIG.STORAGE_KEYS.BOX_SIZE];
      const savedPos = result[CONFIG.STORAGE_KEYS.BOX_POSITION];
      
      if (savedSize) {
        translationBox.style.width = `${savedSize.width}px`;
        // Só aplica altura se foi definida
        if (savedSize.height && savedSize.height > CONFIG.UI.BOX_MIN_HEIGHT) {
          translationBox.style.height = `${savedSize.height}px`;
        }
      }
      
      if (savedPos) {
        // Verifica se a posição ainda está visível na tela
        const maxX = window.innerWidth - (savedSize?.width || CONFIG.UI.BOX_WIDTH);
        const maxY = window.innerHeight - (savedSize?.height || 200);
        
        const x = Math.max(0, Math.min(savedPos.x, maxX));
        const y = Math.max(0, Math.min(savedPos.y, maxY));
        
        translationBox.style.left = `${x}px`;
        translationBox.style.top = `${y}px`;
        translationBox.style.right = 'auto';
        translationBox.style.bottom = 'auto';
      }
    } catch (error) {
      console.error('Erro ao carregar tamanho/posição:', error);
    }
  }

  /**
   * Configura eventos dos botões da caixa
   */
  function setupBoxEvents() {
    const closeBtn = document.getElementById('mt-close-btn');
    const exportBtn = document.getElementById('mt-export-btn');
    const historyToggle = document.getElementById('mt-history-toggle');
    const historySection = document.getElementById('mt-history-section');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        hideTranslationBox();
        stopTranslation();
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        exportHistory('json');
        showToast('Histórico exportado!');
      });
    }

    if (historyToggle && historySection) {
      historyToggle.addEventListener('click', () => {
        const list = document.getElementById('mt-history-list');
        const isCollapsed = historySection.classList.contains('mt-history-collapsed');
        if (isCollapsed) {
          historySection.classList.remove('mt-history-collapsed');
          historyToggle.textContent = '▼';
          historyToggle.title = 'Recolher histórico';
        } else {
          historySection.classList.add('mt-history-collapsed');
          historyToggle.textContent = '▶';
          historyToggle.title = 'Expandir histórico';
        }
      });
    }
  }

  /**
   * Mostra a caixa de tradução
   */
  function showTranslationBox() {
    if (!translationBox) {
      createTranslationBox();
    }
    translationBox.style.display = 'flex';
    translationBox.classList.add('mt-visible');
  }

  /**
   * Esconde a caixa de tradução
   */
  function hideTranslationBox() {
    if (translationBox) {
      translationBox.classList.remove('mt-visible');
      setTimeout(() => {
        if (translationBox) {
          translationBox.style.display = 'none';
        }
      }, CONFIG.UI.ANIMATION_DURATION);
    }
  }

  /**
   * Remove a caixa de tradução do DOM
   */
  function removeTranslationBox() {
    if (translationBox) {
      translationBox.remove();
      translationBox = null;
    }
  }

  /**
   * Atualiza o texto original na caixa
   */
  function updateOriginalText(text) {
    const element = document.getElementById('mt-original-text');
    if (element) {
      element.textContent = text || 'Aguardando legendas...';
    }
  }

  /**
   * Atualiza o texto traduzido na caixa
   */
  function updateTranslatedText(text) {
    const element = document.getElementById('mt-translated-text');
    if (element) {
      element.textContent = text || '-';
      // Atualiza o scroll para o final quando o texto preencher a área
      element.scrollTop = element.scrollHeight;
    }
  }

  /**
   * Atualiza o nome do falante na caixa
   */
  function updateSpeakerName(name) {
    const element = document.getElementById('mt-speaker-name');
    const section = document.getElementById('mt-speaker-section');
    
    if (element && name) {
      element.textContent = name;
      lastSpeakerName = name;
      
      // Adiciona animação de destaque quando muda o falante
      if (section) {
        section.classList.add('mt-speaker-highlight');
        setTimeout(() => {
          section.classList.remove('mt-speaker-highlight');
        }, 500);
      }
    }
  }

  /**
   * Atualiza a visibilidade da seção de texto original
   */
  function updateOriginalTextVisibility(show) {
    showOriginalText = show;
    const originalSection = translationBox?.querySelector('.mt-original');
    
    if (originalSection) {
      if (show) {
        originalSection.style.display = 'block';
        originalSection.classList.remove('mt-hidden');
      } else {
        originalSection.style.display = 'none';
        originalSection.classList.add('mt-hidden');
      }
    }
    // Atualiza a lista de histórico para mostrar/ocultar texto original nos itens
    renderHistoryList();
  }

  /**
   * Mostra/esconde loading
   */
  function setLoading(show) {
    const loading = document.getElementById('mt-loading');
    const translatedText = document.getElementById('mt-translated-text');
    
    if (loading) {
      loading.style.display = show ? 'flex' : 'none';
    }
    if (translatedText) {
      translatedText.style.opacity = show ? '0.5' : '1';
    }
  }

  /**
   * Mostra erro na caixa
   */
  function showError(message) {
    const errorElement = document.getElementById('mt-error');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
      setTimeout(() => {
        errorElement.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * Atualiza contador de estatísticas
   */
  function updateStatsDisplay() {
    const statsElement = document.getElementById('mt-stats');
    if (statsElement) {
      statsElement.textContent = `Traduções: ${translationCount}`;
    }
  }

  /**
   * Renderiza a lista de mensagens anteriores na caixa
   */
  function renderHistoryList() {
    const listEl = document.getElementById('mt-history-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    if (!translationHistory || translationHistory.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mt-history-empty';
      empty.textContent = 'Nenhuma mensagem anterior ainda.';
      listEl.appendChild(empty);
      return;
    }

    translationHistory.forEach((entry, index) => {
      const item = document.createElement('div');
      item.className = 'mt-history-item';
      const timeStr = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      item.innerHTML = `
        <div class="mt-history-item-header">
          <span class="mt-history-speaker">${escapeHtml(entry.speaker || 'Desconhecido')}</span>
          ${timeStr ? `<span class="mt-history-time">${timeStr}</span>` : ''}
        </div>
        ${showOriginalText ? `<div class="mt-history-original">${escapeHtml(entry.original || '')}</div>` : ''}
        <div class="mt-history-translated">${escapeHtml(entry.translated || '')}</div>
      `;
      listEl.appendChild(item);
    });
  }

  /**
   * Escapa HTML para exibição segura
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Mostra toast notification
   */
  function showToast(message, duration = 3000) {
    const existing = document.querySelector('.mt-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'mt-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('mt-toast-visible');
    });

    setTimeout(() => {
      toast.classList.remove('mt-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ============================================
  // CAPTURA DE LEGENDAS
  // ============================================

  /**
   * Encontra o container de legendas usando múltiplos seletores
   */
  function findCaptionContainer() {
    for (const selector of CONFIG.CAPTION_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  /**
   * Encontra o nome do falante em um elemento ou seus ancestrais
   */
  function findSpeakerName(element) {
    if (!element) return '';
    
    // Tenta encontrar o nome nos seletores conhecidos
    for (const selector of CONFIG.SPEAKER_SELECTORS) {
      // Primeiro procura dentro do elemento
      const nameElement = element.querySelector && element.querySelector(selector);
      if (nameElement && nameElement.textContent) {
        return nameElement.textContent.trim();
      }
      
      // Depois procura em elementos irmãos ou ancestrais
      const parent = element.parentElement;
      if (parent) {
        const siblingName = parent.querySelector(selector);
        if (siblingName && siblingName.textContent) {
          return siblingName.textContent.trim();
        }
      }
      
      // Procura no container pai mais amplo
      const container = element.closest('.iOzk7, .nMcdL, [jsname="dsyhDe"]');
      if (container) {
        const containerName = container.querySelector(selector);
        if (containerName && containerName.textContent) {
          return containerName.textContent.trim();
        }
      }
    }
    
    // Tenta encontrar por atributos data
    const dataName = element.getAttribute && element.getAttribute('data-sender-name');
    if (dataName) return dataName;
    
    // Procura em ancestrais
    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 5) {
      for (const selector of CONFIG.SPEAKER_SELECTORS) {
        if (current.matches && current.matches(selector)) {
          return current.textContent.trim();
        }
        const found = current.querySelector(selector);
        if (found && found.textContent) {
          return found.textContent.trim();
        }
      }
      current = current.parentElement;
      depth++;
    }
    
    return '';
  }

  /**
   * Extrai texto das legendas
   */
  function extractCaptionText(element) {
    if (!element) return '';
    
    // Tenta diferentes formas de extrair o texto
    let text = '';
    
    // Primeiro tenta pegar texto dos spans internos
    const spans = element.querySelectorAll('span');
    if (spans.length > 0) {
      text = Array.from(spans).map(s => s.textContent).join(' ');
    }
    
    // Se não encontrou, pega o texto direto
    if (!text.trim()) {
      text = element.textContent || element.innerText || '';
    }
    
    return text.trim();
  }

  /**
   * Extrai dados completos da legenda (texto + falante)
   */
  function extractCaptionData(element) {
    const text = extractCaptionText(element);
    const speaker = findSpeakerName(element);
    
    return { text, speaker };
  }

  /**
   * Processa mudança nas legendas
   */
  async function handleCaptionChange(text, speaker = '') {
    if (!text || text === lastCaptionText) return;
    
    lastCaptionText = text;
    updateOriginalText(text);
    
    // Atualiza o nome do falante se encontrado
    if (speaker) {
      updateSpeakerName(speaker);
    }

    // Cancela debounce anterior
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Aplica debounce
    debounceTimer = setTimeout(async () => {
      try {
        setLoading(true);
        const translation = await translate(text);
        updateTranslatedText(translation);
        updateStatsDisplay();
        
        // Salva no histórico com o nome do falante
        // (já feito dentro da função translate)
      } catch (error) {
        console.error('Erro na tradução:', error);
        
        // Mapeia erros para mensagens amigáveis
        let errorMessage = CONFIG.ERROR_MESSAGES.UNKNOWN_ERROR;
        if (error.message === 'NO_API_KEY') {
          errorMessage = CONFIG.ERROR_MESSAGES.NO_API_KEY;
        } else if (error.message === 'INVALID_API_KEY') {
          errorMessage = CONFIG.ERROR_MESSAGES.INVALID_API_KEY;
        } else if (error.message === 'RATE_LIMIT') {
          errorMessage = CONFIG.ERROR_MESSAGES.RATE_LIMIT;
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = CONFIG.ERROR_MESSAGES.NETWORK_ERROR;
        }
        
        showError(errorMessage);
        updateTranslatedText('Erro na tradução');
      } finally {
        setLoading(false);
      }
    }, CONFIG.DEBOUNCE_DELAY);
  }

  /**
   * Inicia o observer das legendas
   */
  function startCaptionObserver() {
    if (observer) {
      observer.disconnect();
    }

    // Função que observa todo o documento em busca de legendas
    const observeForCaptions = () => {
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          // Verifica se há novos nodes que podem ser legendas
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const captionElement = findCaptionInElement(node);
              if (captionElement) {
                const { text, speaker } = extractCaptionData(captionElement);
                if (text) {
                  handleCaptionChange(text, speaker);
                }
              }
            }
          }
          
          // Verifica mudanças de texto em elementos existentes
          if (mutation.type === 'characterData' || mutation.type === 'childList') {
            const target = mutation.target;
            if (target.nodeType === Node.ELEMENT_NODE || target.parentElement) {
              const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
              if (isCaptionElement(element)) {
                const { text, speaker } = extractCaptionData(element);
                if (text) {
                  handleCaptionChange(text, speaker);
                }
              }
            }
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true
      });
    };

    // Verifica se já existem legendas
    const existingCaption = findCaptionContainer();
    if (existingCaption) {
      const { text, speaker } = extractCaptionData(existingCaption);
      if (text) {
        handleCaptionChange(text, speaker);
      }
    }

    observeForCaptions();
  }

  /**
   * Verifica se um elemento é um container de legendas
   */
  function isCaptionElement(element) {
    if (!element) return false;
    
    for (const selector of CONFIG.CAPTION_SELECTORS) {
      if (element.matches && element.matches(selector)) {
        return true;
      }
      if (element.closest && element.closest(selector)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Encontra elemento de legenda dentro de um node
   */
  function findCaptionInElement(element) {
    for (const selector of CONFIG.CAPTION_SELECTORS) {
      if (element.matches && element.matches(selector)) {
        return element;
      }
      const found = element.querySelector && element.querySelector(selector);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /**
   * Para o observer das legendas
   */
  function stopCaptionObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  // ============================================
  // CONTROLE DE TRADUÇÃO
  // ============================================

  /**
   * Inicia a tradução (modo legendas)
   */
  async function startTranslation() {
    if (isActive) return;
    
    isActive = true;
    showTranslationBox();
    startCaptionObserver();
    showToast('Tradução iniciada! 🌐');
    
    // Atualiza badge de status
    const badge = document.getElementById('mt-status-badge');
    if (badge) {
      badge.textContent = 'Ativo';
      badge.classList.remove('mt-badge-inactive');
      badge.classList.add('mt-badge-active');
    }
    
    // Notifica background
    chrome.runtime.sendMessage({ type: 'statusUpdate', isActive: true });
  }

  /**
   * Para a tradução
   */
  function stopTranslation() {
    if (!isActive) return;
    
    isActive = false;
    stopCaptionObserver();
    
    // Atualiza badge de status
    const badge = document.getElementById('mt-status-badge');
    if (badge) {
      badge.textContent = 'Inativo';
      badge.classList.remove('mt-badge-active');
      badge.classList.add('mt-badge-inactive');
    }
    
    showToast('Tradução pausada');
    
    // Notifica background
    chrome.runtime.sendMessage({ type: 'statusUpdate', isActive: false });
  }

  /**
   * Toggle da tradução
   */
  function toggleTranslation() {
    if (isActive) {
      stopTranslation();
    } else {
      startTranslation();
    }
  }

  // ============================================
  // COMUNICAÇÃO COM POPUP E BACKGROUND
  // ============================================

  /**
   * Listener de mensagens
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handler assíncrono
    (async () => {
      switch (message.type) {
        case 'startTranslation':
          if (message.translationAPI) {
            currentApiType = message.translationAPI;
          }
          if (message.translationApiKey) {
            currentApiKey = message.translationApiKey;
          }
          if (message.targetLanguage) {
            targetLanguage = message.targetLanguage;
          }
          try {
            await startTranslation();
            sendResponse({ success: true, isActive: true });
          } catch (error) {
            console.error('Erro ao iniciar tradução:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
          
        case 'stopTranslation':
          stopTranslation();
          sendResponse({ success: true, isActive: false });
          break;
          
        case 'toggleTranslation':
          toggleTranslation();
          sendResponse({ success: true, isActive: isActive });
          break;
          
        case 'checkStatus':
          sendResponse({ 
            isActive: isActive,
            translationCount: translationCount,
            currentApi: currentApiType,
            targetLanguage: targetLanguage
          });
          break;
          
        case 'updateApiKey':
          currentApiKey = message.apiKey || '';
          sendResponse({ success: true });
          break;
          
        case 'updateApiType':
          currentApiType = message.apiType || CONFIG.APIS.GOOGLE;
          // Atualiza display da API na caixa
          const apiDisplay = translationBox?.querySelector('.mt-api');
          if (apiDisplay) {
            apiDisplay.textContent = `API: ${currentApiType.toUpperCase()}`;
          }
          sendResponse({ success: true });
          break;
          
        case 'updateLanguage':
          targetLanguage = message.language || 'pt';
          // Atualiza label na caixa
          const langLabel = translationBox?.querySelector('.mt-translated .mt-label');
          if (langLabel) {
            langLabel.textContent = `Tradução (${CONFIG.LANGUAGES[targetLanguage] || targetLanguage})`;
          }
          // Limpa cache pois o idioma mudou
          translationCache.clear();
          sendResponse({ success: true });
          break;
          
        case 'updateShowOriginal':
          updateOriginalTextVisibility(message.showOriginal !== false);
          sendResponse({ success: true });
          break;
          
        case 'getHistory':
          sendResponse({ history: translationHistory });
          break;
          
        case 'exportHistory':
          exportHistory(message.format || 'json');
          sendResponse({ success: true });
          break;
          
        case 'clearCache':
          translationCache.clear();
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ error: 'Comando desconhecido' });
      }
    })();
    
    return true; // Mantém canal aberto para resposta assíncrona
  });

  // ============================================
  // ATALHOS DE TECLADO
  // ============================================

  /**
   * Listener de atalhos de teclado
   */
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+T para toggle
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      toggleTranslation();
    }
  });

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  /**
   * Carrega configurações salvas
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get([
        CONFIG.STORAGE_KEYS.API_TYPE,
        CONFIG.STORAGE_KEYS.API_KEY,
        CONFIG.STORAGE_KEYS.TARGET_LANGUAGE,
        CONFIG.STORAGE_KEYS.HISTORY,
        CONFIG.STORAGE_KEYS.STATS,
        CONFIG.STORAGE_KEYS.SHOW_ORIGINAL
      ]);
      
      currentApiType = result[CONFIG.STORAGE_KEYS.API_TYPE] || CONFIG.APIS.GOOGLE;
      currentApiKey = result[CONFIG.STORAGE_KEYS.API_KEY] || '';
      targetLanguage = result[CONFIG.STORAGE_KEYS.TARGET_LANGUAGE] || 'pt';
      translationHistory = result[CONFIG.STORAGE_KEYS.HISTORY] || [];
      showOriginalText = result[CONFIG.STORAGE_KEYS.SHOW_ORIGINAL] !== false;
      
      const stats = result[CONFIG.STORAGE_KEYS.STATS];
      if (stats) {
        translationCount = stats.totalTranslations || 0;
      }
      
      console.log('Meet Translator: Configurações carregadas');
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }
  }

  /**
   * Inicializa a extensão
   */
  async function init() {
    console.log('Meet Translator: Inicializando...');
    
    // Carrega configurações
    await loadSettings();
    
    // Verifica se estamos no Google Meet
    if (!window.location.hostname.includes('meet.google.com')) {
      console.log('Meet Translator: Não estamos no Google Meet');
      return;
    }
    
    console.log('Meet Translator: Pronto! Use Ctrl+Shift+T ou o popup para iniciar.');
  }

  // Inicia quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

