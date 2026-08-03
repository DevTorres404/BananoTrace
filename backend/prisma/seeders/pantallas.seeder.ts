import { PrismaClient } from '@prisma/client';

export async function seedPantallas(prisma: PrismaClient) {
  const pantallas = [
    { idPantalla: 1, nombre: 'Dashboard', ruta: '/dashboard', icono: 'dashboard', descripcion: 'Panel principal con indicadores' },
    { idPantalla: 2, nombre: 'Productores', ruta: '/productores', icono: 'people', descripcion: 'Gestión de productores' },
    { idPantalla: 3, nombre: 'Fincas', ruta: '/fincas', icono: 'terrain', descripcion: 'Gestión de fincas y ubicaciones' },
    { idPantalla: 4, nombre: 'Lotes', ruta: '/lotes', icono: 'inventory_2', descripcion: 'Gestión de lotes de producción' },
    { idPantalla: 5, nombre: 'Buscador de Trazabilidad', ruta: '/buscar-trazabilidad', icono: 'search', descripcion: 'Búsqueda rápida de unidades trazables' },
    { idPantalla: 6, nombre: 'Control de Calidad', ruta: '/calidad', icono: 'verified', descripcion: 'Inspecciones y controles de calidad' },
    { idPantalla: 7, nombre: 'Empaque', ruta: '/empaque', icono: 'package_2', descripcion: 'Gestión de cajas y empaques' },
    { idPantalla: 8, nombre: 'Envíos', ruta: '/envios', icono: 'local_shipping', descripcion: 'Gestión de envíos y contenedores' },
    { idPantalla: 9, nombre: 'Blockchain', ruta: '/blockchain', icono: 'link', descripcion: 'Visualización de la cadena de bloques' },
    { idPantalla: 10, nombre: 'Consulta de Lote', ruta: '/consulta', icono: 'qr_code_scanner', descripcion: 'Consulta pública de trazabilidad por QR' },
    { idPantalla: 11, nombre: 'Usuarios', ruta: '/usuarios', icono: 'manage_accounts', descripcion: 'Administración de usuarios del sistema' },
    { idPantalla: 12, nombre: 'Certificaciones', ruta: '/certificaciones', icono: 'workspace_premium', descripcion: 'Certificaciones fitosanitarias de fincas' },
  ];

  for (const p of pantallas) {
    await prisma.pantalla.upsert({
      where: { idPantalla: p.idPantalla },
      update: {
        nombre: p.nombre,
        ruta: p.ruta,
        icono: p.icono,
        descripcion: p.descripcion
      },
      create: p,
    });
  }
  console.log('✅ Pantallas creadas.');
}
