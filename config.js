/**
 * Configurações globais da extensão Google Meet Live Translator
 * Este arquivo contém todas as constantes e configurações utilizadas
 */

const CONFIG = {
  // Identificadores das APIs de tradução disponíveis
  APIS: {
    GOOGLE: 'google',
    CLAUDE: 'claude',
    OPENAI: 'openai'
  },

  // Endpoints das APIs de tradução
  ENDPOINTS: {
    GOOGLE: 'https://translate.googleapis.com/translate_a/single',
    CLAUDE: 'https://api.anthropic.com/v1/messages',
    OPENAI: 'https://api.openai.com/v1/chat/completions'
  },

  // Modelos de IA utilizados
  MODELS: {
    CLAUDE: 'claude-sonnet-4-20250514',
    OPENAI: 'gpt-4o-mini'
  },

  // Idiomas suportados para tradução
  LANGUAGES: {
    pt: 'Português',
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano',
    ja: '日本語',
    zh: '中文',
    ko: '한국어',
    ru: 'Русский',
    ar: 'العربية',
    hi: 'हिन्दी'
  },

  // Nomes completos dos idiomas para prompts de IA
  LANGUAGE_NAMES: {
    pt: 'Portuguese',
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    ja: 'Japanese',
    zh: 'Chinese',
    ko: 'Korean',
    ru: 'Russian',
    ar: 'Arabic',
    hi: 'Hindi'
  },

  // Seletores CSS para encontrar legendas no Google Meet
  // O Meet pode mudar esses seletores, então tentamos múltiplos
  CAPTION_SELECTORS: [
    '[jsname="tgaKEf"]',           // Seletor principal das legendas
    '.iOzk7',                       // Container de legendas
    '.a4cQT',                       // Texto da legenda
    '[data-caption-track]',         // Track de legendas
    '.iTTPOb',                      // Alternativo
    '.TBMuR',                       // Container de texto
    '.bh44bd',                      // Wrapper de legendas
    '[jscontroller="D1tHje"]',     // Controller de legendas
    '.Mz6pEf',                      // Novo seletor 2024
    '.VbkSUe',                      // Container principal
    '.nMcdL',                       // Novo container 2024
    '[jsname="dsyhDe"]'             // Container de legenda atual
  ],

  // Seletores para identificar o nome do falante
  SPEAKER_SELECTORS: [
    '.zs7s8d',                      // Nome do participante (principal)
    '.KcIKyf',                      // Nome alternativo
    '[jsname="Xm8Cgc"]',            // Nome do falante
    '.NWpY1c',                      // Container do nome
    '.YTbUzc',                      // Nome no novo layout
    '[data-sender-name]',           // Atributo com nome
    '.eFmLfc',                      // Outro seletor de nome
    '.ZjFb7c',                      // Nome no caption
    '[jsname="r4nke"]'              // Nome do participante 2024
  ],

  // Seletor do container principal de legendas (inclui nome + texto)
  CAPTION_CONTAINER_SELECTORS: [
    '.iOzk7',                       // Container principal de cada legenda
    '.nMcdL',                       // Novo container
    '[jsname="dsyhDe"]',            // Container individual
    '.TBMuR',                       // Wrapper
    '.a4cQT'                        // Container alternativo
  ],

  // Configurações de performance
  DEBOUNCE_DELAY: 500,              // Delay em ms antes de traduzir
  MAX_RETRIES: 3,                   // Tentativas máximas em caso de erro
  RETRY_DELAY: 1000,                // Delay entre tentativas em ms
  CACHE_SIZE: 100,                  // Número máximo de traduções em cache
  HISTORY_SIZE: 50,                 // Número máximo de traduções no histórico

  // Configurações da interface
  UI: {
    BOX_WIDTH: 480,                 // Largura padrão da caixa em px
    BOX_HEIGHT: 'auto',             // Altura padrão (auto)
    BOX_MIN_WIDTH: 320,             // Largura mínima em px
    BOX_MIN_HEIGHT: 200,            // Altura mínima em px
    BOX_MAX_WIDTH: 800,             // Largura máxima em px
    BOX_MAX_HEIGHT: 600,            // Altura máxima em px
    BOX_POSITION: {
      bottom: 120,
      right: 20
    },
    ANIMATION_DURATION: 300,        // Duração das animações em ms
    Z_INDEX: 9999                   // Z-index da caixa flutuante
  },

  // Chaves de armazenamento no chrome.storage
  STORAGE_KEYS: {
    API_TYPE: 'apiType',
    API_KEY: 'apiKey',
    TARGET_LANGUAGE: 'targetLanguage',
    HISTORY: 'translationHistory',
    STATS: 'translationStats',
    THEME: 'theme',
    IS_ACTIVE: 'isActive',
    BOX_SIZE: 'boxSize',            // Tamanho da caixa {width, height}
    BOX_POSITION: 'boxPosition',    // Posição da caixa {x, y}
    SHOW_ORIGINAL: 'showOriginal'   // Mostrar texto original (true/false)
  },

  // Mensagens de erro amigáveis
  ERROR_MESSAGES: {
    NO_API_KEY: 'Por favor, configure sua API Key no popup da extensão.',
    INVALID_API_KEY: 'API Key inválida. Verifique suas credenciais.',
    RATE_LIMIT: 'Limite de requisições atingido. Aguarde alguns segundos.',
    NETWORK_ERROR: 'Erro de conexão. Verifique sua internet.',
    NO_CAPTIONS: 'Ative as legendas no Google Meet (botão CC).',
    UNKNOWN_ERROR: 'Ocorreu um erro inesperado. Tente novamente.',
    NOT_IN_MEET: 'Abra uma reunião no Google Meet para usar a extensão.'
  },

  // Versão da extensão
  VERSION: '1.2.0'
};

// Exporta para uso em outros scripts (se necessário)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}

