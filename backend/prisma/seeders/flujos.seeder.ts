import { PrismaClient } from '@prisma/client';

const FLOW_CODE = 'TRAZABILIDAD_BANANO_EXPORT';
const FLOW_VERSION = 1;

const phaseDefinitions = [
  {
    code: 'PRODUCCION',
    name: 'Producción',
    order: 1,
    responsibleRole: 'PRODUCTOR',
    requiresApproval: false,
  },
  {
    code: 'CALIDAD',
    name: 'Control de calidad',
    order: 2,
    responsibleRole: 'CALIDAD',
    requiresApproval: true,
  },
  {
    code: 'EMPAQUE',
    name: 'Empaque',
    order: 3,
    responsibleRole: 'CALIDAD',
    requiresApproval: false,
  },
  {
    code: 'LOGISTICA',
    name: 'Logística y exportación',
    order: 4,
    responsibleRole: 'LOGISTICA',
    requiresApproval: true,
  },
] as const;

export async function seedFlujos(prisma: PrismaClient) {
  const roleNames = phaseDefinitions.map((phase) => phase.responsibleRole);
  const roles = await prisma.rol.findMany({
    where: { nombre: { in: roleNames } },
    select: { idRol: true, nombre: true },
  });
  const roleIds = new Map(roles.map((role) => [role.nombre, role.idRol]));
  const missingRoles = roleNames.filter((roleName) => !roleIds.has(roleName));

  if (missingRoles.length > 0) {
    throw new Error(
      `No se puede crear el flujo base. Faltan roles: ${missingRoles.join(', ')}`,
    );
  }

  const flow = await prisma.flujo.upsert({
    where: {
      codigo_version: {
        codigo: FLOW_CODE,
        version: FLOW_VERSION,
      },
    },
    update: {
      nombre: 'Trazabilidad de banano de exportación',
      descripcion:
        'Flujo unificado de producción, calidad, empaque y logística.',
      activo: true,
    },
    create: {
      codigo: FLOW_CODE,
      version: FLOW_VERSION,
      nombre: 'Trazabilidad de banano de exportación',
      descripcion:
        'Flujo unificado de producción, calidad, empaque y logística.',
      activo: true,
    },
  });

  const phases = new Map<string, { idFase: number }>();

  for (const definition of phaseDefinitions) {
    const phase = await prisma.fase.upsert({
      where: {
        idFlujo_codigo: {
          idFlujo: flow.idFlujo,
          codigo: definition.code,
        },
      },
      update: {
        idRolResponsable: roleIds.get(definition.responsibleRole),
        nombre: definition.name,
        orden: definition.order,
        requiereAprobacion: definition.requiresApproval,
        activo: true,
      },
      create: {
        idFlujo: flow.idFlujo,
        idRolResponsable: roleIds.get(definition.responsibleRole),
        codigo: definition.code,
        nombre: definition.name,
        orden: definition.order,
        requiereAprobacion: definition.requiresApproval,
        activo: true,
      },
      select: { idFase: true },
    });

    phases.set(definition.code, phase);
  }

  const transitions = [
    ['PRODUCCION', 'CALIDAD'],
    ['CALIDAD', 'EMPAQUE'],
    ['EMPAQUE', 'LOGISTICA'],
  ] as const;

  for (const [originCode, destinationCode] of transitions) {
    const origin = phases.get(originCode);
    const destination = phases.get(destinationCode);

    if (!origin || !destination) {
      throw new Error(
        `No se pudo resolver la transición ${originCode} -> ${destinationCode}`,
      );
    }

    await prisma.transicionFase.upsert({
      where: {
        idFaseOrigen_idFaseDestino: {
          idFaseOrigen: origin.idFase,
          idFaseDestino: destination.idFase,
        },
      },
      update: { activo: true },
      create: {
        idFaseOrigen: origin.idFase,
        idFaseDestino: destination.idFase,
        activo: true,
      },
    });
  }

  console.log('✅ Flujo base de trazabilidad creado o actualizado.');
}
