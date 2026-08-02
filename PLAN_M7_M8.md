# Plan M7 · Blockchain (PoC) y M8 · Consulta Pública y QR

> Plan de implementación detallado para los módulos M7 y M8 del sistema de trazabilidad de banano (COIL).
> Estado verificado sobre el código real al 2026-08-02.

---

## 0. Estado actual (verificado en código, no asumido)

| Elemento | Estado | Detalle |
|---|---|---|
| Modelo `RegistroBlockchain` | ✅ Existe en schema | `backend/prisma/schema.prisma` líneas 535-554. Ya incluye `@@unique([idInstancia, indice])`, `idTransicion` único, `hashDatos` único (Char 64), `hashAnterior` nullable, `payloadCanonico` (Text), `algoritmo` default `SHA-256`, `estadoConfirmacion`. |
| Enum `EstadoConfirmacionBlockchain` | ✅ Existe | `PENDIENTE`, `CONFIRMADO`, `ERROR` (líneas 48-54). |
| Relaciones del modelo | ✅ Existen | `FlujoInstancia` y `TransicionEjecucion` referenciadas con `Restrict`. |
| Uso de `RegistroBlockchain` en backend | 🔴 No existe | `grep` en `backend/src` no encuentra ninguna referencia. El `.tex` lo describe como implementado, pero el código no lo confirma: **hay que construirlo**. |
| Puntos donde se crean transiciones | ✅ Ubicados | `backend/src/lots/lots.service.ts` (líneas 165, 541, 564) y `backend/src/logistics/logistics.service.ts` (líneas 717, 750). Son los puntos de inyección para generar el bloque. |
| Campo `UnidadTrazable.codigoQr` | ✅ Existe | `backend/prisma/schema.prisma` línea 478, `String? @unique @db.VarChar(255)`. |
| Rutas frontend `blockchain` y `consulta` | 🟡 Placeholder | `frontend/src/app/app.routes.ts` líneas 146-158 apuntan a `feature-placeholder`. |
| Librería de QR | 🔴 No existe | No hay dependencia QR en el proyecto. |

**Convenciones del proyecto que el plan respeta:**
- Backend NestJS con módulos autocontenidos (`src/<dominio>/`, DTOs, service, controller, spec).
- IDs `BigInt` serializados como `string` en la API (patrón `parseId`/`serialize` de `lots.service.ts` y `traceability.service.ts`).
- Frontend Angular standalone con rutas lazy por feature (`features/<dominio>/`), service + página.
- Roles actuales (5): `ADMINISTRADOR(1)`, `PRODUCTOR(2)`, `CALIDAD(3)`, `LOGISTICA(4)`, `CLIENTE(5)`.
- Guardas por rol en `data.roles` de cada ruta; la consulta pública (M8.2) **no** lleva guard.

---

## M7 · Blockchain (Prueba de Concepto)

**Backend**: nuevo módulo `backend/src/blockchain/`  
**Modelo**: `RegistroBlockchain` (ya en schema)  
**Estado**: 🔴 Por implementar

### 7.1 Generar bloque por transición

**Objetivo**: al registrarse una `TransicionEjecucion`, crear el `RegistroBlockchain` correspondiente de forma automática y atómica.

**Definición de hash (canonical):**
- `payloadCanonico` = serialización JSON canónica (claves ordenadas, sin espacios) de:
  `{ indice, idInstancia, idTransicion, fecha, datos, hashAnterior }` donde `datos` es el `datosAdicionales` de la transición.
- `hashDatos` = `SHA-256(payloadCanonico)` en hex minúscula (64 chars, coincide con `Char(64)`).
- El bloque génesis (`indice = 0` de la instancia) usa `hashAnterior = null`.

**Tareas:**
1. Crear `backend/src/blockchain/blockchain.module.ts` (importa `PrismaModule`).
2. Crear `backend/src/blockchain/blockchain.service.ts` con:
   - `private canonicaDatos(datos: unknown): string` — JSON canónico estable.
   - `async crearBloque(tx, args: { idInstancia, idTransicion, datosAdicionales })`:
     - calcula `indice = max(indice existente de la instancia) + 1` (o 0 si no hay bloques);
     - lee el último bloque de la instancia para `hashAnterior`;
     - construye `payloadCanonico`, calcula `hashDatos`;
     - inserta con `estadoConfirmacion: PENDIENTE`.
   - Manejo de colisiones: `idTransicion` y `hashDatos` son únicos; si el `create` falla con `P2002`, reintentar una vez recalculando (transición duplicada → error explícito).
3. Inyectar la llamada en **todos** los puntos donde se crea una transición, dentro de la **misma transacción Prisma** (`tx.transicionEjecucion.create` → `tx.registroBlockchain.create`):
   - `backend/src/lots/lots.service.ts` líneas 165, 541, 564.
   - `backend/src/logistics/logistics.service.ts` líneas 717, 750.
