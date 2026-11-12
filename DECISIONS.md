# Recallio architecture decisions

This document records the implementation choices and what to build next. [DESIGN.md](DESIGN.md) is the submission summary.

| Decision | Reason | Tradeoff |
| --- | --- | --- |
| Run one Node server with SQLite | A clean clone can start without a separate database. Original turns, answers, and citations survive restarts. | History belongs to one browser session and one local database. Sharing it across devices would need an account model. |
| Retrieve history by date and keywords | Calendar references and named products can match the original turns with little setup. | Paraphrased and ambiguous references can miss the intended turn. Test retrieval before adding embeddings. |
| Use Groq first and Gemini on failure | Both accept the same plans and evidence, so failover during synthesis can reuse completed searches. | Provider limits and output quality still vary. The app depends on the credentials supplied. |
| Support SearXNG and Exa through one search adapter | SearXNG can run locally without search credits. Exa offers a setup without a Docker service. | Search rankings and excerpt coverage vary. Self-hosted SearXNG also depends on Docker and upstream engines. |
| Bound the research loop | The server caps searches at 12 per turn, including the optional follow-up, and reads up to two result pages. | A broad comparison can still finish with gaps. A slow source can use up its share of the turn deadline. |
| Keep vendor statuses server-owned | A dated event must appear in first-party evidence, match the requested check type, and fall inside the comparison window. An unresolved status cannot be upgraded by the model's prose. | This uses a small maintained list of official vendor domains and conservative text patterns. New vendors and unusual wording may remain unverified until the map or rules are expanded. |
| Validate citation IDs and supporting quotes | The server checks that quotes for declared price, release, and change claims appear in the cited evidence and contain appropriate signals. It also blocks change/no-change summaries that conflict with unresolved rows. | These checks are heuristic. They do not verify every assertion or every citation's claim context. |

## Evaluation and demo

1. **Measure multi-vendor coverage.** The evaluation reports per-vendor search and evidence counts. A four-worker queue starts another query as soon as a slot frees up. Citation order still follows the original plan. A slow query can no longer hold up the entire next batch.
2. **Check cited evidence.** Tests cover a base price versus a compute credit, a preview versus a shipped release, and a current price without evidence of change. If model synthesis fails evidence validation, Recallio can return the checked links and explain that it could not verify the proposed answer.
3. **Verify the hiring demo.** The demo starts two successive local server processes with the same isolated SQLite database and session cookie. A stubbed model returns the retrieved answer so the check measures persistence and retrieval without provider availability affecting the outcome.

Vendor research plans one search per vendor and requested check type, then reserves one follow-up for the largest evidence gap. A confirmed change requires a dated statement from the vendor's official domain; a no-change result also needs a known comparison start. Both must fall within the requested window when one is supplied. Model prose cannot override these server statuses; a conflicting answer falls back to a concise safe summary. The frozen synthetic evaluation confirms two expected dated events and leaves the other rows unresolved across repeated runs. Next, improve first-party retrieval for cases where official pages only show today's terms, then broaden fixture coverage for vendor-specific page formats.

