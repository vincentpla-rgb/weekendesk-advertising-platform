import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendEmail } from './resend-client.js';

describe('sendEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('manda la petición a Resend con el remitente, destinatarios y cuerpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEmail(
      {
        from: 'Weekendesk Advertising <onboarding@resend.dev>',
        to: ['cliente@example.com'],
        cc: ['comercial@weekendesk.fr'],
        bcc: ['contracting@weekendesk.fr'],
        replyTo: 'comercial@weekendesk.fr',
        subject: 'Asunto',
        html: '<p>hola</p>',
        text: 'hola',
      },
      'test-api-key',
    );

    expect(result).toEqual({ ok: true, id: 'email_123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-api-key' });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      from: 'Weekendesk Advertising <onboarding@resend.dev>',
      to: ['cliente@example.com'],
      cc: ['comercial@weekendesk.fr'],
      bcc: ['contracting@weekendesk.fr'],
      reply_to: 'comercial@weekendesk.fr',
      subject: 'Asunto',
    });
  });

  it('devuelve el error de Resend si la respuesta no es ok, sin lanzar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => '{"message":"dominio no verificado"}',
      }),
    );

    const result = await sendEmail(
      { from: 'a@b.com', to: ['c@d.com'], subject: 's', html: 'h', text: 't' },
      'key',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('422');
      expect(result.error).toContain('dominio no verificado');
    }
  });

  it('devuelve el error como resultado, no como excepción, si fetch rechaza (red caída)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await sendEmail(
      { from: 'a@b.com', to: ['c@d.com'], subject: 's', html: 'h', text: 't' },
      'key',
    );

    expect(result).toEqual({ ok: false, error: 'network down' });
  });
});
