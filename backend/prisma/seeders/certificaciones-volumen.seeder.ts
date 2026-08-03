import { PrismaClient } from '@prisma/client';
import type { ProductorVolumen } from './productores-fincas-volumen.seeder';

export async function seedCertificacionesVolumen(
  prisma: PrismaClient,
  productores: ProductorVolumen[],
): Promise<void> {
  const [tipos, entidades] = await Promise.all([
    prisma.tipoCertificacion.findMany({ select: { idTipoCertificacion: true } }),
    prisma.entidadCertificadora.findMany({ select: { idEntidadCertificadora: true } }),
  ]);
  if (tipos.length === 0 || entidades.length === 0) {
    console.log('⚠️  No hay catálogos de certificación sembrados; se omite.');
    return;
  }

  let creadas = 0;
  let secuencia = 0;
  for (const productor of productores) {
    for (const finca of productor.fincas) {
      const cantidad = 1 + (secuencia % 2);
      for (let i = 0; i < cantidad; i++) {
        const numeroCertificado = `VOL-${String(finca.idFinca).padStart(6, '0')}-${i}`;
        const tipo = tipos[secuencia % tipos.length];
        const entidad = entidades[secuencia % entidades.length];
        const fechaEmision = new Date();
        fechaEmision.setUTCFullYear(fechaEmision.getUTCFullYear() - 1);
        const fechaVencimiento = new Date();
        fechaVencimiento.setUTCFullYear(fechaVencimiento.getUTCFullYear() + (secuencia % 3 === 0 ? -1 : 1));

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
          },
        });
        creadas++;
        secuencia++;
      }
    }
  }

  console.log(`✅ ${creadas} certificaciones de volumen creadas o actualizadas.`);
}
