import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_IDS } from '../../src/auth/domain/role.constants';

export async function seedUsuarios(
  prisma: PrismaClient,
  idProductorCanonico: bigint,
) {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const passwordHash = await bcrypt.hash('admin123', saltRounds);

  const usuarios = [
    {
      nombres: 'Super',
      apellidos: 'Admin',
      correo: 'admin@coil.com',
      idRol: ROLE_IDS.ADMINISTRADOR,
      idProductor: null,
    },
    {
      nombres: 'Juan',
      apellidos: 'Pérez',
      correo: 'supervisor@coil.com',
      idRol: ROLE_IDS.SUPERVISOR_AGRICOLA,
      idProductor: idProductorCanonico,
    },
    {
      nombres: 'Carlos',
      apellidos: 'Rodríguez',
      correo: 'gerente@coil.com',
      idRol: ROLE_IDS.GERENTE_PRODUCTOR,
      idProductor: idProductorCanonico,
    },
    {
      nombres: 'María',
      apellidos: 'Gómez',
      correo: 'calidad@coil.com',
      idRol: ROLE_IDS.CALIDAD,
      idProductor: null,
    },
    {
      nombres: 'Ana',
      apellidos: 'Martínez',
      correo: 'logistica@coil.com',
      idRol: ROLE_IDS.LOGISTICA,
      idProductor: null,
    },
    {
      nombres: 'Diego',
      apellidos: 'Cevallos',
      correo: 'cliente@coil.com',
      idRol: ROLE_IDS.CLIENTE,
      idProductor: null,
    },
  ];

  await prisma.$transaction(async (tx) => {
    for (const user of usuarios) {
      await tx.usuario.upsert({
        where: { correo: user.correo },
        update: {
          nombres: user.nombres,
          apellidos: user.apellidos,
          idRol: user.idRol,
          idProductor: user.idProductor,
          claveHash: passwordHash,
          estado: true,
        },
        create: {
          ...user,
          claveHash: passwordHash,
          estado: true,
        },
      });
    }
  });

  console.log('✅ Un usuario canónico por rol creado o actualizado.');
  console.log('--- Credenciales de prueba (contraseña: admin123) ---');
  usuarios.forEach((user) =>
    console.log(`   ${user.correo} → Rol ID ${user.idRol}`),
  );
}
