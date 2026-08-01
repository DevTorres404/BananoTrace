import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedUsuarios(prisma: PrismaClient) {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const passwordHash = await bcrypt.hash('admin123', saltRounds);

  const usuarios = [
    { nombres: 'Super', apellidos: 'Admin', correo: 'admin@coil.com', idRol: 1 },
    { nombres: 'Juan', apellidos: 'Pérez', correo: 'productor@coil.com', idRol: 2 },
    { nombres: 'Luis', apellidos: 'Ramírez', correo: 'tecnico@coil.com', idRol: 3 },
    { nombres: 'María', apellidos: 'Gómez', correo: 'inspector@coil.com', idRol: 4 },
    { nombres: 'Carlos', apellidos: 'López', correo: 'empacador@coil.com', idRol: 5 },
    { nombres: 'Pedro', apellidos: 'Suárez', correo: 'transportista@coil.com', idRol: 6 },
    { nombres: 'Rosa', apellidos: 'Villacís', correo: 'exportador@coil.com', idRol: 7 },
    { nombres: 'Ana', apellidos: 'Martínez', correo: 'logistica@coil.com', idRol: 8 },
    { nombres: 'Diego', apellidos: 'Cevallos', correo: 'consultor@coil.com', idRol: 9 },
  ];

  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { correo: u.correo },
      update: {},
      create: {
        nombres: u.nombres,
        apellidos: u.apellidos,
        correo: u.correo,
        claveHash: passwordHash,
        idRol: u.idRol,
        estado: true,
      },
    });
  }

  console.log('✅ Usuarios iniciales creados.');
  console.log('--- Credenciales de prueba (contraseña: admin123) ---');
  usuarios.forEach((u) => console.log(`   ${u.correo} → Rol ID ${u.idRol}`));
}
