# Known issues (not yet fixed)

Found 2026-08-14 while analyzing a real exported `Registro completo` (346 entries). Documented here for
later triage — not implemented yet, no decision made on approach.

## 1. Entradas ficam presas para sempre em `status: "translating"`

Se `translationSessionToken` mudar (usuário parou/reiniciou a tradução) enquanto uma chamada de
tradução da Entrada finalizada está em voo, `translateFinalizedEntry` (content.js) faz `return`
silencioso tanto no `try` quanto no `catch` — a entrada nunca sai de `status: "translating"`, nem no
Histórico nem na exportação. Agravado por nenhuma das três chamadas `fetch` (Google/Claude/OpenAI)
ter timeout: uma requisição que trava na rede nunca cai no `catch` também. Confirmado no export real:
3 de 346 entradas ficaram presas assim (`translated: ""` para sempre).

Possível direção: dar timeout ao `fetch` e, ao descartar por sessão obsoleta, marcar a entrada como
erro em vez de deixá-la no limbo — mas isso precisa de uma decisão sobre a mensagem/estado exibido
para esse caso específico (diferente de um erro de API normal).

## 2. Texto da própria UI do Meet às vezes é capturado como se fosse fala

Os seletores em `CONFIG.CAPTION_SELECTORS`/`findCaptionContainer` (já descritos como "heurísticas
frágeis" na ADR 0001) por vezes casam com o container errado do painel de legendas — capturando a
lista de nomes de participantes concatenada com o rótulo do botão "Jump to bottom" do Meet, em vez do
texto da legenda atual. Confirmado no export real: uma Entrada finalizada cujo `original` era só nomes
de participantes + "arrow_downward Jump to bottom", sem nenhuma fala real.

Possível direção: alguma heurística de rejeição (ex.: texto que é só uma lista de nomes conhecidos do
painel, ou contém rótulos de UI conhecidos) antes de aceitar um texto como legenda — precisa de
investigação de quais seletores exatos casam errado e quando.

## 3. Entrada finalizada com erro nunca pode ser re-tentada manualmente

Se a API falhar no momento da finalização (ex.: chave inválida, rate limit), a Entrada finalizada
fica com `status: "error"` e `translated: "Erro na tradução"` para sempre — mesmo que o usuário
corrija a configuração (troque de API/chave) segundos depois, as falas já finalizadas nunca são
re-traduzidas. Confirmado no export real: 20 falas seguidas ficaram com erro no início de uma sessão
(API Claude falhando), até o usuário trocar para Google Translate — nenhuma delas foi recuperada.

Possível direção: um botão "tentar novamente" por item do histórico, que dispare uma nova
`translateFinalizedEntry` para aquela entrada específica sem duplicar o registro.