4. Agregar DTO/serialización: expone `idRegistroBlockchain`, `indice`, `hashDatos`, `hashAnterior`, `payloadCanonico`, `algoritmo`, `fechaRegistro`, `estadoConfirmacion` (IDs `BigInt` como `string`).

**Criterio de aceptación 7.1:**
- Al avanzar un lote o registrar una operación logística que cree transición, aparece un `RegistroBlockchain` con `hashDatos` de 64 hex y `indice` correlativo.
- Si la transacción Prisma falla, no queda un bloque huérfano (misma transacción).

### 7.2 Encadenamiento

**Objetivo**: garantizar integridad estructural de la cadena por instancia.

**Tareas:**
1. Bloque génesis: primer bloque de cada instancia con `hashAnterior = null` (ya soportado por el modelo).
2. Secuencia: cada bloque usa `hashAnterior = hashDatos` del bloque inmediatamente anterior (`indice - 1`).
3. Unicidad: `@@unique([idInstancia, indice])` y `idTransicion @unique` ya están en schema; no migrar nada.
4. Guarda de encadenamiento en `crearBloque`: leer el bloque `indice - 1` y lanzar error si el `hashAnterior` calculado no coincide con su `hashDatos` (protección contra escritura concurrente).

**Criterio de aceptación 7.2:**
- Query de los bloques de una instancia ordenados por `indice` muestra encadenamiento correcto: `bloque[i].hashAnterior === bloque[i-1].hashDatos` (excepto génesis).

### 7.3 Verificar integridad

**Objetivo**: endpoint que recorre la cadena de una `FlujoInstancia` y detecta alteraciones.

**Tareas:**
1. `GET /api/blockchain/instancias/:idInstancia/verificar` (rol: `ADMINISTRADOR`; opcional `LOGISTICA`).
2. En `blockchain.service.ts`, `async verificarCadena(idInstancia)`:
   - carga todos los bloques ordenados por `indice`;
   - valida: (a) secuencia de `indice` sin huecos, (b) `hashAnterior` encadenado, (c) recomputa `SHA-256(payloadCanonico)` y compara con `hashDatos` de cada bloque (detecta alteración del payload);
   - devuelve `{ integra: boolean, bloques: number, errores: [{ indice, motivo }] }`.
3. Endpoint público de lectura de estado (integra/sin integrar) para la ficha pública (M8.3): `GET /api/publico/instancias/:idInstancia/verificacion` sin auth — solo devuelve el booleano y conteo, nunca el payload completo.

**Criterio de aceptación 7.3:**
- Cadena intacta → `integra: true`.
- Modificar un `payloadCanonico` en BD (simulando manipulación) → `integra: false` con el `indice` del bloque alterado.

### 7.4 Visualizar cadena

**Objetivo**: frontend con vista de bloques encadenados por instancia de flujo.

**Tareas:**
1. `frontend/src/app/features/blockchain/blockchain.service.ts`:
   - `getChainByInstancia(idInstancia)` → lista de bloques;
   - `verifyChain(idInstancia)` → resultado de verificación.
2. `frontend/src/app/features/blockchain/blockchain-page/` (page standalone, lazy):
   - selector de instancia (por código o por lote) y tabla/tarjetas de bloques: `indice`, timestamp, `hashAnterior` → `hashDatos`, estado;
   - indicador visual de integridad (✅ íntegra / ❌ alterada) y detalle de errores;
   - enlace de entrada desde el detalle de lote (botón "Ver cadena" en `lot-detail.html`).
3. Ruta `blockchain` en `app.routes.ts` (línea 146) reemplaza el placeholder por la página real, con `data.roles: [ADMINISTRADOR]` (opcional `LOGISTICA`).

**Criterio de aceptación 7.4:**
- La vista muestra los bloques encadenados con hashes y timestamp; con una cadena alterada, marca el bloque corrupto y muestra el resultado de verificación.

### 7.5 Estado de confirmación

**Objetivo**: manejar `PENDIENTE → CONFIRMADO / ERROR`.

**Tareas:**
1. Al crear el bloque: `PENDIENTE` (ya es el default del modelo).
2. Confirmación en PoC (sin red externa): tras la creación exitosa en la misma transacción, marcar `CONFIRMADO` en un segundo paso (fuera de la transacción de creación, para no bloquear el flujo operativo) — p. ej. un job simple `confirmarPendientes()` que procesa bloques `PENDIENTE` y, si la verificación 7.3 del bloque pasa, los pasa a `CONFIRMADO`.
3. `ERROR`: cuando la generación del hash o la verificación falla (colisión `P2002` no recuperable, payload inválido), el bloque se marca `ERROR` y el servicio loguea el motivo.
4. Endpoint administrativo para re-procesar `ERROR`/`PENDIENTE` (opcional en PoC).

