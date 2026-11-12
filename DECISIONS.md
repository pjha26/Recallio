# Recallio architecture decisions

This document records the implementation choices and what to build next. [DESIGN.md](DESIGN.md) is the submission summary.

| Decision | Reason | Tradeoff |
| --- | --- | --- |
| Run one Node server with SQLite | A clean clone can start without a separate database. Original turns, answers, and citations survive restarts. | History belongs to one browser session and one local database. Sharing it across devices would need an account model. |
| Retrieve history by date and keywords | Calendar references and named products can match the original turns with little setup. | Paraphrased and ambiguous references can miss the intended turn. Test retrieval before adding embeddings. |
| Use Groq first and Gemini on failure | Both accept the same plans and evidence, so failover during synthesis can reuse completed searches. | Provider limits and output quality still vary. The app depends on the credentials supplied. |
| Support SearXNG and Exa through one search adapter | SearXNG can run locally without search credits. Exa offers a setup without a Docker service. | Search rankings and excerpt coverage vary. Self-hosted SearXNG also depends on Docker and upstream engines. |
| Bound the research loop | The server caps searches at 12 per turn, including the optional follow-up, and reads up to two result pages. | A broad comparison can still finish with gaps. A slow source can use up its share of the turn deadline. |
| Validate citation IDs against retrieved URLs | The server can trace a displayed citation to a search result. | A real URL can still fail to support a claim. Historical changes require dated evidence or a reliable baseline. |

## Next build steps

1. **Measure and improve multi-vendor coverage.** Turn the three hiring prompts into repeatable fixtures with seeded chats and known evidence. Record each vendor's outcome, provider failures, and response time. The live CRM run left five searches incomplete. Use the failure data to tune SearXNG timeouts or concurrency, and rerun the same fixtures to see whether coverage improves.
2. **Evaluate whether citations support the claims.** Add cases for a base price versus a compute credit, a release announcement versus a ship date, and a current price without a historical baseline. Check the cited excerpt or page against the answer. Mark changes unverified when comparable, dated evidence is missing.
3. **Package the hiring demo.** Verify setup from a fresh clone with the documented SearXNG configuration, prepare a sample history that shows recall across a restart, and update `DESIGN.md` with measured coverage and latency.
