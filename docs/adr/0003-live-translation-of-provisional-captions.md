# Traduzir o Rascunho ao vivo continuamente, não só na finalização

**Status**: accepted

Até aqui, a tradução só era disparada uma vez por Fala, na finalização (ADR 0001) — enquanto o Rascunho ao vivo estava em andamento, a caixinha mostrava um placeholder ("Traduzindo assim que esta fala terminar..."). Isso fazia o usuário esperar a pessoa terminar de falar para ver qualquer tradução, mesmo em falas longas.

Decidimos traduzir o Rascunho ao vivo continuamente como **Tradução provisória**: dispara uma chamada na primeira mutação de texto que atinja um limiar mínimo (evita gastar API em fragmentos de 1-2 caracteres); enquanto uma chamada está em voo para aquela Fala, novas mutações não disparam chamadas extras, só atualizam o texto mais recente guardado; ao resolver, se o texto mudou nesse intervalo, dispara imediatamente mais uma chamada. Na prática isso dá ~1 chamada por round-trip de rede em vez de 1 por mutação do DOM, o que importa porque as três APIs de tradução suportadas (Google Translate, Claude, OpenAI) são todas requisição/resposta única, sem streaming.

A Tradução provisória nunca é persistida (nem em histórico, nem no cache de tradução — ela quase nunca bate no cache mesmo, já que o texto cresce e muda a cada chamada) e nunca tem retry em caso de falha, pois a mutação seguinte naturalmente gera uma nova tentativa. Na finalização, a chamada de tradução autorizada (a que vai para o histórico) sempre dispara de imediato, em paralelo com qualquer chamada provisória ainda em voo — a resposta provisória tardia, se chegar, é descartada (a Fala já finalizou). O comportamento é uniforme nas três APIs; não há gate de custo por backend.

Alternativas descartadas:
- **Debounce de curto prazo** (esperar uma pausa de ~300-500ms antes de traduzir) — mais barato, mas o usuário pediu explicitamente para não esperar nenhuma pausa na fala.
- **Token de sequência** (aceitar múltiplas chamadas em voo e descartar respostas antigas por número de sequência) — funcionaria, mas paga por chamadas que sabe de antemão que vai descartar; o coalescing de uma chamada em voo por vez atinge o mesmo resultado (sempre mostrar a tradução do texto mais recente) sem esse desperdício.
- **Reaproveitar a última Tradução provisória como Entrada finalizada** quando o texto não muda mais — rejeitada para manter a garantia de que toda Entrada finalizada (que alimenta histórico e export) vem de uma chamada de tradução dedicada, sem depender de coincidência de timing com o Rascunho ao vivo.
