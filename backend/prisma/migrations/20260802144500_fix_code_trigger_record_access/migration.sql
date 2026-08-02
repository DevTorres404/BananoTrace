DROP TRIGGER IF EXISTS "trg_codigo_finca" ON "fincas";
DROP TRIGGER IF EXISTS "trg_codigo_unidad" ON "unidades_trazables";
DROP TRIGGER IF EXISTS "trg_codigo_lote" ON "lotes_produccion";
DROP FUNCTION IF EXISTS "asignar_codigo_automatico"();

CREATE OR REPLACE FUNCTION "asignar_codigo_finca"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."codigo_finca" IS NULL OR BTRIM(NEW."codigo_finca") = '' THEN
    NEW."codigo_finca" := "siguiente_codigo_trazabilidad"('FINCA', 'FIN');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "asignar_codigo_unidad"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."codigo" IS NULL OR BTRIM(NEW."codigo") = '' THEN
    IF NEW."tipo" = 'LOTE' THEN
      NEW."codigo" := "siguiente_codigo_trazabilidad"('LOTE', 'BAN');
    ELSIF NEW."tipo" = 'EMPAQUE' THEN
      NEW."codigo" := "siguiente_codigo_trazabilidad"('EMPAQUE', 'CAJ');
    ELSIF NEW."tipo" = 'ENVIO' THEN
      NEW."codigo" := "siguiente_codigo_trazabilidad"('ENVIO', 'ENV');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "asignar_codigo_lote"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."codigo_lote" IS NULL OR BTRIM(NEW."codigo_lote") = '' THEN
    SELECT "codigo" INTO NEW."codigo_lote"
    FROM "unidades_trazables"
    WHERE "id_unidad" = NEW."id_unidad";

    IF NEW."codigo_lote" IS NULL OR BTRIM(NEW."codigo_lote") = '' THEN
      NEW."codigo_lote" := "siguiente_codigo_trazabilidad"('LOTE', 'BAN');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_codigo_finca"
BEFORE INSERT OR UPDATE OF "codigo_finca" ON "fincas"
FOR EACH ROW EXECUTE FUNCTION "asignar_codigo_finca"();

CREATE TRIGGER "trg_codigo_unidad"
BEFORE INSERT OR UPDATE OF "codigo" ON "unidades_trazables"
FOR EACH ROW EXECUTE FUNCTION "asignar_codigo_unidad"();

CREATE TRIGGER "trg_codigo_lote"
BEFORE INSERT OR UPDATE OF "codigo_lote" ON "lotes_produccion"
FOR EACH ROW EXECUTE FUNCTION "asignar_codigo_lote"();
