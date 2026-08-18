# Falantes pausados/retomáveis em vez de finalização imediata na troca de falante

**Status**: accepted

A ADR 0001 finalizava a Fala ao vivo em dois gatilhos: troca de falante (na hora) ou ~1000ms sem
mudança de texto (estabilidade). Na prática, o Google Meet frequentemente limpa/reinicia a legenda
entre frases da mesma pessoa, então o gatilho de estabilidade cortava uma única fala contínua em
várias Entradas finalizadas pequenas — o usuário via a tradução "pular" para o histórico rápido
demais mesmo sem ninguém mais ter falado.

## Decisão

1. **Fim do corte por estabilidade.** Enquanto for o mesmo falante, a Fala ao vivo nunca finaliza
   sozinha por pausa no texto. Existe apenas uma rede de segurança de
   `CONFIG.LIVE_UTTERANCE_IDLE_TIMEOUT` (60s) sem nenhuma atualização — cobre o caso de a reunião
   acabar ou o falante nunca mais voltar, para a Fala não ficar "presa" ao vivo para sempre.

2. **Troca de falante não finaliza mais na hora.** A Fala do falante que estava ao vivo entra numa
   fila de **Falas pausadas** (retomáveis) em vez de virar Entrada finalizada imediatamente. Cada
   pausada tem sua própria rede de segurança de 60s.

3. **No máximo `CONFIG.MAX_PAUSED_SPEAKERS` (2) pausadas ao mesmo tempo.** Se uma 3ª pessoa
   distinta começa a falar com a fila cheia, a pausada mais antiga é commitada (finalizada) nesse
   momento — nunca descartada silenciosamente.

4. **Retomar não junta texto.** Se um falante pausado volta a falar, sua Fala pausada é commitada
   imediatamente como sua própria Entrada finalizada (preserva a ordem cronológica real de quem
   falou quando) e a fala nova começa do zero, sem herdar nem exibir nada do texto anterior. Cada
   trecho falado sempre vira sua própria entrada no Registro completo — nunca mesclado com outro
   trecho do mesmo falante.

5. **Sem flag de configuração.** Substitui o comportamento da ADR 0001 diretamente; não há um modo
   antigo para alternar de volta.

Ao parar a tradução (`stopTranslation`), tanto a Fala ao vivo quanto todas as pausadas em espera
são commitadas para não perder dados (mesmo princípio do item 3).

## Alternativas descartadas

- **Mesclar visualmente o texto retomado com o novo ao vivo** (ideia original que motivou esta
  ADR): descartada depois de considerar que não traz benefício real, já que cada trecho falado
  continua virando sua própria Entrada finalizada — a caixinha ao vivo simplesmente recomeça do
  zero para o falante retomado, sem nenhuma indicação visual do trecho anterior.
- **Guardar pausadas ilimitadas** (todos os falantes já vistos na sessão): rejeitada por custo de
  memória/complexidade sem benefício claro — o caso comum é alternância entre poucas pessoas.
