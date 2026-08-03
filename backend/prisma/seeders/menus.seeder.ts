import { PrismaClient } from '@prisma/client';

export async function seedMenus(prisma: PrismaClient) {
  // ── Parent menu items (no screen, just grouping) ──
  const padres = [
    { idMenu: 1, etiqueta: 'Inicio', icono: 'home', orden: 1, idPantalla: 1, idMenuPadre: null },
    { idMenu: 2, etiqueta: 'Producción', icono: 'agriculture', orden: 2, idPantalla: null, idMenuPadre: null },
    { idMenu: 3, etiqueta: 'Procesos', icono: 'settings', orden: 3, idPantalla: null, idMenuPadre: null },
    { idMenu: 4, etiqueta: 'Trazabilidad', icono: 'hub', orden: 4, idPantalla: null, idMenuPadre: null },
    { idMenu: 5, etiqueta: 'Administración', icono: 'admin_panel_settings', orden: 5, idPantalla: null, idMenuPadre: null },
  ];

  // ── Child menu items ──
  const hijos = [
    // Producción children
    { idMenu: 10, etiqueta: 'Productores', icono: 'people', orden: 1, idPantalla: 2, idMenuPadre: 2 },
    { idMenu: 11, etiqueta: 'Fincas', icono: 'terrain', orden: 2, idPantalla: 3, idMenuPadre: 2 },
    { idMenu: 12, etiqueta: 'Lotes', icono: 'inventory_2', orden: 3, idPantalla: 4, idMenuPadre: 2 },
    { idMenu: 13, etiqueta: 'Certificaciones', icono: 'workspace_premium', orden: 4, idPantalla: 12, idMenuPadre: 2 },
    // Procesos children
    { idMenu: 21, etiqueta: 'Control de Calidad', icono: 'verified', orden: 1, idPantalla: 6, idMenuPadre: 3 },
    { idMenu: 22, etiqueta: 'Empaque', icono: 'package_2', orden: 2, idPantalla: 7, idMenuPadre: 3 },
    { idMenu: 23, etiqueta: 'Envíos', icono: 'local_shipping', orden: 3, idPantalla: 8, idMenuPadre: 3 },
    // Trazabilidad children
    { idMenu: 31, etiqueta: 'Buscador por QR', icono: 'qr_code_scanner', orden: 1, idPantalla: 10, idMenuPadre: 4 },
    // Administración children
    { idMenu: 40, etiqueta: 'Usuarios', icono: 'manage_accounts', orden: 1, idPantalla: 11, idMenuPadre: 5 },
  ];

  const allMenus = [...padres, ...hijos];

  for (const m of allMenus) {
    await prisma.menu.upsert({
      where: { idMenu: m.idMenu },
      update: {
        etiqueta: m.etiqueta,
        icono: m.icono,
        orden: m.orden,
        idPantalla: m.idPantalla,
        idMenuPadre: m.idMenuPadre,
      },
      create: {
        idMenu: m.idMenu,
        etiqueta: m.etiqueta,
        icono: m.icono,
        orden: m.orden,
        idPantalla: m.idPantalla,
        idMenuPadre: m.idMenuPadre,
      },
    });
  }
  console.log('✅ Menús creados.');
}