**Criterio de aceptación 7.5:**
- Los bloques recién creados nacen `PENDIENTE` y pasan a `CONFIRMADO` tras la verificación; un bloque con fallo queda `ERROR` y no rompe el flujo.

---

## M8 · Consulta Pública y Código QR

**Estado**: 🔴 Por implementar

### 8.1 Generar QR por lote

**Objetivo**: crear código QR con la URL de consulta pública del lote.

**Tareas:**
1. Agregar dependencia de generación de QR en backend (p. ej. `qrcode` npm) — verificar licencia/versión antes de fijar.
2. `backend/src/publico/publico.module.ts` + `publico.service.ts`:
   - `generarQr(idUnidad, baseUrl)`:
     - toma el `codigo` de la `UnidadTrazable` del lote;
     - URL = `${baseUrl}/consulta?codigo=${codigo}` (baseUrl desde configuración, no hardcodeada);
     - persiste la URL en `UnidadTrazable.codigoQr` (campo ya existente, línea 478);
     - devuelve el QR en PNG (data URI o buffer) + el valor `codigoQr`.
3. `GET /api/publico/:idUnidad/qr` (rol: `ADMINISTRADOR`, `PRODUCTOR`) → genera o reutiliza `codigoQr` y devuelve la imagen.
4. Frontend: botón "Generar QR" en el detalle de lote (`lot-detail.ts` + `lot-detail.html`) que descarga/muestra el QR.

**Criterio de aceptación 8.1:**
- El QR escaneado apunta a `/consulta?codigo=<codigo>` y `codigoQr` queda persistido en la unidad.

### 8.2 Página de consulta pública

**Objetivo**: ruta sin autenticación que muestra la ficha de trazabilidad.

**Tareas:**
1. `frontend/src/app/features/publico/consulta-page/` (standalone, **sin** `canActivate` con guard de auth):
   - lee `?codigo=` de la query string;
   - llama al backend público y muestra la ficha; si no encuentra, estado "no encontrado".
2. Backend público (nuevo controlador sin JWT, solo lectura):
   - `GET /api/publico/consulta?codigo=<codigo>` → resumen de la unidad: tipo, referencia (código lote/caja/envío), finca, fechas, estado.
3. Ruta `consulta` en `app.routes.ts` (línea 153) reemplaza el placeholder. Debe quedar fuera del árbol de rutas protegidas (verificar cómo se montan los guards raíz; la consulta no debe exigir sesión).
4. Cuidado de seguridad: la consulta pública expone **solo** datos de ficha (nunca `payloadCanonico` completo, nunca datos internos de usuarios).

**Criterio de aceptación 8.2:**
- Sin sesión, navegar a `/consulta?codigo=...` muestra la ficha del lote; un código inexistente muestra "no encontrado" sin romper la app.

### 8.3 Ficha de trazabilidad

**Objetivo**: resumen visual del lote con línea de tiempo y verificación blockchain.

**Tareas:**
1. `consulta-page` muestra:
   - encabezado: código de lote, variedad (catálogo), finca, estado;
   - línea de tiempo resumida: fases ejecutadas con fecha, fase y responsable (datos de `FlujoInstancia` + `FaseEjecucion`);
   - bloque de integridad: "Evidencia blockchain: íntegra ✅ / no verificable" usando `GET /api/publico/instancias/:idInstancia/verificacion` (M7.3) — sin exponer hashes crudos al cliente final (mostrar solo estado y conteo de bloques).
2. Estilos reutilizando el CSS de features existentes (`farms-page.css` patrón usado en `lots-page`).

**Criterio de aceptación 8.3:**
- La ficha pública muestra origen, producción, calidad, empaque y transporte resumidos + estado de integridad de la cadena.

---

## M9 · Paginación en catálogos (Usuarios, Productores y Fincas) — Extra

**Estado**: 🔴 Por implementar (trabajo independiente de M7/M8)

**Objetivo**: paginar los tres catálogos administrativos en backend y frontend, siguiendo el mismo patrón que ya usan `lots` y `traceability` (`page`, `pageSize`, `total`, `totalPages` + `skip`/`take`).

**Archivos objetivo (verificados en código):**

| Catálogo | Backend | Frontend |
|---|---|---|
| Usuarios | `backend/src/users/users.controller.ts`, `backend/src/users/users.service.ts` | `frontend/src/app/features/users/users-list/users-list.ts` |
| Productores | `backend/src/producers/producers.controller.ts`, `backend/src/producers/producers.service.ts` | `frontend/src/app/features/producers/producers-list/producers-list.ts` |
| Fincas | `backend/src/farms/farms.controller.ts`, `backend/src/farms/farms.service.ts` | `frontend/src/app/features/farms/farms-page/farms-page.ts` |

