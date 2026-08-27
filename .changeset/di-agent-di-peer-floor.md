---
"@theokit/di-agent": patch
---

O peer range do `@theokit/di` deixa de prometer uma versão em que o pacote não funciona.

Declarava `^0.1.0-next.0 || ^0.2.0`, e o piso resolvível disso é `0.1.0` — que **não exporta
`METADATA_KEYS`**, um símbolo que `src/` importa. Um consumidor que resolvesse para 0.1.0 instalava
sem erro e partia nos decorators.

Medido antes de escrever o novo range, versão a versão: `0.1.0` não tem o símbolo, `0.1.1` tem,
`0.2.0` tem. O range passa a ser `>=0.1.1 <0.3`, que é o que a suíte prova.

Encontrado pelo leg `suite at the bottom of every declared range` do dep-check, que instala o piso
de cada range declarado e corre os testes contra ele — 31 falharam. É a única forma de um piso
mentiroso aparecer: nada mais no CI instala a versão mínima.
