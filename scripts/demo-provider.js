const fetchLocal = globalThis.fetch;

globalThis.fetch = (url, options) => {
  if (new URL(url).hostname !== 'api.groq.com') return fetchLocal(url, options);
  const { messages } = JSON.parse(options.body);
  const input = JSON.parse(messages.at(-1).content);
  const response = input.evidence
    ? { answer: input.history[0]?.answer ?? 'No saved conversation found.', citations: [], checks: [] }
    : { focus: 'Recall the saved conversation', queries: [], review: false };
  return Promise.resolve(Response.json({ choices: [{ message: { content: JSON.stringify(response) } }] }));
};
