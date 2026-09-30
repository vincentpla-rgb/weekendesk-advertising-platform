import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translateText } from './translate-text.js';

/**
 * `translateText` (CLAUDE.md, ronda 17, bloque 1, punto 4): nunca debe
 * bloquear el envío de un email, así que cada camino de fallo se prueba
 * explícitamente contra el texto original, nunca una excepción.
 */
describe('translateText', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('devuelve el texto original sin llamar a fetch cuando no hay texto (vacío o solo espacios)', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    expect(await translateText({ text: '', targetLanguage: 'FR' })).toBe('');
    expect(await translateText({ text: '   ', targetLanguage: 'FR' })).toBe('   ');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('devuelve el texto original sin llamar a fetch cuando falta ANTHROPIC_API_KEY', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await translateText({ text: 'El precio no incluye instalación', targetLanguage: 'FR' });

    expect(result).toBe('El precio no incluye instalación');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('devuelve el texto original si la API responde con un error HTTP', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    const result = await translateText({ text: 'motivo original', targetLanguage: 'EN' });

    expect(result).toBe('motivo original');
  });

  it('devuelve el texto original si fetch lanza (fallo de red)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const result = await translateText({ text: 'motivo original', targetLanguage: 'EN' });

    expect(result).toBe('motivo original');
  });

  it('devuelve el texto original si la respuesta no trae ningún bloque de texto reconocible', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [] }),
    }) as unknown as typeof fetch;

    const result = await translateText({ text: 'motivo original', targetLanguage: 'EN' });

    expect(result).toBe('motivo original');
  });

  it('devuelve la traducción cuando la API responde con éxito', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'Price excludes installation' }] }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await translateText({ text: 'El precio no incluye instalación', targetLanguage: 'EN' });

    expect(result).toBe('Price excludes installation');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.messages[0].content).toContain('English');
    expect(body.messages[0].content).toContain('El precio no incluye instalación');
  });

  it('recorta espacios de la traducción devuelta', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '  Traduction avec espaces  ' }] }),
    }) as unknown as typeof fetch;

    const result = await translateText({ text: 'texto', targetLanguage: 'FR' });

    expect(result).toBe('Traduction avec espaces');
  });
});
