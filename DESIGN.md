# Recallio design

## How it works

A Node HTTP server serves the chat UI, stores turns in SQLite, and controls the model and search calls. An opaque browser cookie scopes all history queries. The app records the original question before calling any provider. A request ID makes retries safe, and SQLite stores the reply and its citations together. An interrupted turn can be retried after a restart.

For each turn, the server selects recent and relevant historical messages using date and keyword matching. The model proposes a bounded search plan. The server runs up to four searches at a time and tracks failed and empty queries. It assigns evidence IDs to returned URLs and checks every returned citation ID. Citation validation establishes where a link came from. Whether the excerpt supports a claim is evaluated separately.

The comparison distinguishes the previous answer, current evidence, and evidence of a change during the requested window. For pricing, the model compares the same plan, region, currency, and billing interval. A present-day price can establish today's terms even if an earlier price cannot be verified.

## Why these choices

Two model providers share the same planning and answer formats. Groq goes first and Gemini can retry a failed model step. The server owns the evidence, so failover during synthesis reuses completed searches. Exa is the reviewer-friendly default. SearXNG is an optional self-hosted alternative for search without an API key. The same agent workflow runs with either.

SQLite avoids a database service. Date and keyword lookup handles the challenge's calendar references with little setup. We considered embeddings, asking both models on every turn, and running a crawler. Those add dependencies, quota use, or operations before we have evidence that they improve the submission.

## What is verified and what comes next

Deterministic tests cover restart recovery, duplicate requests, session scoping, dated retrieval, and model failover after search. Free-account quotas and live provider quality need credentials and live evaluation. With another week, I would build a dated set of pricing and release changes, compare Exa and SearXNG on evidence coverage and p95 latency, and improve retrieval where the sources fall short.
