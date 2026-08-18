# Arquitetura dual-buffer para legendas (rascunho ao vivo + histórico finalizado)

**Status**: accepted; o gatilho de finalização por estabilidade (~1000ms) e a finalização
imediata na troca de falante descritos abaixo foram substituídos pela ADR 0004 (falantes
pausados/retomáveis) — o resto desta ADR (imutabilidade da Entrada finalizada, motivação original)
continua valendo.

O histórico de traduções ficava confuso quando mais de uma pessoa falava: a heurística anterior (`shouldUpdateLastHistoryEntry`) decidia reaproveitar ou não a última entrada comparando apenas nomes de falante, e podia sobrescrever no lugar a fala de uma pessoa com a de outra quando a detecção do nome falhava (comum, já que os seletores do Meet em `config.js` são heurísticas frágeis). Havia também um único timer de debounce global: se outra pessoa começasse a falar antes dele disparar, a fala anterior era cancelada e nunca chegava a virar histórico.

Decidimos que cada **Fala** (trecho contínuo de uma pessoa) nasce como um **Rascunho ao vivo** mutável e só vira uma **Entrada finalizada** — imutável, nunca reaberta — quando o falante muda (finalização imediata) ou o texto fica ~1000ms sem mudar (estabilidade). Originalmente a tradução só era disparada na finalização, uma vez por Fala; a ADR 0003 mudou isso para também traduzir o Rascunho ao vivo continuamente, mas a finalização continua sendo o único momento em que uma tradução é gravada no histórico.

Já existiu uma tentativa anterior desse mesmo desenho (`.kiro/specs/caption-history-buffer-fix/`, commit `1150266`) que ficou só no papel — os testes de exploração foram escritos mas a implementação nunca saiu do lugar. Esta ADR resume por que a ideia voltou e o que mudou: em vez de um `isFinalized` flag opcional, a imutabilidade é garantida pela própria função de decisão (`isContinuationOfLiveUtterance`) — uma entrada finalizada simplesmente nunca é reconsiderada como alvo de merge, então não existe caminho de código que a reabra.

Alternativa descartada: manter uma única lista mutável e apenas refinar a heurística de comparação de nomes. Rejeitada porque qualquer heurística baseada só em nome de falante permanece vulnerável à mesma classe de bug sempre que a detecção de nome falhar — o que é frequente dado como os seletores do Meet são mantidos.
