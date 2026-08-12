# Registro completo separado do Histórico exibido, com escopo por Sessão

**Status**: accepted

O botão de exportar despejava exatamente o mesmo array usado para desenhar a caixinha flutuante (`translationHistory`), limitado a 50 entradas com descarte FIFO. Em reuniões longas, o relatório exportado perdia o início da conversa — o mesmo limite pensado para desempenho de UI também cortava o material que o usuário queria exportar depois.

Decidimos manter duas estruturas: o **Histórico exibido** (últimas 25 entradas, para a caixinha) e o **Registro completo** (todas as Entradas finalizadas da Sessão, sem limite de tamanho e sem truncar texto longo), usado exclusivamente pela exportação.

O Registro completo vive só em memória, no escopo do content script — nunca é persistido em `chrome.storage.local`. Isso naturalmente amarra seu ciclo de vida à **Sessão** (a página do Meet, do carregamento até um reload): ele sobrevive a pausar/retomar a tradução (`Iniciar`/`Parar`), mas começa vazio a cada novo carregamento de página. Foi uma escolha deliberada não perseguir a troca de sala do Meet via navegação client-side (SPA) sem reload — a extensão não tem hoje nenhum rastreamento de código de reunião pela URL, e adicionar isso ficou fora do escopo combinado. Se um usuário trocar de sala na mesma aba sem recarregar, o Registro completo da sala anterior continua acumulando; a mitigação é o reload de página, não detecção automática.

Alternativa descartada: persistir o Registro completo em `chrome.storage.local` para sobreviver a reloads. Rejeitada porque reintroduziria a possibilidade de uma exportação misturar conversas de reuniões diferentes — o mesmo tipo de confusão que este trabalho existe para eliminar — e a extensão não tem a permissão `unlimitedStorage`, então um registro vitalício correria risco de esbarrar na cota padrão de 10MB do `chrome.storage.local` ao longo de meses de uso.
