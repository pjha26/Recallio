import { performance } from 'node:perf_hooks';
import { answerTurn, selectHistory } from '../src/agent.js';
import { createProviders } from '../src/providers.js';

const now = '2026-11-12T15:00:00Z';
const zone = 'UTC';
const vendors = ['HubSpot', 'Salesforce', 'Pipedrive', 'Zoho CRM', 'Freshsales'];
const postgres = { question: 'What does the Supabase Pro plan cost for a small Postgres project?',
  answer: 'The Supabase Pro subscription starts at $25 per month.', created: '2026-11-10T15:00:00Z' };
const cases = [
  { name: 'CRM changes', question: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
    history: { question: 'Which CRM tools should we shortlist?', answer: vendors.join(', '), created: '2026-11-09T15:00:00Z' }, entities: vendors },
  { name: 'Dated recall', question: 'What did I ask you on 3 November? Is your answer still correct today?',
    history: { ...postgres, created: '2026-11-03T15:00:00Z' }, entities: ['Supabase'] },
  { name: 'Postgres changes', question: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
    history: postgres, entities: ['Supabase'] },
];

const web = process.argv.includes('--web');
const providers = createProviders(process.env);
if (!providers.available || (web && !providers.searchAvailable)) throw new Error('Configure a model key and, for --web, a search provider.');
const fixtureProviders = {
  ...providers,
  readPage: undefined,
  async search(query) {
    const normalized = query.toLowerCase();
    const entity = [...vendors, 'Supabase'].find(name => normalized.includes(name.toLowerCase()));
    if (!entity) return [];
    if (entity === 'Pipedrive') throw Object.assign(new Error('Fixture timeout'), { name: 'TimeoutError' });
    const text = {
      HubSpot: 'The Pro subscription starts at $25 per month.',
      Salesforce: 'Version 4 preview announced on November 11, 2026. General availability is planned.',
      'Zoho CRM': 'Version 4 shipped on November 11, 2026.',
      Freshsales: 'The subscription price increased on November 11, 2026.',
      Supabase: 'The Pro subscription starts at $25 per month. The plan includes a $10 compute credit.',
    }[entity];
    return [{ url: 'https://' + entity.toLowerCase().replaceAll(' ', '-') + '.example/evidence',
      title: entity + ' fixture evidence', text, date: null }];
  },
};

console.log(web ? 'Live web evidence' : 'Frozen synthetic evidence with live model');
for (const { name, question, history: seed, entities } of cases) {
  const history = selectHistory([{ ...seed, chat: 'earlier', result: JSON.stringify({ answer: seed.answer }) }],
    'follow-up', question, zone, now);
  const start = performance.now();
  try {
    const result = await answerTurn({ question, history, zone, now, providers: web ? providers : fixtureProviders,
      progress() {}, signal: AbortSignal.timeout(42000) });
    console.log(JSON.stringify({ name, elapsedMs: Math.round(performance.now() - start), unverified: Boolean(result.unverified),
      entities: Object.fromEntries(entities.map(entity => {
        const searches = result.coverage.filter(({ query }) => query.toLowerCase().includes(entity.toLowerCase()));
        return [entity, { searches: searches.length, withEvidence: searches.filter(check => check.ids.length).length,
          mentioned: result.answer.toLowerCase().includes(entity.toLowerCase()) }];
      })),
      failures: result.coverage.filter(check => check.failed).map(({ query, reason }) => ({ query, reason })),
      sources: result.sources.map(({ id, url, text, pageText }) => ({ id, url, text, pageText })), answer: result.answer }));
  } catch (error) {
    console.log(JSON.stringify({ name, elapsedMs: Math.round(performance.now() - start), error: error.message }));
    process.exitCode = 1;
  }
}