**Backend (por cada catálogo):**
1. En el controller, aceptar query params `page` y `pageSize` (defaults razonables: `page=1`, `pageSize=10`; cap en `100`, igual que en `traceability.service.ts`).
2. En el service:
   - `findAll` con `skip = (page - 1) * pageSize`, `take = pageSize`, `orderBy` estable (p. ej. `fechaRegistro desc` o nombre) para que la paginación sea determinista;
   - `count` con el mismo `where`;
   - devolver `{ data, pagination: { page, pageSize, total, totalPages } }` (mismo contrato que `LotPage`/`TraceabilityPage`).
3. Mantener la compatibilidad: si el frontend actual espera un array plano, ajustar el serializador del service y actualizar el contrato del frontend en el mismo cambio (no romper el endpoint a medias).
4. Preservar los filtros existentes (búsqueda/estado/rol según catálogo): el `where` de `count` debe ser idéntico al de `findMany`.

**Frontend (por cada catálogo):**
5. En el service del feature, tipar el contrato paginado (`Page<T>` con `data` + `pagination`) y enviar `page`/`pageSize` en los `HttpParams`.
6. En la página/listado:
   - estado `pagination = { page, pageSize, total, totalPages }` y `cargarPagina(page)` que re-solicita al cambiar de página;
   - controles de paginación (anterior/siguiente y total de páginas) reutilizando el estilo de `lots-page.html` (líneas ~60-70);
   - al filtrar o buscar, resetear a `page = 1`.

**Criterio de aceptación M9:**
- Con más de `pageSize` registros, la API devuelve `total`/`totalPages` correctos y cada página trae exactamente `pageSize` elementos.
- Los filtros combinados con paginación devuelven conteos correctos.
- La UI muestra controles de paginación y no pierde el filtro activo al cambiar de página.
- `npx tsc --noEmit` sin errores en backend y frontend; specs de los services actualizados.

---

## Orden de implementación y dependencias

```
M7.1 ──► M7.2 ──► M7.3 ──► M7.4 ──► M7.5
                 │
                 └──────────► M8.1 ──► M8.2 ──► M8.3
```

1. **M7.1 + M7.2** juntos (generación + encadenamiento son inseparables; el encadenamiento se valida dentro de `crearBloque`).
2. **M7.3** verificación (base para M7.5 y para la ficha pública M8.3).
3. **M7.4** visualización en frontend.
4. **M7.5** estados de confirmación (puede convivir con M7.1; el job de confirmación se agrega después de M7.3).
5. **M8.1** QR (independiente, requiere solo el campo `codigoQr`).
6. **M8.2 + M8.3** consulta pública + ficha (dependen de M7.3 para el bloque de integridad).
7. **M9** paginación de catálogos (Usuarios, Productores, Fincas): **independiente** de M7/M8 — puede ejecutarse en paralelo o cuando haya ventana, ya que toca archivos distintos (`users`, `producers`, `farms`).

**Nota sobre el `.tex`:** el informe académico declara la evidencia SHA-256 encadenada como implementada, pero el código aún no la tiene. Al terminar M7 conviene actualizar `docs/COIL.tex` (sección PoC) para que la declaración coincida con la realidad y agregar capturas en M7.4.

## Criterios de aceptación globales

- `npx tsc --noEmit` sin errores en backend y frontend.
- Pruebas: al menos un spec por service nuevo (`blockchain.service.spec.ts`, `publico.service.spec.ts`) siguiendo el patrón de `lots.service.spec.ts`.
- Migración no requerida: el schema ya contiene `RegistroBlockchain`, enum y `codigoQr`. Si se agrega algún campo nuevo, crear migración explícita.
- La consulta pública no expone datos internos ni requiere sesión.

## Riesgos y notas

- **Concurrencia**: dos transiciones simultáneas sobre la misma instancia pueden calcular el mismo `indice`; el `@@unique([idInstancia, indice])` + reintento en `crearBloque` lo resuelve, pero validarlo con prueba.
- **El `.tex` sobredeclara**: M7 está "implementado" en el informe pero no en el código — corregir el informe al cierre.
- **QR en consulta pública**: validar que la URL base en producción sea configurable (`env`), no `localhost` hardcodeado.
- **Placeholder frontend**: las rutas `blockchain` y `consulta` hoy muestran `feature-placeholder`; al reemplazarlas, verificar el test de `feature-placeholder.spec.ts` no quede colgado de rutas que ya no apuntan ahí.
