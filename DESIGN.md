# Recallio design

## How it works

A loopback Node HTTP server serves the chat UI, stores turns in SQLite, and controls model and search calls. It accepts only the local host names and checks browser write origins. An opaque browser cookie scopes history queries. The app records the original question before calling providers. A request ID makes retries safe, and SQLite stores the reply and citations together.

For each turn, the server selects relevant history by date and keywords. The model proposes a bounded search plan. A historical comparison requires a valid date from the request or a matched turn. Four workers take the next query as a slot opens, and citation IDs follow plan order. Vendor research ranks official hosts and relevant page paths or titles. Historical verdicts require a dated official quote in the comparison window. Price statements display the exact cited quote to preserve its plan and billing period. The rules check specific claim types and treat unsupported outcomes as unresolved.

For pricing, dated comparisons, or an empty check, a short review can use one remaining search and read up to two result pages. When a vendor checklist exceeds the four search workers, the server selects a gap directly and skips the review model call. Checks without official search results can use the two reads for known official pages, including when other checks succeeded. Direct release indexes are reference links and cannot confirm individual events. Page reads accept public HTTPS HTML and have size and time limits. If synthesis fails validation, the server can return the matched question, exact evidence quotes for verified rows, and what remains unresolved.

## Why these choices

Two model providers share the same planning and answer formats. Groq goes first and Gemini can retry a failed model step using the evidence already collected. A pinned Docker Compose setup provides local SearXNG without a search API key. Operators can check search separately from the models. Exa is an optional alternative. A SearXNG outage preserves partial results and does not automatically call Exa.

SQLite avoids a database service. Date and keyword lookup handles the challenge's calendar references with little setup. We considered embeddings, asking both models on every turn, and running a crawler. Those add dependencies, quota use, or operations before we have evidence that they improve the submission.

## What is verified and what comes next

Deterministic tests cover restart recovery, bounded search concurrency, model failover, source-domain matching, dates, previews, conflicting or missing evidence, and contradictions between the answer and checklist. The keyless demo verifies recall through HTTP across two server processes and one temporary SQLite database.

Two synthetic-evidence runs took about 4–7 seconds per prompt. The server consistently confirmed the fixture's dated Zoho CRM release and Freshsales price change while leaving unsupported claims unresolved. The model still tried to overstate some unresolved checks, so the server returned its safe checklist summary. In live use, SearXNG may not return official dated sources; this architecture reports those gaps instead of treating missing evidence as proof nothing changed. With another week, I would improve first-party source retrieval and add a broader frozen fixture corpus for common vendor changelog and pricing formats.
