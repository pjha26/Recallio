# Recallio design

## How it works

A Node HTTP server serves the chat UI, stores turns in SQLite, and controls the model and search calls. An opaque browser cookie scopes all history queries. The app records the original question before calling any provider. A request ID makes retries safe, and SQLite stores the reply and its citations together. An interrupted turn can be retried after a restart.

For each turn, the server selects recent and relevant historical messages using date and keyword matching. The model proposes a bounded search plan. Four workers take the next query as soon as a slot opens. The server records results, empty checks, and failure reasons, then assigns citation IDs in plan order. For declared base-price, shipped-release, and price-change claims, it checks quoted evidence against the retrieved text and rules for that claim type. These checks catch common mismatches. They cannot establish the authority of a source or verify every assertion.

For pricing, dated comparisons, several entities, or an empty check, a short review can use one remaining search for the most important evidence gap. It can also read up to two result pages when the excerpts omit relevant details. Page reads accept public HTTPS HTML, use a pinned public IPv4 address, and have size and time limits. If a page is unavailable, the original excerpt stays in evidence. The comparison distinguishes the previous answer, current evidence, and evidence of a change during the requested window. A present-day price can establish today's terms even if an earlier price cannot be verified.

## Why these choices

Two model providers share the same planning and answer formats. Groq goes first and Gemini can retry a failed model step. The server owns the evidence, so failover during synthesis reuses completed searches. Exa is the reviewer-friendly default. SearXNG is an optional self-hosted alternative for search without an API key. The same agent workflow runs with either.

SQLite avoids a database service. Date and keyword lookup handles the challenge's calendar references with little setup. We considered embeddings, asking both models on every turn, and running a crawler. Those add dependencies, quota use, or operations before we have evidence that they improve the submission.

## What is verified and what comes next

Deterministic tests cover restart recovery, bounded search concurrency, model failover, and unsupported evidence. The keyless demo verifies recall through HTTP across two server processes and the same temporary SQLite database.

One live CRM run returned evidence for all five vendors across 11 searches with zero search failures in 17.1 seconds. Another finished in 17.0 seconds with 10 failed searches and evidence for just one vendor. A direct probe during a later failure found that SearXNG was reachable but reported three unresponsive upstream engines. The fixed-evidence CRM case finished in 3.8 seconds, reported Pipedrive's simulated timeout, and distinguished Salesforce's preview from Zoho's shipped release. These are individual runs. With another week, I would measure latency across repeated runs and improve retrieval of first-party, dated sources.
