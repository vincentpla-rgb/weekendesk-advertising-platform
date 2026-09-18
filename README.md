# weekendesk-advertising-platform

Plataforma publicitaria de Weekendesk: calculadora de precios, construcción de
presupuestos y seguimiento comercial.

**La especificación completa está en [`CLAUDE.md`](./CLAUDE.md).** Es la fuente de
verdad del proyecto: cifras, reglas de cálculo, estados y controles. Cuando algo
no esté ahí, preguntar antes de inventar.

## Estado

| Módulo | Ruta | Estado |
|---|---|---|
| Esquema PostgreSQL / Supabase | `supabase/migrations/` | Hecho |
| Motor de precios | `src/pricing/` | Hecho |
| Tests unitarios | `src/pricing/__tests__/` | Hecho — 72 tests |
| Interfaz (Next.js) | — | No empezada |

## Desarrollo

```bash
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
```

Las migraciones se aplican con la CLI de Supabase (`supabase db push`) o con
`psql` en orden alfabético. La tercera carga los parámetros y el catálogo
iniciales; todo ello es editable después desde admin.

## Cómo está organizado el motor

`src/pricing/` es puro: no toca la base de datos. Recibe el juego de parámetros
y el catálogo, y devuelve el cálculo con su traza.

| Fichero | Qué hace |
|---|---|
| `money.ts` | Aritmética en céntimos enteros, suelo de margen, reparto a prorrata |
| `types.ts` | Tipos de entrada y salida |
| `parameters.ts` | Parámetros iniciales (35 €/h, 50 %, coeficientes, escalas) |
| `catalog.ts` | Los 19 soportes del rate card |
| `engine.ts` | Coste, multimercado, suelo, media buy, descuentos |
| `reach.ts` | Audiencia: sin dato medido, valor nulo |
| `checks.ts` | Controles previos al envío |
| `fiscal.ts` | Año fiscal mayo–abril |
