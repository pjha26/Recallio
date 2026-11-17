import { createProviders, searchFailureReason } from '../src/providers.js';

const provider = process.env.SEARXNG_URL ? 'SearXNG' : process.env.EXA_API_KEY ? 'Exa' : null;
const signal = AbortSignal.timeout(8000);
try {
  if (!provider) {
    console.error('Set SEARXNG_URL or EXA_API_KEY in .env first.');
    process.exitCode = 1;
  } else {
    const results = await createProviders(process.env).search(
      'Supabase official pricing', 'Find the official Supabase pricing page.', null, signal);
    if (results.length) {
      console.log(`${provider} returned ${results.length} usable results.`);
    } else {
      console.error(`${provider} responded but returned no usable results.`);
      process.exitCode = 1;
    }
  }
} catch (error) {
  const reason = searchFailureReason(error, signal);
  console.error(`${provider} search check failed (${reason}). See the README troubleshooting table.`);
  process.exitCode = 1;
}
