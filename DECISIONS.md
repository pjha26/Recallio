# Recallio architecture decisions

This document explains the implementation choices, their tradeoffs, and the evidence behind them. [DESIGN.md](DESIGN.md) is the submission summary. [DEPLOYMENT.md](DEPLOYMENT.md) covers the work needed for a hosted demo.

| Decision | Reason | Tradeoff |
| --- | --- | --- |
| Run one loopback Node server with SQLite | Startup needs no separate database service. Turns and citations survive restarts, and request IDs allow safe retries. | History is scoped by a browser cookie. Startup recovery assumes one writer process. A hosted version needs authentication, HTTPS, and persistent storage. |
| Retrieve history by date and keywords | Calendar references and named products can match the original turns with little setup. | Paraphrased or ambiguous references can miss the intended turn. A comparison with no valid start date asks for clarification. |
| Use Groq first and Gemini on failure | Both accept the same plans and evidence, so failover during synthesis can reuse completed searches. | Provider limits and output quality still vary. The app depends on the credentials supplied. |
| Use one web search adapter with a local SearXNG option | SearXNG needs no search API key. Exa is an optional configuration without Docker. The agent uses the same research workflow with either. | Results depend on upstream availability. SearXNG takes precedence when configured, and an outage never automatically switches to Exa. |
| Ship a pinned SearXNG image with Bing and Yahoo | The model-free CRM benchmark showed broader official host coverage with this engine mix on the test machine. | Engine availability depends on the host network and upstream limits. Rerun the benchmark before changing the engine mix or worker count. |
| Rank mapped vendor sources by host and page type | First-party domains rank before third-party results, then pricing searches prefer pricing pages and release searches prefer changelog pages. | The maintained domain map is intentionally small; unknown vendors remain unverified until their official domain is established. |
| Bound the research loop | Up to four workers run initial searches. The server reserves at most one follow-up within the 12-search cap and reads up to two public HTTPS pages. Known official pages can fill gaps alongside partial search results. | A broad comparison can finish with uncovered rows. Release indexes are reference links, and page reads have size and time limits. |
| Keep vendor statuses server-owned | A dated event must appear in relevant first-party evidence and fall inside the comparison window. A no-change result requires evidence covering that window. Conflicting passages leave the row unresolved. | Domain mapping and page relevance checks cover a limited set of products and formats. Some genuine changes will remain unresolved. |
| Render checked prices verbatim | The server validates the quote and citation and renders the price wording as supplied by the source, preserving its plan and billing period. A rejected draft can still yield useful checked material. | A quote may need context about region, taxes, or usage. These checks cannot establish every fact in the surrounding prose. |
| Keep the first chat load focused | Sources collapse behind a disclosure control, and the optional game loads when opened. The UI ignores stale history responses when the user switches chats. | The browser still depends on the server and same-session storage for recall. |

## Evaluation and demo

1. **Use frozen evidence for correctness checks.** The fixture contains a timeout, a preview, a shipped release, and a price change. Tests also cover wrong plan or billing-period wording and historical comparisons without a start date.
2. **Measure live coverage and answer behavior separately.** The current-date evaluation reports official hosts, relevant pages, dated verdicts, and fallback use. It checks whether the agent recalled the saved question and applied the right comparison date. The last recorded CRM run found relevant sources for 8 of 10 checks in about 11 seconds and confirmed zero dated changes. All three prompts passed the behavior checks and used fallback answers.
3. **Keep the restart demo independent of providers.** Two successive local servers use the same temporary SQLite database and session cookie. A stubbed model verifies recall across chats, and the demo checks that foreign hosts and write origins are rejected.

## Alternatives and next steps

Embeddings would add infrastructure before there is a measured failure on the local history set. Running both models on every turn would spend more quota. A general crawler would add a larger fetch and parsing surface. The current design uses date and keyword lookup, sequential model fallback, and bounded page reads.

The next useful improvement is clearer fallback prose when the evidence remains incomplete. Broader fixtures should cover plan and region distinctions, dates formatted in several ways, and cases where an official page is relevant to the product but cannot establish a change in the requested window.
