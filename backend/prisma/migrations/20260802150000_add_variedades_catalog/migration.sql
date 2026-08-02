-- CreateTable
CREATE TABLE "variedades" (
    "id_variedad" SMALLSERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "descripcion" VARCHAR(255),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "variedades_pkey" PRIMARY KEY ("id_variedad")
);

-- AlterTable
ALTER TABLE "lotes_produccion" ADD COLUMN "id_variedad" SMALLINT;

-- DropColumn
ALTER TABLE "lotes_produccion" DROP COLUMN "variedad";

-- CreateIndex
CREATE INDEX "lotes_produccion_id_variedad_idx" ON "lotes_produccion"("id_variedad");

-- CreateIndex
CREATE UNIQUE INDEX "variedades_codigo_key" ON "variedades"("codigo");

-- AddForeignKey
ALTER TABLE "lotes_produccion" ADD CONSTRAINT "lotes_produccion_id_variedad_fkey" FOREIGN KEY ("id_variedad") REFERENCES "variedades"("id_variedad") ON DELETE SET NULL ON UPDATE CASCADE;
