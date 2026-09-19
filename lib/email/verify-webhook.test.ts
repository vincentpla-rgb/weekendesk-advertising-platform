import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyStandardWebhook } from './verify-webhook.js';

const SECRET = 'whsec_' + Buffer.from('un-secreto-de-prueba-de-32-bytes!!').toString('base64');

function sign(id: string, timestamp: string, payload: string, secret: string): string {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const signature = createHmac('sha256', Buffer.from(raw, 'base64'))
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${signature}`;
}

describe('verifyStandardWebhook', () => {
  it('acepta una firma válida', () => {
    const payload = JSON.stringify({ hello: 'world' });
    const id = 'msg_1';
    const timestamp = '1700000000';
    const signature = sign(id, timestamp, payload, SECRET);

    expect(verifyStandardWebhook(payload, { id, timestamp, signature }, SECRET)).toBe(true);
  });

  it('rechaza una firma calculada con otro secreto', () => {
    const payload = JSON.stringify({ hello: 'world' });
    const id = 'msg_1';
    const timestamp = '1700000000';
    const otherSecret = 'whsec_' + Buffer.from('otro-secreto-completamente-distinto').toString('base64');
    const signature = sign(id, timestamp, payload, otherSecret);

    expect(verifyStandardWebhook(payload, { id, timestamp, signature }, SECRET)).toBe(false);
  });

  it('rechaza si el payload fue alterado tras firmarlo', () => {
    const id = 'msg_1';
    const timestamp = '1700000000';
    const signature = sign(id, timestamp, JSON.stringify({ hello: 'world' }), SECRET);

    const tampered = JSON.stringify({ hello: 'mundo' });
    expect(verifyStandardWebhook(tampered, { id, timestamp, signature }, SECRET)).toBe(false);
  });

  it('acepta cuando una de varias firmas espaciadas coincide', () => {
    const payload = JSON.stringify({ a: 1 });
    const id = 'msg_2';
    const timestamp = '1700000001';
    const good = sign(id, timestamp, payload, SECRET);
    const bogus = 'v1,ZmFrZQ==';

    expect(verifyStandardWebhook(payload, { id, timestamp, signature: `${bogus} ${good}` }, SECRET)).toBe(true);
  });

  it('rechaza si falta alguna cabecera', () => {
    const payload = '{}';
    expect(verifyStandardWebhook(payload, { id: null, timestamp: '1', signature: 'v1,x' }, SECRET)).toBe(false);
    expect(verifyStandardWebhook(payload, { id: 'a', timestamp: null, signature: 'v1,x' }, SECRET)).toBe(false);
    expect(verifyStandardWebhook(payload, { id: 'a', timestamp: '1', signature: null }, SECRET)).toBe(false);
  });
});
