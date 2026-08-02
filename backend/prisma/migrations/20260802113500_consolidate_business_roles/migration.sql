-- Consolidate nine operational roles into five stable business roles.
-- Existing users are preserved and reassigned; no account history is deleted.


UPDATE "usuarios"
SET "id_rol" = CASE
    WHEN "id_rol" = 3 THEN 2
    WHEN "id_rol" IN (4, 5) THEN 3
    WHEN "id_rol" IN (6, 7, 8) THEN 4
    WHEN "id_rol" = 9 THEN 5
    ELSE "id_rol"
END
WHERE "id_rol" BETWEEN 3 AND 9;

-- Preserve the workflow semantics while pointing phases to consolidated roles.
UPDATE "fases"
SET "id_rol_responsable" = CASE
    WHEN "id_rol_responsable" = 3 THEN 2
    WHEN "id_rol_responsable" IN (4, 5) THEN 3
    WHEN "id_rol_responsable" IN (6, 7, 8) THEN 4
    WHEN "id_rol_responsable" = 9 THEN 5
    ELSE "id_rol_responsable"
END
WHERE "id_rol_responsable" BETWEEN 3 AND 9;

DELETE FROM "rol_menu";
DELETE FROM "roles" WHERE "id_rol" IN (6, 7, 8, 9);

INSERT INTO "roles" ("id_rol", "nombre", "descripcion") VALUES
  (1, 'ADMINISTRADOR', 'Administración, configuración y seguridad del sistema'),
  (2, 'PRODUCTOR', 'Gestión de finca, producción y actividades agrícolas'),
  (3, 'CALIDAD', 'Control de calidad, inocuidad, clasificación y empaque'),
  (4, 'LOGISTICA', 'Transporte, documentación, envíos y exportación'),
  (5, 'CLIENTE', 'Cliente B2B autorizado para consultar trazabilidad de lotes')
ON CONFLICT ("id_rol") DO UPDATE SET
  "nombre" = EXCLUDED."nombre",
  "descripcion" = EXCLUDED."descripcion";

INSERT INTO "rol_menu" ("id_rol", "id_menu")
SELECT v.id_rol, v.id_menu
FROM (VALUES
  -- ADMINISTRADOR: acceso total.
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5),
  (1, 10), (1, 11), (1, 12), (1, 13),
  (1, 20), (1, 21), (1, 22), (1, 23),
  (1, 30), (1, 31), (1, 40),
  -- PRODUCTOR: finca, producción, eventos, calidad y consulta.
  (2, 1), (2, 2), (2, 3), (2, 4),
  (2, 10), (2, 11), (2, 12), (2, 13),
  (2, 20), (2, 21), (2, 31),
  -- CALIDAD: lote, eventos, control de calidad y empaque.
  (3, 1), (3, 2), (3, 3),
  (3, 12), (3, 20), (3, 21), (3, 22),
  -- LOGISTICA: empaque, envíos, blockchain y consulta.
  (4, 1), (4, 3), (4, 4),
  (4, 22), (4, 23), (4, 30), (4, 31),
  -- CLIENTE: consulta B2B de trazabilidad.
  (5, 1), (5, 4), (5, 31)
) AS v("id_rol", "id_menu")
WHERE EXISTS (SELECT 1 FROM "menus" WHERE "id_menu" = v."id_menu")
ON CONFLICT DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('roles', 'id_rol'),
  (SELECT MAX("id_rol") FROM "roles"),
  true
);
