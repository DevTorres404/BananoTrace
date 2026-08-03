import { PrismaClient } from '@prisma/client';
import {
  crearPRNG,
  elegir,
  elegirAnio,
  enteroEntre,
  fechaEnVentana,
  sumarDias,
} from './helpers/bi-data';
import type { ProductorVolumen } from './productores-fincas-volumen.seeder';

export async function seedCertificacionesVolumen(
  prisma: PrismaClient,
  productores: ProductorVolumen[],
): Promise<void> {
  const [tipos, entidades] = await Promise.all([
    prisma.tipoCertificacion.findMany({ select: { idTipoCertificacion: true, codigo: true } }),
    prisma.entidadCertificadora.findMany({ select: { idEntidadCertificadora: true } }),
  ]);
  if (tipos.length === 0 || entidades.length === 0) {
    console.log('⚠️  No hay catálogos de certificación sembrados; se omite.');
    return;
  }

  let creadas = 0;
  const contadorPorTipoAnio = new Map<string, number>();

  for (const productor of productores) {
    for (const finca of productor.fincas) {
      const rng = crearPRNG(3000 + Number(finca.idFinca) * 13);
      const cantidad = rng() < 0.45 ? 1 : 2;
      const anioBase = elegirAnio(rng, { 2023: 0.2, 2024: 0.3, 2025: 0.3, 2026: 0.2 });

      for (let i = 0; i < cantidad; i++) {
        // La segunda certificación es una renovación del año siguiente.
        const anio = i === 0 ? anioBase : anioBase + 1;
        if (anio > 2026) continue;

        const tipo = elegir(rng, tipos);
        const entidad = elegir(rng, entidades);
        const clave = `${tipo.codigo}-${anio}`;
        const secuencia = (contadorPorTipoAnio.get(clave) ?? 0) + 1;
        contadorPorTipoAnio.set(clave, secuencia);
        const numeroCertificado = `${tipo.codigo}-${anio}-${String(secuencia).padStart(3, '0')}`;

        const finVentana =
          anio >= 2026
            ? new Date()
            : new Date(Date.UTC(anio, 11, 31));
        const fechaEmision = fechaEnVentana(
          rng,
          new Date(Date.UTC(anio, 0, 1)),
          finVentana,
          { conHora: false },
        );
        // Vigencia de 12 a 24 meses, siempre después de la emisión.
        const fechaVencimiento = sumarDias(
          fechaEmision,
          enteroEntre(rng, 365, 730),
        );

        await prisma.certificacion.upsert({
          where: { numeroCertificado },
          update: {},
          create: {
            idFinca: finca.idFinca,
            idTipoCertificacion: tipo.idTipoCertificacion,
            idEntidadCertificadora: entidad.idEntidadCertificadora,
            numeroCertificado,
            fechaEmision,
            fechaVencimiento,
            documentoUrl: `https://docs.bananotrace.test/certificados/${numeroCertificado}.pdf`,
          },
        });
        creadas += 1;
      }
    }
  }

  console.log(`✅ Certificaciones de volumen creadas: ${creadas}.`);
}
