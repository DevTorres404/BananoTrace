-- ============================================================
-- Seed: Analytics navigation entry
-- Registers "Panel principal" in the menu system linked to
-- the Dashboard screen (ruta=/analytics), assigned to
-- ADMINISTRADOR (id_rol=1) and GERENTE_PRODUCTOR (id_rol=6).
-- ============================================================

-- 1. Update the existing Dashboard screen to point to /analytics
UPDATE pantallas SET ruta = '/analytics' WHERE id_pantalla = 1;

-- 2. Fix the sequence in case it's behind the current max
SELECT setval('menus_id_menu_seq', (SELECT MAX(id_menu) FROM menus));

-- 3. Insert "Panel principal" menu item at position 0 (always first)
INSERT INTO menus (id_pantalla, id_menu_padre, etiqueta, icono, orden, estado)
SELECT 1, NULL, 'Panel principal', 'bar_chart', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE etiqueta = 'Panel principal' AND icono = 'bar_chart'
);

-- 4. Assign to ADMINISTRADOR (id_rol=1) only
INSERT INTO rol_menu (id_rol, id_menu)
SELECT r.id_rol, m.id_menu
FROM roles r
CROSS JOIN menus m
WHERE r.id_rol = 1
  AND m.etiqueta = 'Panel principal'
  AND m.icono = 'bar_chart'
ON CONFLICT DO NOTHING;

-- 5. Delete the old "Inicio" menu (id_pantalla=1)
DELETE FROM menus WHERE etiqueta = 'Inicio' AND id_pantalla = 1;
