---
"@theokit/orm": patch
---

O peer range do `@theokit/di` deixa de prometer versões em que o pacote não funciona.

`0.2.0` declarava `^0.1.0 || ^0.2.0`, e nenhuma 0.1.x atende ao que o `src/` usa. Um consumidor
que resolvesse para o piso instalava sem `ERESOLVE` e sem aviso de peer, e partia depois — em
`0.1.0`, com `TypeError: decorator is not a function` dentro do `reflect-metadata`, longe do range
que causou; em `0.1.1`, com `OrmConfigurationError: @Transactional run: no DataSource bound to
instance`.

Medido versão a versão rodando a suíte contra cada piso, não deduzido da presença de um símbolo:
`0.1.0` não exporta `PostConstruct`, `0.1.1` exporta mas o `@Transactional` gerido pelo container
ainda quebra, `0.2.0` passa. O range passa a ser `^0.2.0` (usetheokit/theokit-di#44).
