# Recallio architecture decisions

This document records the implementation choices and what to build next. [DESIGN.md](DESIGN.md) is the submission summary.

| Decision | Reason | Tradeoff |
| --- | --- | --- |
| Run one Node server with SQLite | A clean clone can start without a separate database. Original turns, answers, and citations survive restarts. | History belongs to one browser session and one local database. Sharing it across devices would need an account model. |
| Retrieve history by date and keywords | Calendar references and named products can match the original turns with little setup. | Paraphrased and ambiguous references can miss the intended turn. Test retrieval before adding embeddings. |
| Use Groq first and Gemini on failure | Both accept the same plans and evidence, so failover during synthesis can reuse completed searches. | Provider limits and output quality still vary. The app depends on the credentials supplied. |
| Support SearXNG and Exa through one search adapter | SearXNG can run locally without search credits. Exa offers a setup without a Docker service. | Search rankings and excerpt coverage vary. Self-hosted SearXNG also depends on Docker and upstream engines. |
| Bound the research loop | The server caps searches at 12 per turn, including the optional follow-up, and reads up to two result pages. | A broad comparison can still finish with gaps. A slow source can use up its share of the turn deadline. |
| Validate citation IDs and supporting quotes | The server checks that quotes for declared price, release, and change claims appear in the cited evidence and contain appropriate signals. | These checks are heuristic. They do not verify every assertion or determine whether a source is authoritative. |

## Evaluation and demo

1. **Measure multi-vendor coverage.** The evaluation reports per-vendor search and evidence counts. A four-worker queue starts another query as soon as a slot frees up. Citation order still follows the original plan. A slow query can no longer hold up the entire next batch.
2. **Check cited evidence.** Tests cover a base price versus a compute credit, a preview versus a shipped release, and a current price without evidence of change. If model synthesis fails evidence validation, Recallio can return the checked links and explain that it could not verify the proposed answer.
3. **Verify the hiring demo.** The demo starts two successive local server processes with the same isolated SQLite database and session cookie. A stubbed model returns the retrieved answer so the check measures persistence and retrieval without provider availability affecting the outcome.

Vendor research now plans one search per vendor and requested check type. The server preserves checks that returned no evidence and can use the reserved follow-up slot to retry one of them. A confirmed change needs a dated quote from the same check and a date inside the comparison window when the start is known. Unresolved checks remain visible. Repeated runs report how much variation comes from source coverage, answer verification, and provider failures. Further work should improve retrieval of first-party, dated sources when current pages establish only present-day terms.
