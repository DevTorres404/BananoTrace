# Cambios implementados: M7 (Blockchain), M8 (QR + Consulta pública), M9 (Paginación) y Seeders de volumen

> Documento interno para el equipo. No se referencia desde ninguna ruta de la API ni del
> frontend — no es accesible públicamente, solo vive en el repositorio.
>
> Implementado sobre `PLAN_M7_M8.md`, a pedido de Damian Torres (seeders masivos + QR
> corporativo/público) más M9 (paginación) y este mismo documento.

## Cómo revisar el trabajo

Se hizo en 5 ramas apiladas (cada una parte de la anterior), con un PR por rama:

| Rama | PR | Contenido |
|---|---|---|
| `gualter302/feat-m7-blockchain` | [#1](https://github.com/DevTorres404/BananoTrace/pull/1) | M7 completo |
| `gualter302/feat-m8-qr-publico` | [#2](https://github.com/DevTorres404/BananoTrace/pull/2) | M8 completo |
| `gualter302/feat-m9-paginacion` | [#3](https://github.com/DevTorres404/BananoTrace/pull/3) | M9 completo |
| `gualter302/feat-seeders-volumen` | [#4](https://github.com/DevTorres404/BananoTrace/pull/4) | Seeders de volumen + 3 bugs de instalación preexistentes |
| `gualter302/docs-cambios-m7-m8-m9` | (este) | Este documento |

Cada PR tiene su propio plan de pruebas y quedó verificado con `npx tsc --noEmit`, la suite de
Jest/Vitest, y (M7/M8/M9/seeders en conjunto) una corrida real de principio a fin contra una
base Postgres levantada con `docker compose up -d db`: migraciones, seed completo, backend y
frontend corriendo localmente, y pruebas manuales en el navegador.

---

## M7 · Blockchain (PoC)

**Qué hace:** cada vez que un lote, una caja de empaque o un envío avanza de fase, se genera
automáticamente un `RegistroBlockchain` encadenado (SHA-256) dentro de la misma transacción que
crea la transición — si la transacción falla, no queda un bloque huérfano.

**Archivos nuevos:**
- `backend/src/blockchain/blockchain-chain.ts` — núcleo puro (sin NestJS): canonicalización JSON
  determinista, cálculo/encadenamiento de hash con reintento ante colisión de índice,
  verificación de integridad de una cadena completa, evaluación de confirmación de un bloque.
  Se eligió que fuera puro (recibe un `Prisma.TransactionClient`, no depende de DI) para poder
  reutilizarlo tanto desde `BlockchainService` como desde el seeder de lotes de volumen, sin
  duplicar la lógica de hash en dos lugares.
- `backend/src/blockchain/blockchain.module.ts` / `.service.ts` / `.controller.ts` — envoltorio
  Nest: `GET /blockchain/instancias/:id` (lista bloques), `GET /blockchain/instancias/:id/verificar`
  (verifica integridad, roles ADMINISTRADOR/LOGISTICA), `POST /blockchain/procesar-pendientes`
  (pasa bloques `PENDIENTE` a `CONFIRMADO`/`ERROR`, rol ADMINISTRADOR).
- `frontend/src/app/features/blockchain/` — página `/blockchain` con selector de instancia,
  tabla de bloques y banner de integridad.

**Archivos modificados:** `lots.service.ts` y `logistics.service.ts` ahora inyectan
`BlockchainService` y llaman a `crearBloque` en los 5 puntos donde ya se creaba una
`TransicionEjecucion` (sin cambiar ninguna otra lógica de negocio existente).
`lot-detail.html` tiene un botón "Ver cadena". La ruta `/blockchain` en `app.routes.ts` —que
era un placeholder **sin ningún guard**— ahora está protegida (roles con acceso a lotes).

**Corrección al plan original:** no se necesitó ninguna migración; `RegistroBlockchain` ya
existía completo en el schema.

---

## M8 · QR corporativo/público y consulta pública

**Corrección importante al plan original:** el plan asumía que `UnidadTrazable` tenía un campo
`codigoQr`. En el schema real ese campo solo existe en `Empaque` (y ahí es un texto placeholder
`QR-<codigo>`, no una imagen — no se tocó, es una funcionalidad preexistente distinta). Como el
contenido de un QR es 100% derivable del campo `UnidadTrazable.codigo` (ya único), se decidió
**no migrar el schema**: el QR se genera on-demand como imagen PNG a partir de ese código.

**Dos módulos nuevos, separados por audiencia** (así lo pidió Damian: "un QR para las personas
con permisos y otro público, que no muestre info relevante"):

- **`backend/src/qr/`** (requiere sesión, mismos roles que acceso a lotes): `GET /qr/lotes/:id?tipo=corporativo|publico`.
  - `corporativo` → apunta a `/lotes/:id` (la vista interna protegida ya existente).
  - `publico` → apunta a `/consulta?codigo=<codigo>`.
  - La URL base sale de `FRONTEND_URL` (variable de entorno, documentada en `.env.prod.example`), nunca hardcodeada.
  - Nueva dependencia: `qrcode` (+ `@types/qrcode`).
- **`backend/src/publico/`** (sin guards, deliberadamente): `GET /publico/consulta?codigo=` y
  `GET /publico/instancias/:idInstancia/verificacion`. Expone **solo**: tipo, código, estado,
  finca (nombre/país/región), fechas de siembra/cosecha, línea de tiempo por fase (nombre, fecha,
  estado — **sin nombres de usuarios internos ni comentarios**), y el estado de integridad
  blockchain (`verificable`, `integra`, `bloques` — **nunca** hashes ni `payloadCanonico`).
  Verificado en el spec (`publico.service.spec.ts`) que la respuesta serializada nunca contiene
  las cadenas `"hashDatos"` ni `"payloadCanonico"`.

**Frontend:** botones "QR corporativo" / "QR público" en el detalle de lote (con vista previa y
descarga PNG); página pública `/consulta` (sin guard, como ya estaba pensado en el placeholder
original) con estados cargando/encontrado/no-encontrado.

---

## M9 · Paginación (Usuarios, Productores, Fincas)

Mismo patrón que ya usaban `lots`/`logistics`/`quality`: `page`/`pageSize` (cap 100),
`{ data, pagination: { page, pageSize, total, totalPages } }`. Se preservaron y movieron al
servidor los filtros que ya existían solo en el cliente (búsqueda por texto en los tres
catálogos, rol/estado en usuarios, cuenta vinculada en productores) para no perderlos al paginar.

**Detalle no obvio:** 3 tarjetas de métricas (`Georreferenciadas`, `Activos`/`Vinculados` en
usuarios y productores) antes reflejaban el listado completo; con paginación del lado servidor
solo se tiene la página actual en memoria, así que se relabelaron como "(página)" en vez de
mostrar un número que ahora sería engañoso.

**Efecto colateral bueno:** al tocar `user-form.spec.ts` se encontró y corrigió un test roto
preexistente (no relacionado con este trabajo): no proveía un mock de `ProducersService`, así que
el formulario hacía una llamada HTTP real que nunca resolvía a tiempo. Queda **un segundo fallo
preexistente sin tocar** (una regla de validación de rol/productor en `user-form.ts` que no
calza con los datos de fixture del test) — no se tocó por estar fuera de alcance; alguien debería
revisarlo.

---

## Seeders de volumen ("a lo maldito, para todo el sistema")

Nuevos archivos en `backend/prisma/seeders/`, todos siguiendo la convención ya usada por los
seeders existentes (`fincas.seeder.ts` como referencia): Prisma crudo, no se llama a los
services de NestJS.

| Seeder | Qué crea |
|---|---|
| `productores-fincas-volumen.seeder.ts` | 60 productores + 1-2 fincas cada uno (~90), en provincias bananeras reales de Ecuador (El Oro, Los Ríos, Guayas, Santa Elena) |
| `usuarios-volumen.seeder.ts` | 40 usuarios (`demo.<rol>.<n>@coil.com`, clave `demo12345`), distribuidos por rol |
| `certificaciones-volumen.seeder.ts` | 1-2 certificaciones por finca de volumen |
| `lotes-volumen.seeder.ts` | **240 lotes** con distribución de estados diseñada (ver abajo) |

**Distribución de estados de los 240 lotes** (para que la paginación y los dashboards muestren
variedad real, no todo `CERRADO`):

| Estado alcanzado | Cantidad | Nota |
|---|---|---|
| `EN_PRODUCCION` | 36 | No avanzan de fase |
| Fase CALIDAD, aprobado/observado | 36 | Control de calidad hecho, se detienen ahí sin pasar a empaque |
| Fase CALIDAD, rechazado | 24 | Bloqueados: replica la regla real de negocio (no se puede avanzar a empaque con el último control `RECHAZADO`) |
| `EMPACADO` | 48 | 1-4 cajas de empaque generadas |
| `EXPORTADO` | 60 | Con envío en tránsito |
| `CERRADO` | 36 | Envío entregado + cierre manual del lote |

**Fidelidad al sistema real:** el seeder de lotes replica paso a paso lo que hacen
`lots.service.ts::create/advance`, `logistics.service.ts::createEmpaque/createEnvio/advanceUnitFlow`
y `quality.service.ts::create` — misma secuencia de creación (unidad → instancia de flujo → fase
→ transición), mismos campos, y en cada transición llama a `registrarBloque` (el mismo código de
`blockchain-chain.ts` que usa la app en producción), así que los lotes avanzados tienen cadenas
de blockchain reales y verificables, no datos de relleno inconsistentes.

**Idempotencia:** cada seeder de volumen puede correrse más de una vez sin duplicar datos —
`productores-fincas-volumen`/`lotes-volumen` se saltan si ya hay suficientes registros (conteo),
`usuarios-volumen`/`certificaciones-volumen` usan upsert por clave natural (correo /
número de certificado).

### Bugs preexistentes encontrados y corregidos (no relacionados con M7/M8/M9)

Se encontraron mientras se probaba todo lo anterior contra una base Postgres real desde cero —
**bloqueaban instalar o correr el proyecto para cualquiera**, no solo para los seeders nuevos:

1. **Migración rota**: `20260802135730_add_tipo_documento_and_cleanup` nunca pudo aplicarse con
   éxito en ninguna base (dependía de una tabla que recién crea la migración posterior
   `20260802154500_add_domain_catalogs`, y además entraba en conflicto con ella). Se dejó como
   no-op, sin borrar el archivo del historial de migraciones.
2. **`backend/src/main.ts` no cargaba `.env`**: solo `seed.ts` y `prisma.config.ts` lo hacían.
   La app nunca pudo levantarse localmente fuera de Docker. Se agregó `dotenv.config()`.
3. **Rutas de Angular inválidas**: `usuarios/crear` y `usuarios/:id/editar` combinaban
   `redirectTo` con `canActivate`, algo que Angular ya no permite — esto rompía el arranque
   completo del frontend (pantalla en blanco, ni el login cargaba). Se quitó el guard redundante
   de esas dos rutas (el guard real ya está en la ruta destino `usuarios`).

---

## Cómo probar esto vos mismo

```bash
# 1. Levantar una base Postgres local (usa las credenciales de docker-compose.yml)
docker compose up -d db

# 2. Backend: crear backend/.env (ver .env.prod.example para las variables), luego:
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed        # es idempotente, se puede correr más de una vez
npm run start:dev

# 3. Frontend (otra terminal):
cd frontend
npm install
npm start                 # usa proxy.conf.json, ya apunta a localhost:3000
```

**Credenciales de prueba** (todas con las contraseñas de siempre, ver `usuarios.seeder.ts` /
`usuarios-volumen.seeder.ts`):
- `admin@coil.com` / `admin123` (ADMINISTRADOR)
- `supervisor@coil.com`, `gerente@coil.com`, `calidad@coil.com`, `logistica@coil.com`,
  `cliente@coil.com` / `admin123`
- `demo.<rol>.<n>@coil.com` (n empieza en 0) / `demo12345` — 40 cuentas de volumen

**Verificar cada criterio de aceptación:**
- Paginación: entrar a Usuarios/Productores/Fincas logueado como admin, cambiar de página sin
  perder los filtros.
- Blockchain: abrir cualquier lote `EXPORTADO`/`CERRADO`, botón "Ver cadena" → debe decir
  "✅ Cadena íntegra". Para probar la detección de alteración: `UPDATE registros_blockchain SET
  payload_canonico = payload_canonico || 'x' WHERE id_instancia = <N> AND indice = 0;` y volver
  a consultar la cadena → debe decir "❌ Cadena alterada" con el índice correcto.
- QR: en el detalle de un lote, "QR corporativo" (requiere sesión) vs "QR público" (apunta a
  `/consulta`, sin sesión).
- Consulta pública: abrir `/consulta?codigo=<codigoLote>` sin sesión iniciada.
