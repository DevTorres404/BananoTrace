# Cambios: sesión, caché y filtros (agosto 2026)

Documento interno de equipo. Resume el trabajo hecho después de M7/M8/M9 y de los
seeders de volumen: corrección de datos repetidos en seeders, renovación de sesión
(refresh token), caché de navegación en el frontend, y auditoría/mejora de filtros
en las páginas de listado. No incluye instrucciones de cómo probarlo — eso se
documenta aparte.

## Índice

1. [Fix: datos repetidos en seeders](#1-fix-datos-repetidos-en-seeders)
2. [Renovación de sesión (refresh token)](#2-renovación-de-sesión-refresh-token)
3. [Caché de navegación](#3-caché-de-navegación)
4. [Auditoría y mejora de filtros](#4-auditoría-y-mejora-de-filtros)
5. [Pull requests](#5-pull-requests)

---

## 1. Fix: datos repetidos en seeders

**Rama:** `gualter302/fix-seeders-duplicados`

Los seeders de volumen (creados en la fase anterior) generaban nombres, direcciones
y cantidades de plantas repetidos porque el generador aleatorio (`mulberry32`,
sembrado con una semilla fija) podía producir la misma combinación de palabras más
de una vez en tandas grandes, y nada lo evitaba.

- **`backend/prisma/seeders/productores-fincas-volumen.seeder.ts`**
  - `nombreRazonSocial`: ahora reintenta hasta 30 veces con un `Set<string>` de
    nombres ya usados; si aun así colisiona, agrega un sufijo numérico incremental
    hasta encontrar uno libre.
  - `nombreFinca`: se extrajo a una función propia que agrega un índice al nombre
    cuando un productor tiene más de una finca, en vez de reutilizar el mismo
    nombre para todas.
  - `direccion`: antes se calculaba dos veces por separado (una en la rama de
    `update`, otra en la de `create`), con tiradas de números aleatorios distintas
    cada vez — lo que además desperdiciaba entropía del generador. Ahora se calcula
    una sola vez y se deduplica con un `Set<string>` propio.
- **`backend/prisma/seeders/lotes-volumen.seeder.ts`**
  - `cantidadPlantas` se deduplica por finca con un `Set<number>` en el contexto de
    flujo (`FlujoContext.plantasUsadas`): si el valor sorteado ya se usó, se
    incrementa hasta encontrar uno libre.
- **Migración `20260804000001_analytics_navigation_seed`**: se detectó, de paso,
  que esta migración insertaba datos de navegación (`pantallas`/`menus`) que
  dependían de filas creadas por el *seed* (que corre después de las migraciones,
  no antes) — rompía cualquier instalación desde cero. Se neutralizó como no-op
  (`SELECT 1;`) porque la ruta `/dashboard` ya sirve el mismo componente que se
  quería exponer con esos datos; no hay pérdida funcional.

## 2. Renovación de sesión (refresh token)

**Rama:** `gualter302/feat-refresh-token`

**Problema que resuelve:** el token de acceso duraba 24 horas y el frontend nunca
lo renovaba ni verificaba su expiración real — cerrar y volver a abrir el
navegador (o dejarlo abierto días) mantenía la sesión activa indefinidamente
mientras el `localStorage` no se limpiara a mano.

**Backend**

- El token de acceso ahora expira en **15 minutos** (antes 24h) —
  `backend/src/auth/auth.module.ts`, variable `JWT_ACCESS_EXPIRES_IN`.
- Se agrega un **token de renovación** (`refresh_token`) separado, firmado con su
  propio secreto (`JWT_REFRESH_SECRET`) y expiración de **7 días**
  (`JWT_REFRESH_EXPIRES_IN`). Ambos tokens se emiten juntos al hacer login, desde
  un único método `issueSession()` en `backend/src/auth/auth.service.ts`.
- Nuevo endpoint **`POST /api/auth/refresh`** (`backend/src/auth/auth.controller.ts`):
  recibe `{ refresh_token }`, valida que sea del tipo `refresh` y no haya expirado,
  confirma que el usuario siga activo (`UsersService.findById`, método nuevo en
  `backend/src/users/users.service.ts`), y devuelve un par nuevo de tokens.
- Variables nuevas documentadas en `.env.prod.example`: `JWT_ACCESS_EXPIRES_IN`,
  `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`.

**Frontend**

- `frontend/src/app/core/services/auth.ts`: guarda también el `refresh_token`
  (clave `refreshToken` en `localStorage`); nuevo método `refreshAccessToken()`
  que llama a `/api/auth/refresh` y reemplaza ambos tokens. Usa `share()` de RxJS
  para que, si varias peticiones disparan una renovación al mismo tiempo, solo se
  haga **una** llamada real al backend (no una por cada petición fallida).
- `frontend/src/app/core/auth/auth.interceptor.ts`: si una petición responde
  `401`, intenta renovar el token automáticamente y reintenta la petición
  original una vez; si la renovación también falla, cierra la sesión. Excluye de
  este flujo las propias llamadas a `/auth/login` y `/auth/refresh` (para no
  entrar en bucle).
- `frontend/src/app/core/auth/auth.guard.ts`: antes solo miraba si había un token
  guardado y no vencido. Ahora, si el token de acceso está vencido pero hay un
  refresh token disponible, intenta renovar la sesión *antes* de decidir si deja
  entrar a la ruta o redirige a `/login`.

## 3. Caché de navegación

**Rama:** `gualter302/feat-cache-navegacion`

**Problema que resuelve:** cada vez que se entraba a una sección (por ejemplo,
Fincas) y se navegaba a otra y se volvía, Angular destruía el componente
completo y volvía a pedir todo a la API desde cero — con la sensación de que
"la página siempre está cargando", incluso para volver a datos que ya se habían
visto segundos antes.

- **`frontend/src/app/core/routing/cached-route-reuse-strategy.ts`** (nuevo):
  implementación de `RouteReuseStrategy` de Angular que mantiene en memoria los
  componentes de las rutas marcadas explícitamente como cacheables
  (`shouldDetach`/`store`/`shouldAttach`/`retrieve`), en vez de destruirlos al
  salir de la ruta.
- **`frontend/src/app/app.config.ts`**: se registra la estrategia nueva como
  proveedor (`{ provide: RouteReuseStrategy, useClass: CachedRouteReuseStrategy }`).
- **`frontend/src/app/app.routes.ts`**: se marcó `data: { reuse: true }` en 8
  rutas de listado: `usuarios`, `productores`, `fincas`, `certificaciones`,
  `lotes` (solo el listado, no el detalle `lotes/:id`), `calidad`, `empaque`,
  `envios`. Deliberadamente **no** se cachean `analytics`/`dashboard` (deben
  reflejar datos en tiempo real) ni las rutas de detalle o públicas.

## 4. Auditoría y mejora de filtros

**Rama:** `gualter302/feat-filtros-funcionales`

Se revisaron las 9 páginas de listado de la app (usuarios, productores, fincas,
lotes, calidad, empaques, envíos, eventos de trazabilidad y certificaciones),
tanto el código como el comportamiento real contra la API (llamadas directas con
distintas combinaciones de filtros: búsqueda de texto, por estado, por rango de
fechas, por finca/región, etc.).

**Resultado:** en 8 de las 9 páginas los filtros ya eran funcionales — búsqueda y
filtros aplicados en el backend (no en el arreglo ya cargado en el navegador),
paginación que respeta los filtros activos al cambiar de página, y sin residuos
de un filtrado "solo en el cliente" que hubiera quedado de antes de la
paginación (M9).

**Se encontró y corrigió un problema real en Certificaciones**
(`frontend/src/app/features/farms/certifications-page/`):

- El buscador de texto disparaba una petición HTTP por **cada tecla presionada**
  — era el único listado de la app sin *debounce* ni envío por botón/formulario.
  Con una consulta de red lenta esto además podía traer respuestas fuera de
  orden y mostrar momentáneamente un resultado viejo.
- El componente arrastraba un bloque de comentarios internos que afirmaba,
  incorrectamente, que el backend no soportaba filtrar certificaciones por
  `estado`/búsqueda — cuando `FarmsService.findCertifications`
  (`backend/src/farms/farms.service.ts`) ya lo implementa correctamente
  (verificado en vivo: 71 vigentes + 63 vencidas = 134 total, sin huecos).

**Cambio aplicado:** se agregó un *debounce* de 350ms (`Subject` +
`debounceTime`/`distinctUntilChanged` de RxJS) al campo de búsqueda, y se
eliminaron los comentarios obsoletos. Verificado en el navegador: escribir
"organico" ahora genera una sola petición (`q=organico`) en vez de una por
letra.

## 5. Pull requests

| # | Rama | Título |
|---|------|--------|
| [#11](https://github.com/DevTorres404/BananoTrace/pull/11) | `gualter302/fix-seeders-duplicados` | fix(seeders): eliminar datos repetidos en productores, fincas y lotes |
| [#12](https://github.com/DevTorres404/BananoTrace/pull/12) | `gualter302/feat-refresh-token` | feat(auth): sesión con refresh token (access token corto de 15m) |
| [#13](https://github.com/DevTorres404/BananoTrace/pull/13) | `gualter302/feat-cache-navegacion` | feat(frontend): cachear páginas de listado al navegar (sin recarga) |
| [#14](https://github.com/DevTorres404/BananoTrace/pull/14) | `gualter302/feat-filtros-funcionales` | fix(frontend): auditoría de filtros + debounce en búsqueda de certificaciones |

Los cuatro PRs están abiertos, pendientes de revisión/merge a `main`.
