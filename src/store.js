import { DatabaseSync } from 'node:sqlite';

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS turns (
      session TEXT NOT NULL,
      id TEXT NOT NULL,
      chat TEXT NOT NULL,
      question TEXT NOT NULL,
      created TEXT NOT NULL,
      zone TEXT NOT NULL,
      state TEXT NOT NULL,
      result TEXT,
      PRIMARY KEY (session, id)
    );
    CREATE INDEX IF NOT EXISTS turns_session_date ON turns (session, created);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_turn
      ON turns (session, chat) WHERE state = 'running';
    UPDATE turns SET state = 'interrupted' WHERE state = 'running';
  `);
  const find = db.prepare('SELECT * FROM turns WHERE session = ? AND id = ?');
  const active = db.prepare("SELECT id FROM turns WHERE session = ? AND chat = ? AND state = 'running'");
  const insert = db.prepare("INSERT INTO turns VALUES (?, ?, ?, ?, ?, ?, 'running', NULL)");
  const retry = db.prepare("UPDATE turns SET state = 'running' WHERE session = ? AND id = ?");
  const finish = db.prepare("UPDATE turns SET state = ?, result = ? WHERE session = ? AND id = ? AND state = 'running'");
  const recent = db.prepare("SELECT * FROM turns WHERE session = ? AND chat = ? ORDER BY rowid DESC LIMIT 100");
  const memory = db.prepare(`
    SELECT id, chat, question, created, zone, result FROM turns
    WHERE session = ? AND state = 'completed' ORDER BY rowid DESC LIMIT 1000
  `);
  const chats = db.prepare('SELECT chat, MIN(question) AS fallback, MAX(created) AS latest FROM turns WHERE session = ? GROUP BY chat ORDER BY latest DESC');
  const title = db.prepare('SELECT question FROM turns WHERE session = ? AND chat = ? ORDER BY rowid LIMIT 1');
  return {
    start(session, { id, chat, question, zone }, now) {
      const prior = find.get(session, id);
      if (prior && (prior.question !== question || prior.chat !== chat || prior.zone !== zone)) return 'conflict';
      if (prior?.state === 'completed') return JSON.parse(prior.result);
      if (active.get(session, chat)) return 'busy';
      if (prior) retry.run(session, id);
      else insert.run(session, id, chat, question, now, zone);
      return 'started';
    },
    finish(session, id, result) {
      finish.run(result ? 'completed' : 'interrupted', result ? JSON.stringify(result) : null, session, id);
    },
    history: (session, chat) => recent.all(session, chat).reverse(),
    memory: session => memory.all(session),
    chats: session => chats.all(session).map(({ chat }) => ({ id: chat, title: title.get(session, chat).question })),
    close: () => db.close(),
  };
}
