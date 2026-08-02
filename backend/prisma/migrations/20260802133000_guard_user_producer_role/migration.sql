-- A business entity can only scope an account with the PRODUCTOR role (ID 2).
-- PRODUCTOR accounts may remain temporarily unlinked while an administrator
-- completes their assignment from producer management.
ALTER TABLE "usuarios"
ADD CONSTRAINT "usuarios_productor_role_check"
CHECK ("id_productor" IS NULL OR "id_rol" = 2);
