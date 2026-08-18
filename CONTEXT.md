# Meet Translator Extension

Extensão Chrome que captura legendas ao vivo do Google Meet, traduz em tempo real e mantém um histórico exportável da conversa.

## Language

**Fala** (Utterance):
Trecho contínuo de fala de uma única pessoa, do início até ela parar ou até outra pessoa começar a falar. É a unidade atômica de uma entrada do histórico — nunca é fundida com a fala de outra pessoa.
_Avoid_: legenda, caption block, linha (descrevem o dado bruto do Meet, não a unidade de negócio)

**Rascunho ao vivo** (Live Buffer):
A Fala do falante atual, ainda não finalizada — a única exibida na caixinha, mudando livremente enquanto o mesmo falante continua (mesmo com pausas; ver ADR 0004). Carrega uma Tradução provisória, recalculada a cada mutação do texto original, nunca gravada em cache nem em histórico.
_Avoid_: legenda atual

**Tradução provisória** (Provisional Translation):
Tradução do Rascunho ao vivo enquanto ele ainda está mudando — recalculada a cada nova mutação do texto original (sem debounce), sempre descartável e nunca persistida. Exibida com o mesmo tratamento visual de "ainda ao vivo" usado para o texto original do Rascunho ao vivo, para deixar claro que a redação pode mudar. É sempre substituída, nunca mesclada, pela Tradução final quando a Fala se torna Entrada finalizada — mesmo que a última Tradução provisória já estivesse correta.
_Avoid_: confundir com a tradução da Entrada finalizada, que é a única persistida/exportável

**Entrada finalizada** (Finalized Entry):
Uma Fala (ao vivo ou pausada) que virou um registro imutável do histórico — por retomada do falante, eviction, expiração da rede de segurança de inatividade (60s) ou por parar a tradução (ver ADR 0004). Nunca é reescrita depois de criada.

**Fala pausada** (Paused Utterance):
Uma Fala interrompida por troca de falante que ainda não virou Entrada finalizada — fica em espera para o caso do mesmo falante retomar. No máximo `CONFIG.MAX_PAUSED_SPEAKERS` (2) pausadas ao mesmo tempo; a mais antiga é commitada (finalizada) se uma 3ª pessoa distinta começa a falar. Se o falante retoma, a pausada é commitada imediatamente como sua própria entrada (nunca mesclada com a fala nova). Ver ADR 0004.
_Avoid_: confundir com o Rascunho ao vivo, que é sempre a única Fala exibida na caixinha

**Falante desconhecido** (Unknown Speaker):
Rótulo usado quando o Meet não permite identificar quem está falando. Uma Fala com falante desconhecido nunca é fundida com a Entrada finalizada anterior de um falante nomeado diferente — sempre vira uma entrada própria.
_Avoid_: assumir que "sem nome" = "mesma pessoa da fala anterior"

**Histórico exibido** (Displayed History):
Lista limitada (25 entradas mais recentes) mostrada na caixinha flutuante, por performance de UI.
_Avoid_: confundir com o Registro completo

**Registro completo** (Full Transcript Log):
Cópia em memória, sem limite de tamanho, de todas as Entradas finalizadas — usada exclusivamente para exportação, independente do limite da Histórico exibido. Nunca trunca o texto de uma Fala, mesmo que seja longa. Escopo da Sessão (ver abaixo): nunca persiste em `chrome.storage.local`, então some ao recarregar a página.

**Sessão**:
Um período contínuo desde o carregamento da página do Meet até ela ser fechada ou recarregada. Define a fronteira que zera o Registro completo. Pausar/retomar a tradução (Iniciar/Parar) dentro da mesma Sessão nunca zera o registro. Trocar de sala do Meet sem recarregar a aba (navegação interna do Meet) não é detectado como nova Sessão — só um reload de página reinicia o Registro completo.

**Exportar conversa**:
Termo usado pelo usuário para a funcionalidade de exportação (botão "Exportar histórico"). Não existe (ainda) um resumo gerado por IA — "exportar conversa" refere-se ao Registro completo em JSON/TXT, fiel à conversa real.
_Avoid_: "resumo"/"relatório" sozinhos, pois sugerem síntese por IA, que está fora de escopo por ora
