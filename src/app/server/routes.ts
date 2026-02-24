import type { IncomingMessage, ServerResponse } from 'node:http';
import { Agent } from '../../runtime/agent/agent.js';

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

export async function handleRoute(req: IncomingMessage, res: ServerResponse, agent: Agent): Promise<void> {
  if (!req.url) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/ask') {
    try {
      const body = await readJson(req);
      const question = String(body?.question ?? '').trim();
      if (!question) {
        sendJson(res, 400, { error: 'question is required' });
        return;
      }

      const out = await agent.run({
        question,
        sessionId: body?.sessionId,
      });
      sendJson(res, 200, out);
    } catch (e: any) {
      sendJson(res, 500, { error: String(e?.message ?? e) });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

