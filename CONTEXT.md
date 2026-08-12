# Meet Translator Extension

Extensão Chrome que captura legendas ao vivo do Google Meet, traduz em tempo real e mantém um histórico exportável da conversa.

## Language

**Fala** (Utterance):
Trecho contínuo de fala de uma única pessoa, do início até ela parar ou até outra pessoa começar a falar. É a unidade atômica de uma entrada do histórico — nunca é fundida com a fala de outra pessoa.
_Avoid_: legenda, caption block, linha (descrevem o dado bruto do Meet, não a unidade de negócio)

**Rascunho ao vivo** (Live Buffer):
A Fala que ainda está sendo captada/alterada pelo Meet — exibida na caixinha mas ainda não finalizada, podendo mudar até estabilizar.
_Avoid_: legenda atual

**Entrada finalizada** (Finalized Entry):
Uma Fala que parou de mudar (estabilizou) ou foi interrompida por troca de falante, e por isso virou um registro imutável do histórico. Nunca é reescrita depois de criada.

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
