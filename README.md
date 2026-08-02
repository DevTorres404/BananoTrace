# COIL — Sistema de Trazabilidad de Banano

Sistema web de trazabilidad para la cadena de valor del banano (materia: Inteligencia de Negocios).
Stack: **NestJS + Prisma + PostgreSQL** (backend), **Angular** (frontend), **Docker Compose** (entorno).

---

## Requisitos

- [Docker](https://www.docker.com/products/docker-desktop/) (con Docker Compose incluido)
- Puertos libres: `5432` (PostgreSQL), `3000` (backend), `4200` (frontend)

## Levantar el entorno (desarrollo)

Desde la **raíz del repositorio**:

```bash
docker compose up --build
```

Esto levanta tres servicios:

| Servicio   | Imagen / build              | URL                          |
| ---------- | --------------------------- | ---------------------------- |
| `db`       | `postgres:15`               | `localhost:5432`             |
| `backend`  | `./backend/Dockerfile`      | `http://localhost:3000`      |
| `frontend` | `./frontend/Dockerfile`     | `http://localhost:4200`      |

La app se abre en **http://localhost:4200**. El frontend (nginx) redirige `/api/*` al backend, por lo que la API se consume por el mismo origen.

### 1. Aplicar migraciones de base de datos

**Importante:** el contenedor **no** aplica las migraciones automáticamente. En otra terminal, con los servicios arriba:

```bash
docker compose exec backend npx prisma migrate deploy
```

### 2. Cargar datos iniciales (seeders)

```bash
docker compose exec backend npx prisma db seed
```

El seeder crea los datos base del sistema (usuarios/roles, flujos, fases y catálogo de variedades, entre otros). Los usuarios iniciales y sus contraseñas quedan definidos en `backend/prisma/seeders/`.

### Verificación rápida

- Frontend: `http://localhost:4200`
- API backend (health/raíz): `http://localhost:3000`
- PostgreSQL: `localhost:5432`, usuario `admin`, contraseña `password123`, base `coil_db`

---

## Comandos útiles

```bash
# Ver logs de un servicio
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db

# Detener (conserva los datos en el volumen)
docker compose down

# Detener y borrar volumen de datos (¡elimina la base!)
docker compose down -v

# Reconstruir imágenes tras cambios en código
docker compose up --build

# Ejecutar un comando dentro de un servicio
docker compose exec backend sh
```

---

## Solución de problemas

| Problema | Causa probable | Solución |
| --- | --- | --- |
| `ECONNREFUSED` en el backend al arrancar | La base aún no está lista | `docker compose restart backend` (o `up` de nuevo; los servicios usan `restart: unless-stopped`) |
| Tablas no encontradas / `P2021` | Migraciones sin aplicar | `docker compose exec backend npx prisma migrate deploy` |
| Sin datos de prueba | Seeders sin correr | `docker compose exec backend npx prisma db seed` |
| Cambios de código no se ven | Imagen sin reconstruir | `docker compose up --build` |
| Puerto ocupado | Otro proceso en 5432/3000/4200 | Detener el proceso o cambiar el mapeo en `docker-compose.yml` |
| Login falla con usuarios seed | Seeders no corrieron o base reseteada | Correr el seed de nuevo (los seeders son idempotentes) |

---

## Estructura relevante

```
COIL/
├── docker-compose.yml          # Entorno de desarrollo
├── backend/                    # API NestJS + Prisma
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma       # Modelo de datos
│   │   ├── migrations/         # Migraciones versionadas
│   │   └── seeders/            # Datos iniciales
│   └── src/                    # Módulos (auth, users, lots, flujos, traceability, ...)
└── frontend/                   # SPA Angular
    ├── Dockerfile
    └── src/app/features/       # Módulos de UI (lots, traceability, quality, ...)
```

## Documentación relacionada

- `PLAN_M7_M8.md` — plan de implementación: módulo Blockchain (PoC), Consulta Pública + QR y paginación de catálogos.
- `docs/COIL.tex` — informe académico del proyecto (no versionado en git).
