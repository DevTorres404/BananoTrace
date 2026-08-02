-- Link authentication accounts to their producer business entity.
-- The relation is nullable because only PRODUCTOR accounts require this scope.
ALTER TABLE "usuarios"
ADD COLUMN "id_productor" BIGINT;

CREATE INDEX "usuarios_id_productor_idx"
ON "usuarios"("id_productor");

ALTER TABLE "usuarios"
ADD CONSTRAINT "usuarios_id_productor_fkey"
FOREIGN KEY ("id_productor")
REFERENCES "productores"("id_productor")
ON DELETE SET NULL
ON UPDATE CASCADE;
