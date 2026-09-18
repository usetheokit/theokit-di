# @theokit/di-agent

> Agent-first DI integration for `@theokit/di`.

Ships a single `@InjectAgent()` decorator and a `createAgentProvider()` factory helper that produces a **REQUEST-scoped** `Agent` instance — so every HTTP request gets an isolated `@theokit/sdk` Agent automatically.

## Install

```bash
pnpm add @theokit/di @theokit/sdk @theokit/di-agent reflect-metadata
```

## Quick start

```typescript
import "reflect-metadata";
import { Agent } from "@theokit/sdk";
import { Container, Injectable, Module } from "@theokit/di";
import { InjectAgent, createAgentProvider } from "@theokit/di-agent";

@Injectable()
class ChatService {
  constructor(@InjectAgent() private readonly agent: Agent) {}

  async chat(message: string) {
    return this.agent.send(message);
  }
}

@Module({
  providers: [
    createAgentProvider({
      factory: () =>
        Agent.create({
          apiKey: process.env.OPENROUTER_API_KEY!,
          model: { id: "openai/gpt-4o-mini" },
        }),
    }),
    ChatService,
  ],
})
class AppModule {}

const container = new Container();
container.registerModule(AppModule);

// In your HTTP handler:
await container.runInRequest(async () => {
  const chat = await container.resolveAsync(ChatService);
  return chat.chat("hello");
});
```

## The decorators record; they do not execute

`@Tool`, `@SubAgent`, `@Squad`, `@Workflow`, `@Step`, `@Cron`, `@Hitl`, `@Retriever`, `@Reranker`
and their siblings **write metadata onto a class and nothing else**. Each has a matching
`read*Metadata` reader, exported so a consumer can retrieve what was recorded.

That split is deliberate — it lets a declaration and the runtime that acts on it version
independently. What it means in practice is stated here rather than inferred from the export list,
because an export list that names `@Workflow` reads like a promise that something runs it.

**Measured 2026-09-17, across every repository in this ecosystem, excluding `node_modules`:**

| Decorator family | Read by |
| --- | --- |
| `@Workflow`, `@Step` | `workflow-builder.ts`, inside this package |
| the other fourteen | nothing, anywhere |

No consumer outside this package reads any of them, including `@theokit/sdk`.

**This is a declaration surface waiting for a consumer, and that is a fine thing to be — stated.**
If you are choosing an authoring surface today, `AgentBuilder` in `@theokit/agents` is the one that
executes. Reach for these when you want a class to *carry* a declaration that your own code reads
back through `read*Metadata`, which works exactly as documented.

`tests/decorator-consumers.test.ts` keeps this table honest: wiring a reader makes it fail until the
table says so.

## License

Apache-2.0
