-- AlterTable
ALTER TABLE "empaques" ALTER COLUMN "codigo_caja" SET DEFAULT '';

-- AlterTable
ALTER TABLE "envios" ALTER COLUMN "codigo_envio" SET DEFAULT '';

-- AlterTable
ALTER TABLE "fincas" ALTER COLUMN "codigo_finca" SET DEFAULT '';

-- AlterTable
ALTER TABLE "flujo_instancias" ALTER COLUMN "codigo" SET DEFAULT '';

-- AlterTable
ALTER TABLE "lotes_produccion" ALTER COLUMN "codigo_lote" SET DEFAULT '';

-- AlterTable
ALTER TABLE "unidades_trazables" ALTER COLUMN "codigo" SET DEFAULT '';

-- Create sequences
CREATE SEQUENCE IF NOT EXISTS seq_finca_codigo START 1;
CREATE SEQUENCE IF NOT EXISTS seq_lote_codigo START 1;
CREATE SEQUENCE IF NOT EXISTS seq_empaque_codigo START 1;
CREATE SEQUENCE IF NOT EXISTS seq_envio_codigo START 1;
CREATE SEQUENCE IF NOT EXISTS seq_flujo_instancia_codigo START 1;

-- Trigger for Fincas (FIN-XXXXXX)
CREATE OR REPLACE FUNCTION generar_codigo_finca()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_finca IS NULL OR NEW.codigo_finca = '' THEN
    NEW.codigo_finca := 'FIN-' || LPAD(nextval('seq_finca_codigo')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generar_codigo_finca
BEFORE INSERT ON fincas
FOR EACH ROW EXECUTE FUNCTION generar_codigo_finca();

-- Trigger for FlujoInstancia (FLU-XXXXXX)
CREATE OR REPLACE FUNCTION generar_codigo_flujo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := 'FLU-' || LPAD(nextval('seq_flujo_instancia_codigo')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generar_codigo_flujo
BEFORE INSERT ON flujo_instancias
FOR EACH ROW EXECUTE FUNCTION generar_codigo_flujo();

-- Trigger for UnidadTrazable (LOT-XXXXXX, CAJ-XXXXXX, ENV-XXXXXX)
CREATE OR REPLACE FUNCTION generar_codigo_unidad()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    IF NEW.tipo = 'LOTE' THEN
      NEW.codigo := 'LOT-' || LPAD(nextval('seq_lote_codigo')::TEXT, 6, '0');
    ELSIF NEW.tipo = 'EMPAQUE' THEN
      NEW.codigo := 'CAJ-' || LPAD(nextval('seq_empaque_codigo')::TEXT, 6, '0');
    ELSIF NEW.tipo = 'ENVIO' THEN
      NEW.codigo := 'ENV-' || LPAD(nextval('seq_envio_codigo')::TEXT, 6, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generar_codigo_unidad
BEFORE INSERT ON unidades_trazables
FOR EACH ROW EXECUTE FUNCTION generar_codigo_unidad();

-- Triggers for Specific Tables to sync with UnidadTrazable
-- LoteProduccion
CREATE OR REPLACE FUNCTION sync_codigo_lote()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_lote IS NULL OR NEW.codigo_lote = '' THEN
    SELECT codigo INTO NEW.codigo_lote FROM unidades_trazables WHERE id_unidad = NEW.id_unidad;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_codigo_lote
BEFORE INSERT ON lotes_produccion
FOR EACH ROW EXECUTE FUNCTION sync_codigo_lote();

-- Empaque
CREATE OR REPLACE FUNCTION sync_codigo_caja()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_caja IS NULL OR NEW.codigo_caja = '' THEN
    SELECT codigo INTO NEW.codigo_caja FROM unidades_trazables WHERE id_unidad = NEW.id_unidad;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_codigo_caja
BEFORE INSERT ON empaques
FOR EACH ROW EXECUTE FUNCTION sync_codigo_caja();

-- Envio
CREATE OR REPLACE FUNCTION sync_codigo_envio()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_envio IS NULL OR NEW.codigo_envio = '' THEN
    SELECT codigo INTO NEW.codigo_envio FROM unidades_trazables WHERE id_unidad = NEW.id_unidad;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_codigo_envio
BEFORE INSERT ON envios
FOR EACH ROW EXECUTE FUNCTION sync_codigo_envio();
