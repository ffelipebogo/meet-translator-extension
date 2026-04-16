# 🌐 Google Meet Live Translator

Uma extensão para Google Chrome que captura legendas do Google Meet e traduz em tempo real usando IA.

![Version](https://img.shields.io/badge/version-1.4.3-blue.svg)
![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-green.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ Funcionalidades

### 🌍 APIs de Tradução

- 🆓 **Google Translate** (Gratuito, sem API Key)
- 🤖 **Claude AI** (Anthropic)
- 🧠 **OpenAI GPT**

### 💡 Outros Recursos

- **Interface Moderna**: Caixa flutuante elegante e redimensionável
- **Identificação de Falante**: Mostra quem está falando
- **Arrastar e Redimensionar**: Posicione e ajuste a caixa
- **Cache Inteligente**: Evita traduções repetidas
- **Histórico**: Salva as últimas 50 traduções com falante
- **Exportar**: Baixe o histórico em JSON ou TXT
- **Atalhos de Teclado**: `Ctrl+Shift+T` para toggle rápido
- **12 Idiomas de Destino**: PT, EN, ES, FR, DE, IT, JA, ZH, KO, RU, AR, HI

## 📦 Instalação

### Modo Desenvolvedor (Recomendado)

1. Baixe ou clone este repositório
2. Abra o Chrome e acesse `chrome://extensions/`
3. Ative o **Modo do desenvolvedor** (canto superior direito)
4. Clique em **Carregar sem compactação**
5. Selecione a pasta `meet-translator-extension`
6. A extensão será instalada e aparecerá na barra de ferramentas

### Via Arquivo ZIP

1. Baixe o arquivo ZIP da extensão
2. Extraia para uma pasta
3. Siga os passos 2-6 acima

## 🔑 Configuração de API Keys

### Google Translate (Padrão)
- **Não requer configuração!**
- Usa a API pública do Google Translate
- Funciona imediatamente após a instalação

### Claude AI (Anthropic)

1. Acesse [console.anthropic.com](https://console.anthropic.com/)
2. Crie uma conta ou faça login
3. Vá em **API Keys**
4. Clique em **Create Key**
5. Copie a chave gerada
6. Cole no campo "API Key" do popup da extensão
7. Clique em "Salvar Configuração"

### OpenAI

1. Acesse [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Crie uma conta ou faça login
3. Clique em **Create new secret key**
4. Copie a chave gerada
5. Cole no campo "API Key" do popup da extensão
6. Clique em "Salvar Configuração"

> ⚠️ **Importante**: As APIs Claude e OpenAI são pagas. Verifique os custos no site de cada provedor.

## 🚀 Como Usar

1. **Entre em uma reunião** do Google Meet
2. **Ative as legendas** clicando no botão CC (legendas ocultas)
3. **Clique no ícone** da extensão na barra de ferramentas
4. **Configure a API** de tradução desejada
5. **Escolha o idioma** de destino
6. **Clique em "Iniciar Tradução"**

### Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `Ctrl+Shift+T` | Iniciar/Parar tradução |
| `Cmd+Shift+T` (Mac) | Iniciar/Parar tradução |

## 🎨 Interface

### Popup da Extensão
- Status atual (Ativo/Inativo)
- Seleção de API de tradução
- Campo para API Key (quando necessário)
- Seleção de idioma de origem e destino
- Botões de controle e teste
- Estatísticas de uso
- Instruções e links úteis

### Caixa de Tradução (no Meet)
- **Nome do falante** (quando disponível)
- Texto original em verde
- Tradução em azul
- Indicador de loading
- Botão para exportar histórico
- Botão para fechar
- **Redimensionável** em todas as direções
- Pode ser arrastada para qualquer posição

## ⚙️ Configurações

As configurações são salvas automaticamente e persistem entre sessões:

- **API selecionada**: Qual serviço usar para traduções
- **API Keys**: Armazenadas de forma segura no Chrome Storage
- **Idioma de destino**: Preferência de idioma para tradução
- **Histórico**: Últimas 50 traduções

## 🐛 Solução de Problemas

### A extensão não detecta legendas (Modo Legendas)

1. Verifique se as legendas estão **ativadas** no Google Meet
2. Clique no botão **CC** na barra inferior do Meet
3. Aguarde alguns segundos para as legendas começarem a aparecer
4. Reinicie a tradução se necessário

### Erro "API não configurada"

1. Certifique-se de estar usando a API Google (não precisa de key)
2. Ou configure uma API Key válida para Claude/OpenAI
3. Verifique se a key foi salva corretamente

### Erro "API Key inválida"

1. Verifique se copiou a key completa
2. Gere uma nova key no painel do provedor
3. Certifique-se de que a key tem permissões adequadas

### A tradução está lenta

1. Verifique sua conexão com a internet
2. O Google Translate é geralmente mais rápido
3. Claude e OpenAI podem ter latência maior
4. O cache ajuda com frases repetidas

### A caixa de tradução não aparece

1. Verifique se está em uma reunião do Google Meet
2. Clique em "Iniciar Tradução" no popup
3. Tente recarregar a página do Meet
4. Verifique o console do navegador (F12) por erros

## 📊 Limitações Conhecidas

- **Apenas Google Meet**: Não funciona em outras plataformas de videoconferência
- **Requer legendas**: O Meet precisa estar gerando legendas
- **Rate Limits**: APIs pagas podem ter limites de requisições
- **Precisão**: A qualidade da tradução depende do serviço escolhido
- **Latência**: Há um pequeno atraso entre a legenda e a tradução

## 🗺️ Roadmap

- [ ] Suporte a mais idiomas
- [ ] Tema claro/escuro toggle
- [ ] Sincronização de configurações entre dispositivos
- [ ] Suporte a outras plataformas (Zoom, Teams)
- [ ] Modo offline com traduções em cache
- [ ] Exportação em mais formatos (SRT, VTT)
- [ ] Estatísticas detalhadas de uso

## 🛠️ Estrutura do Projeto

```
meet-translator-extension/
├── manifest.json      # Configuração da extensão (Manifest V3)
├── content.js         # Script injetado no Google Meet
├── popup.html         # Interface do popup
├── popup.js           # Lógica do popup
├── popup.css          # Estilos do popup
├── styles.css         # Estilos da caixa flutuante
├── background.js      # Service worker
├── config.js          # Constantes e configurações
├── icons/
│   ├── icon16.png     # Ícone 16x16
│   ├── icon48.png     # Ícone 48x48
│   └── icon128.png    # Ícone 128x128
└── README.md          # Documentação
```

## 🔒 Privacidade e Segurança

- **API Keys**: Armazenadas localmente no Chrome Storage, nunca enviadas a terceiros
- **Legendas**: Enviadas apenas para o serviço de tradução selecionado
- **Sem Coleta de Dados**: A extensão não coleta nem armazena dados pessoais
- **Código Aberto**: Todo o código pode ser auditado

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🤝 Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para:

1. Reportar bugs
2. Sugerir novas funcionalidades
3. Enviar pull requests

## 📧 Suporte

Se encontrar problemas ou tiver dúvidas:

1. Verifique a seção de **Solução de Problemas** acima
2. Abra uma **Issue** no repositório
3. Descreva o problema com detalhes

---

Feito com ❤️ para traduzir o mundo

**Versão**: 1.4.3
