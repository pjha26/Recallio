# Recallio deployment plan

The hiring submission runs on one local Node process and a local SearXNG service. Reviewers can clone the repository, supply a model key, start SearXNG with the included Compose file, and run `npm install` and `npm run dev`.

## Optional hosted reviewer demo

1. Start with one VM and one Node process. Put the app behind an authenticated HTTPS reverse proxy. Keep Node and SearXNG private. Introduce an explicit allowed public origin for the app and enforce it on browser writes. Replace the local HTTP cookie settings with secure HTTPS session cookies.
2. Keep `data/` on a persistent disk and run SQLite backups from a consistent snapshot. Test restoring a backup into a fresh instance. Use one writer process because startup recovery marks interrupted turns in the shared database.
3. Inject model keys and the SearXNG secret through the server environment. Limit authenticated users and request rates, set a provider quota budget, and keep request logs free of transcript content and secrets. Choose the hosting budget before provisioning.
4. Before sharing a URL, test login, session isolation, same-origin writes through the proxy, restart recall, and provider outages. Run `npm test`, `npm run demo`, `npm run search:check`, and `npm run eval:web`. Monitor search failures and request duration. Keep the previous release and a tested backup for rollback.

Public hosting needs the origin, authentication, and persistence work above. The current checkout binds to loopback for local review.
