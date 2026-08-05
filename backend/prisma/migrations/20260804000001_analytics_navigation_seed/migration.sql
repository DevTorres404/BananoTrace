-- Esta migración quedó anulada: es lógica de datos de seed (actualizar una pantalla,
-- insertar un menú, asignar rol_menu) escrita como migración de schema. Las migraciones
-- corren antes que `npx prisma db seed`, así que en una base nueva "pantallas"/"menus"
-- están vacías todavía y el INSERT de abajo viola la FK menus_id_pantalla_fkey.
-- La ruta /dashboard ya sirve la misma página de analíticas (ver app.routes.ts), así que
-- esto no bloquea la funcionalidad. Si se quiere el ítem de menú "Panel principal", esa
-- lógica debería vivir en pantallas.seeder.ts/menus.seeder.ts/rol-menus.seeder.ts, no acá.
SELECT 1;
