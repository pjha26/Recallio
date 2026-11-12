import { lookup } from 'node:dns';
import { get } from 'node:https';
import { load } from 'cheerio';
import ipaddr from 'ipaddr.js';

function publicLookup(host, options, callback) {
  lookup(host, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    const publicAddresses = addresses.filter(({ address, family }) =>
      family === 4 && ipaddr.parse(address).range() === 'unicast');
    if (!publicAddresses.length) return callback(new Error('No public IPv4 address'));
    const { address, family } = publicAddresses[0];
    callback(null, address, family);
  });
}

export function extractPageEvidence(html) {
  const $ = load(html);
  $('script, style, noscript, template, nav, footer, svg, [hidden]').remove();
  const root = $('main').first();
  const content = (root.length ? root : $('body')).text().replace(/\s+/g, ' ').trim();
  const details = [...content.matchAll(/(?:[$€£]\s*\d|\b(?:USD|EUR|GBP)\s*\d|\b(?:effective|released|takes effect|per month|per year)\b)/gi)];
  const passages = [];
  let end = 0;
  for (const match of details) {
    if (match.index < end) continue;
    end = match.index + 170;
    passages.push(content.slice(Math.max(0, match.index - 90), end).trim());
    if (passages.length === 5) break;
  }
  return passages.join('\n') || content.slice(0, 900);
}

export async function readPublicPage(rawUrl, signal) {
  const url = new URL(rawUrl);
  // Literal addresses bypass the DNS callback, so require a public hostname.
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !url.hostname.includes('.') || ipaddr.isValid(url.hostname)) return '';
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(4000)]);
  const html = await new Promise((resolve, reject) => {
    const request = get(url, { lookup: publicLookup, family: 4, autoSelectFamily: false,
      agent: false, signal: requestSignal, headers: { Accept: 'text/html' } }, response => {
      if (response.statusCode !== 200 || !/^text\/html\b/i.test(response.headers['content-type'] ?? '')) {
        response.destroy();
        resolve('');
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 1_500_000) {
          resolve('');
          response.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });
    request.on('error', reject);
  });
  return html ? extractPageEvidence(html) : '';
}
