import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isEmailDryRun, sendEmail } from './resend-client.js';

describe('sendEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EMAIL_DRY_RUN;
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

describe('isEmailDryRun', () => {
  beforeEach(() => {
    delete process.env.EMAIL_DRY_RUN;
  });
  afterEach(() => {
    delete process.env.EMAIL_DRY_RUN;
  });

  it('es false sin la variable, o con un valor que no sea true/1', () => {
    expect(isEmailDryRun()).toBe(false);
    process.env.EMAIL_DRY_RUN = 'false';
    expect(isEmailDryRun()).toBe(false);
    process.env.EMAIL_DRY_RUN = 'yes';
    expect(isEmailDryRun()).toBe(false);
  });

  it('es true con "true" o "1", sin distinguir mayúsculas', () => {
    process.env.EMAIL_DRY_RUN = 'true';
    expect(isEmailDryRun()).toBe(true);
    process.env.EMAIL_DRY_RUN = 'TRUE';
    expect(isEmailDryRun()).toBe(true);
    process.env.EMAIL_DRY_RUN = '1';
    expect(isEmailDryRun()).toBe(true);
  });
});

describe('sendEmail con EMAIL_DRY_RUN', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EMAIL_DRY_RUN;
  });

  it('no llama a fetch y devuelve un id dry-run reconocible', async () => {
    process.env.EMAIL_DRY_RUN = 'true';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const result = await sendEmail(
      { from: 'a@b.com', to: ['c@d.com'], subject: 'Asunto de prueba', html: '<p>h</p>', text: 'cuerpo de prueba' },
      'key',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toMatch(/^dry-run-/);
    }
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0]?.[0]).toContain('Asunto de prueba');
    logSpy.mockRestore();
  });
});
