import { PrismaClient } from '@prisma/client';

export async function seedProductores(prisma: PrismaClient) {
  const productor = await prisma.productor.upsert({
    where: { identificacion: '0912345678001' },
    update: {
      nombreRazonSocial: 'Productor BananoTrace',
      telefono: '0999999999',
      correo: 'productor@coil.com',
      direccion: 'Santa Elena, Ecuador',
    },
    create: {
      identificacion: '0912345678001',
      nombreRazonSocial: 'Productor BananoTrace',
      telefono: '0999999999',
      correo: 'productor@coil.com',
      direccion: 'Santa Elena, Ecuador',
    },
  });

  console.log('✅ Productor canónico creado o actualizado.');
  return productor;
}
