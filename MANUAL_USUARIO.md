# 📘 Manual de Usuario — BananoTrace

> Sistema de trazabilidad integral para la cadena de exportación de banano. Permite registrar y auditar cada etapa del proceso: desde la siembra en finca hasta la entrega al cliente internacional.

---

## 📌 Índice

1. [Acceso al Sistema](#1-acceso-al-sistema)
2. [Roles y Permisos](#2-roles-y-permisos)
3. [Navegación General](#3-navegación-general)
4. [Módulo: Inicio (Dashboard)](#4-módulo-inicio-dashboard)
5. [Módulo: Productores](#5-módulo-productores)
6. [Módulo: Fincas](#6-módulo-fincas)
7. [Módulo: Lotes de Producción](#7-módulo-lotes-de-producción)
8. [Módulo: Certificaciones](#8-módulo-certificaciones)
9. [Módulo: Control de Calidad](#9-módulo-control-de-calidad)
10. [Módulo: Empaque](#10-módulo-empaque)
11. [Módulo: Envíos](#11-módulo-envíos)
12. [Módulo: Trazabilidad (QR)](#12-módulo-trazabilidad-qr)
13. [Módulo: Usuarios (Administración)](#13-módulo-usuarios-administración)
14. [Flujo Completo de un Lote](#14-flujo-completo-de-un-lote)
15. [Preguntas Frecuentes](#15-preguntas-frecuentes)

---

## 1. Acceso al Sistema

Ingresá a la URL del sistema en tu navegador (Chrome, Firefox o Edge recomendados).

### Pantalla de Login

Ingresá tu **correo electrónico** y **contraseña** y hacé clic en **Ingresar**.

**Credenciales de prueba por defecto:**

| Correo                  | Contraseña | Rol                  |
|-------------------------|------------|----------------------|
| admin@coil.com          | admin123   | Administrador        |
| supervisor@coil.com     | admin123   | Supervisor Agrícola  |
| gerente@coil.com        | admin123   | Gerente Productor    |
| calidad@coil.com        | admin123   | Control de Calidad   |
| logistica@coil.com      | admin123   | Logística            |
| cliente@coil.com        | admin123   | Cliente B2B          |

> ⚠️ **Cambiar contraseñas en producción.** Las credenciales anteriores son solo para ambientes de demostración.

---

## 2. Roles y Permisos

El sistema cuenta con **6 roles**. Cada rol tiene acceso únicamente a los módulos que necesita.

| Rol                     | Descripción                                                               |
|-------------------------|---------------------------------------------------------------------------|
| **Administrador**       | Acceso total al sistema. Configura usuarios, roles y supervisa todo.      |
| **Supervisor Agrícola** | Gestiona fincas, lotes y coordina actividades de campo.                  |
| **Gerente Productor**   | Visión global de la unidad productiva: fincas, lotes, envíos y usuarios. |
| **Control de Calidad**  | Registra inspecciones de calidad y supervisa el proceso de empaque.      |
| **Logística**           | Coordina empaques, envíos y exportación.                                 |
| **Cliente B2B**         | Consulta de trazabilidad de lotes vía código QR o buscador público.      |

### Matriz de acceso por módulo

| Módulo               | Admin | Supervisor | Gerente | Calidad | Logística | Cliente |
|----------------------|:-----:|:----------:|:-------:|:-------:|:---------:|:-------:|
| Inicio               | ✅    | ✅         | ✅      | ✅      | ✅        | ✅      |
| Productores          | ✅    | —          | —       | —       | —         | —       |
| Fincas               | ✅    | ✅         | ✅      | —       | —         | —       |
| Lotes                | ✅    | ✅         | ✅      | ✅      | ✅        | —       |
| Certificaciones      | ✅    | ✅         | ✅      | —       | —         | —       |
| Control de Calidad   | ✅    | ✅         | ✅      | ✅      | —         | —       |
| Empaque              | ✅    | —          | ✅      | ✅      | ✅        | —       |
| Envíos               | ✅    | —          | ✅      | —       | ✅        | —       |
| Trazabilidad / QR    | ✅    | ✅         | ✅      | —       | ✅        | ✅      |
| Usuarios             | ✅    | —          | ✅      | —       | —         | —       |

---

## 3. Navegación General

### Menú lateral (sidebar)

El menú izquierdo organiza las funciones en **5 secciones**:

- 🏠 **Inicio** — Panel de resumen general.
- 🌱 **Producción** — Productores, Fincas, Lotes, Certificaciones.
- ⚙️ **Procesos** — Control de Calidad, Empaque, Envíos.
- 🔗 **Trazabilidad** — Buscador por QR.
- 🔐 **Administración** — Gestión de Usuarios.

> El menú se adapta automáticamente según tu rol. Solo verás las secciones a las que tenés acceso.

### Barra superior (topbar)

En la esquina superior derecha encontrás:
- 🌙 **Cambio de tema** (claro / oscuro).
- 👤 **Menú de sesión**: muestra tu nombre, tu rol activo y la opción de **Cerrar Sesión**.

---

## 4. Módulo: Inicio (Dashboard)

Al ingresar, el dashboard muestra un resumen ejecutivo del estado operativo:

- **Tarjetas de resumen**: Fincas activas, lotes activos y plantas totales en producción.
- **Lista de fincas activas**: Las fincas más recientes con sus lotes en curso.

Los datos se filtran automáticamente según el rol del usuario activo.

---

## 5. Módulo: Productores

> 🔐 Solo disponible para el **Administrador**.

Gestión de las entidades productoras (empresas o personas dueñas de las fincas).

### Listado

- Tabla paginada con nombre, país, estado y vínculo a usuarios.
- **Filtros**: búsqueda por nombre, estado y vinculación a usuarios.

### Registrar un nuevo Productor

1. Hacé clic en **"+ Nuevo Productor"**.
2. Completá los campos: Nombre / Razón Social, País, Región, Localidad, RUC/NIT y Tipo de entidad.
3. Hacé clic en **Guardar**.

---

## 6. Módulo: Fincas

> 🔐 Disponible para **Administrador**, **Supervisor Agrícola** y **Gerente Productor**.

### Listado

- Tabla paginada con código, nombre, país, región, localidad y estado.
- **Panel de estadísticas** en la parte superior: fincas activas, lotes activos y certificaciones vigentes.
- **Filtros**: por nombre/código, país, productor, estado y certificaciones.

### Registrar una nueva Finca

1. Hacé clic en **"+ Nueva Finca"**.
2. Completá los campos obligatorios: Nombre, País, Región, Localidad, Área en hectáreas, coordenadas GPS y Productor asociado.
3. Hacé clic en **Guardar**.

> El código de finca se genera automáticamente (ej: `FIN-2026-000001`).

### Detalle de Finca

Al hacer clic en una finca, accedés a su ficha con:
- Información geográfica y del productor.
- Lista de **Certificaciones** vigentes (GlobalG.A.P., Rainforest Alliance, Orgánico, etc.).
- Opciones para agregar, editar o archivar certificaciones.

---

## 7. Módulo: Lotes de Producción

> 🔐 Disponible para **Administrador**, **Supervisor Agrícola**, **Gerente Productor**, **Calidad** y **Logística**.

Un **lote** representa un ciclo productivo completo de un área dentro de una finca.

### Listado

- Tabla paginada con código de lote, finca, variedad, estado y fechas.
- **Panel de estadísticas**: total de lotes, lotes activos y plantas en producción.
- **Filtros**: por código, finca, variedad, estado y rango de fechas.

### Estados posibles de un Lote

| Estado          | Significado                                                        |
|-----------------|--------------------------------------------------------------------|
| `PLANIFICADO`   | Lote registrado, producción aún no iniciada.                      |
| `EN_PRODUCCION` | Cultivo en campo, creciendo.                                      |
| `COSECHADO`     | Cosecha realizada, pendiente de inspección de calidad.            |
| `CERRADO`       | Ciclo productivo finalizado completamente.                        |

### Registrar un nuevo Lote

1. Hacé clic en **"+ Nuevo Lote"**.
2. Seleccioná la **Finca** y la **Variedad** de banano.
3. Ingresá las fechas de siembra, cosecha estimada y cantidad de plantas.
4. Hacé clic en **Guardar**.

> El código de lote se genera automáticamente (ej: `LOT-2026-000001`). El sistema crea simultáneamente una **unidad trazable** y activa el flujo blockchain del lote.

### Avanzar el estado de un Lote

Desde el detalle del lote, el botón **"Avanzar al siguiente paso"** permite pasar el lote al siguiente estado del flujo. Cada avance queda registrado en la cadena de trazabilidad.

---

## 8. Módulo: Certificaciones

> 🔐 Disponible para **Administrador**, **Supervisor Agrícola** y **Gerente Productor**.

Las certificaciones se gestionan desde la **ficha de cada finca** (ver Módulo Fincas → Detalle de Finca).

Cada certificación incluye:
- Organismo certificador.
- Fecha de emisión y fecha de vencimiento.
- Estado (vigente / vencida / archivada).

---

## 9. Módulo: Control de Calidad

> 🔐 Disponible para **Administrador**, **Supervisor Agrícola**, **Gerente Productor** y **Calidad**.

Registro de inspecciones de calidad realizadas a los lotes cosechados.

### Listado

- Tabla paginada con lote inspeccionado, fecha, resultado y porcentaje de rechazo.
- **Panel de resumen**: promedio de rechazo y tasa de aprobación.
- **Filtros**: por resultado, finca, rango de fechas.

### Registrar una Inspección de Calidad

1. Hacé clic en **"+ Nuevo Control"**.
2. Seleccioná el **Lote** a inspeccionar.
3. Completá: Fecha, Calibre (mm), Peso de muestra (kg), Porcentaje de rechazo y Resultado.
4. Agregá observaciones si es necesario y hacé clic en **Guardar**.

### Resultados posibles

| Resultado   | Descripción                                              |
|-------------|----------------------------------------------------------|
| `APROBADO`  | Lote apto para empaque y exportación.                    |
| `OBSERVADO` | Lote con deficiencias leves, puede continuar con nota.   |
| `RECHAZADO` | Lote no apto, sale del flujo de exportación.             |

---

## 10. Módulo: Empaque

> 🔐 Disponible para **Administrador**, **Gerente Productor**, **Calidad** y **Logística**.

Gestión de cajas preparadas para exportación.

### Estados de una Caja

| Estado        | Descripción                                         |
|---------------|-----------------------------------------------------|
| `DISPONIBLE`  | Caja empacada lista para ser asignada a un envío.   |
| `ASIGNADO`    | Caja incluida en un envío.                          |
| `EN_TRANSITO` | Caja en camino al destino.                          |
| `ENTREGADO`   | Caja recibida por el cliente.                       |

---

## 11. Módulo: Envíos

> 🔐 Disponible para **Administrador**, **Gerente Productor** y **Logística**.

Gestión de contenedores y embarques de exportación.

### Registrar un nuevo Envío

1. Hacé clic en **"+ Nuevo Envío"**.
2. Seleccioná **Naviera**, **Puerto de Origen** y **Puerto de Destino**.
3. Ingresá el número de contenedor, fecha de salida y temperatura de salida.
4. Asigná las **cajas** incluidas en ese envío.
5. Hacé clic en **Guardar**.

### Estados de un Envío

| Estado        | Descripción                                       |
|---------------|---------------------------------------------------|
| `PLANIFICADO` | Registrado, pendiente de carga.                   |
| `CARGADO`     | Cajas cargadas al contenedor.                     |
| `EN_TRANSITO` | Envío navegando al puerto de destino.             |
| `ENTREGADO`   | Mercancía recibida por el cliente.                |

---

## 12. Módulo: Trazabilidad (QR)

> 🔐 Disponible para **todos los roles**, incluyendo **Clientes B2B**.

Consulta del historial completo de trazabilidad de un lote o caja.

### Cómo usar el Buscador

1. Ingresá al módulo **"Trazabilidad → Buscador por QR"**.
2. Escaneá el código QR de la etiqueta o ingresá el código manualmente.
3. El sistema mostrará el **historial completo**: todas las etapas, fechas, responsables y hashes de blockchain.

### Consulta pública (sin login)

```
/publico/consulta?codigo=LOT-2026-XXXXXX
```

Esta URL puede ser compartida con clientes o auditores externos sin necesidad de que tengan usuario en el sistema.

---

## 13. Módulo: Usuarios (Administración)

> 🔐 Disponible para **Administrador** y **Gerente Productor**.

### Registrar un nuevo Usuario

1. Hacé clic en **"+ Nuevo Usuario"**.
2. Completá: Nombre, Apellidos, Correo, Rol y (si aplica) Productor al que pertenece.
3. Ingresá la contraseña temporal.
4. Hacé clic en **Guardar**.

> Los usuarios con rol **Supervisor Agrícola** o **Gerente Productor** deben estar vinculados a un Productor para que el sistema aplique los filtros de acceso correctamente.

### Activar / Desactivar

Desde el detalle del usuario podés activar o desactivar su acceso sin eliminar su historial en el sistema.

---

## 14. Flujo Completo de un Lote

```
[Siembra registrada]
       ↓
 PLANIFICADO → EN_PRODUCCION
                    ↓
             [Cosecha registrada]
                    ↓
               COSECHADO → Control de Calidad
                                 ↓
                          ┌──────┴──────┐
                     RECHAZADO     APROBADO / OBSERVADO
                          ↓               ↓
                      (Sale del     Empaque de cajas
                       flujo)            ↓
                                   Asignación a Envío
                                         ↓
                                    EN_TRANSITO
                                         ↓
                                      ENTREGADO
                                         ↓
                                       CERRADO
```

Cada transición queda registrada con un **hash criptográfico** en la blockchain interna que garantiza la inmutabilidad del historial.

---

## 15. Preguntas Frecuentes

**¿Cómo recupero mi contraseña?**
El reseteo lo realiza un usuario Administrador desde el módulo de Usuarios. No existe recuperación automática por correo.

**¿Qué pasa si cierro sesión sin guardar un formulario?**
Los datos no guardados se pierden. El sistema no guarda borradores automáticamente.

**¿Qué significa el icono de blockchain en el detalle de un lote?**
Indica que ese registro tiene un hash criptográfico que certifica su integridad. Si el dato fue modificado fuera del sistema, el hash no coincidirá.

**¿Puedo ver los lotes de otras fincas si soy Supervisor?**
No. Los Supervisores y Gerentes de Productor solo ven información asociada al Productor al que fueron vinculados al momento de su creación.

**¿El buscador por QR requiere login?**
No. La consulta pública (`/publico/consulta`) puede ser accedida sin autenticación por cualquier persona con el código del lote o la caja.

---

*Versión del manual: 1.0 — BananoTrace*

---

## 📎 Apéndice: Credenciales de los 6 Roles

> ⚠️ **Solo para ambientes de prueba/demostración.** Cambiá estas contraseñas antes de poner el sistema en producción real.

| Nombre           | Correo                  | Contraseña | Rol                     |
|------------------|-------------------------|------------|-------------------------|
| Super Admin      | admin@coil.com          | admin123   | Administrador           |
| Juan Pérez       | supervisor@coil.com     | admin123   | Supervisor Agrícola     |
| Carlos Rodríguez | gerente@coil.com        | admin123   | Gerente Productor       |
| María Gómez      | calidad@coil.com        | admin123   | Control de Calidad      |
| Ana Martínez     | logistica@coil.com      | admin123   | Logística               |
| Diego Cevallos   | cliente@coil.com        | admin123   | Cliente B2B             |
