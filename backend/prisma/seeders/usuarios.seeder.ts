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
      correo: 'productor@coil.com',
      idRol: ROLE_IDS.PRODUCTOR,
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

  const correosCanonicos = usuarios.map((usuario) => usuario.correo);

  const usuariosEliminados = await prisma.$transaction(async (tx) => {
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

    const { count } = await tx.usuario.deleteMany({
      where: { correo: { notIn: correosCanonicos } },
    });

    const totalUsuarios = await tx.usuario.count();
    if (totalUsuarios !== usuarios.length) {
      throw new Error(
        `El seed esperaba ${usuarios.length} usuarios canónicos y encontró ${totalUsuarios}.`,
      );
    }

    return count;
  });

  console.log(
    `✅ Un usuario canónico por rol; ${usuariosEliminados} cuentas adicionales eliminadas.`,
  );
  console.log('--- Credenciales de prueba (contraseña: admin123) ---');
  usuarios.forEach((user) =>
    console.log(`   ${user.correo} → Rol ID ${user.idRol}`),
  );
}
