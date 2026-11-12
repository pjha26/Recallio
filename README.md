# Recallio

Recallio remembers earlier chats and checks what has changed using web search. When you ask whether pricing changed since an earlier conversation, it checks the current price and looks for evidence of when a change occurred.

## Run locally

Use Node.js 22.13 or later. Run `npm install`, copy `.env.example` to `.env`, fill in the settings below, then run `npm run dev` and open the URL printed in the terminal.

- Set `GROQ_API_KEY` for [Groq](https://console.groq.com/keys), `GEMINI_API_KEY` for [Gemini](https://aistudio.google.com/apikey), or both. Groq goes first when both are configured. Use free-tier accounts. Google may use free-tier requests to improve its products, so use non-sensitive sample chats for the demo.
- Set `EXA_API_KEY` for [Exa Starter](https://exa.ai/pricing), or set `SEARXNG_URL` for [your own SearXNG service](https://docs.searxng.org/admin/installation-docker.html). SearXNG needs JSON enabled in its search formats and takes precedence if both are configured.
- Keep your keys in `.env`. The app binds to localhost and stores chat data in `data/recallio.sqlite`. Use the same browser and origin to see earlier chats.

## Try it

### Use SearXNG without a search key

With Docker running, create a folder called `searxng-config` outside the repository. Save this as `settings.yml` inside it and replace the placeholder with a random secret.

```yaml
use_default_settings: true
server:
  secret_key: "replace-with-a-random-secret"
  limiter: false
search:
  formats:
    - html
    - json
```

From the folder containing `searxng-config`, run the following in PowerShell. The port is bound to this machine only.

```powershell
$config = (Resolve-Path ./searxng-config).Path
docker run -d --name recallio-searxng --restart unless-stopped -p 127.0.0.1:43193:8080 --mount "type=bind,source=$config,target=/etc/searxng" searxng/searxng:latest
```

Open [a test JSON search](http://127.0.0.1:43193/search?q=Supabase+pricing&format=json), then set `SEARXNG_URL=http://127.0.0.1:43193` in Recallio's `.env` and restart Recallio.

### Check conversation recall

1. Ask “Compare the entry-level Postgres hosting plans from Neon and Supabase for a small app.”
2. Restart Recallio, choose **New chat**, and ask “What did we conclude about Postgres hosting, and has any pricing changed since?”
3. Check that the answer recalls the earlier comparison, links to evidence, and calls out any missing historical baseline.

Run `npm test` for the SQLite recovery and mocked-provider tests. These tests need no keys.
