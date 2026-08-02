import { EstadoLote, PrismaClient } from '@prisma/client';

const FLOW_CODE = 'TRAZABILIDAD_BANANO_EXPORT';
const FLOW_VERSION = 1;

const phaseDefinitions = [
  {
    code: 'PRODUCCION',
    name: 'Producción',
    order: 1,
    responsibleRole: 'SUPERVISOR_AGRICOLA',
    requiresApproval: false,
    lotStateStart: EstadoLote.EN_PRODUCCION,
    lotStateEnd: EstadoLote.COSECHADO,
  },
  {
    code: 'CALIDAD',
    name: 'Control de calidad',
    order: 2,
    responsibleRole: 'CALIDAD',
    requiresApproval: true,
    lotStateStart: EstadoLote.COSECHADO,
    lotStateEnd: EstadoLote.COSECHADO,
  },
  {
    code: 'EMPAQUE',
    name: 'Empaque',
    order: 3,
    responsibleRole: 'CALIDAD',
    requiresApproval: false,
    lotStateStart: EstadoLote.COSECHADO,
    lotStateEnd: EstadoLote.EMPACADO,
  },
  {
    code: 'LOGISTICA',
    name: 'Logística y exportación',
    order: 4,
    responsibleRole: 'LOGISTICA',
    requiresApproval: true,
    lotStateStart: EstadoLote.EMPACADO,
    lotStateEnd: EstadoLote.EXPORTADO,
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
        estadoLoteInicio: definition.lotStateStart,
        estadoLoteFin: definition.lotStateEnd,
        activo: true,
      },
      create: {
        idFlujo: flow.idFlujo,
        idRolResponsable: roleIds.get(definition.responsibleRole),
        codigo: definition.code,
        nombre: definition.name,
        orden: definition.order,
        requiereAprobacion: definition.requiresApproval,
        estadoLoteInicio: definition.lotStateStart,
        estadoLoteFin: definition.lotStateEnd,
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

  // ────────────── FLUJO EMPAQUE ──────────────
  const empaqueFlow = await prisma.flujo.upsert({
    where: { codigo_version: { codigo: 'EMPAQUE_FLUJO', version: 1 } },
    update: {
      nombre: 'Flujo de Empaque',
      descripcion: 'Estados de una caja',
      activo: true,
    },
    create: {
      codigo: 'EMPAQUE_FLUJO',
      version: 1,
      nombre: 'Flujo de Empaque',
      descripcion: 'Estados de una caja',
      activo: true,
    },
  });

  const empPhases = [
    { code: 'DISPONIBLE', name: 'Disponible', order: 1, role: 'LOGISTICA' },
    { code: 'ASIGNADO', name: 'Asignado a envío', order: 2, role: 'LOGISTICA' },
    { code: 'EN_TRANSITO', name: 'En tránsito', order: 3, role: 'LOGISTICA' },
    { code: 'ENTREGADO', name: 'Entregado', order: 4, role: 'LOGISTICA' },
  ];
  const empPhaseIds = new Map<string, number>();

  for (const def of empPhases) {
    const p = await prisma.fase.upsert({
      where: {
        idFlujo_codigo: { idFlujo: empaqueFlow.idFlujo, codigo: def.code },
      },
      update: {
        idRolResponsable: roleIds.get(def.role),
        nombre: def.name,
        orden: def.order,
        activo: true,
      },
      create: {
        idFlujo: empaqueFlow.idFlujo,
        idRolResponsable: roleIds.get(def.role),
        codigo: def.code,
        nombre: def.name,
        orden: def.order,
        activo: true,
      },
    });
    empPhaseIds.set(def.code, p.idFase);
  }

  const empTransitions = [
    ['DISPONIBLE', 'ASIGNADO'],
    ['ASIGNADO', 'EN_TRANSITO'],
    ['EN_TRANSITO', 'ENTREGADO'],
  ] as const;
  for (const [origin, destination] of empTransitions) {
    await prisma.transicionFase.upsert({
      where: {
        idFaseOrigen_idFaseDestino: {
          idFaseOrigen: empPhaseIds.get(origin)!,
          idFaseDestino: empPhaseIds.get(destination)!,
        },
      },
      update: { activo: true },
      create: {
        idFaseOrigen: empPhaseIds.get(origin)!,
        idFaseDestino: empPhaseIds.get(destination)!,
        activo: true,
      },
    });
  }

  console.log('✅ Flujo de empaque creado.');

  // ────────────── FLUJO ENVÍO ──────────────
  const envioFlow = await prisma.flujo.upsert({
    where: { codigo_version: { codigo: 'ENVIO_FLUJO', version: 1 } },
    update: {
      nombre: 'Flujo de Envío',
      descripcion: 'Estados de un envío',
      activo: true,
    },
    create: {
      codigo: 'ENVIO_FLUJO',
      version: 1,
      nombre: 'Flujo de Envío',
      descripcion: 'Estados de un envío',
      activo: true,
    },
  });

  const envPhases = [
    { code: 'PLANIFICADO', name: 'Planificado', order: 1, role: 'LOGISTICA' },
    { code: 'CARGADO', name: 'Cargado', order: 2, role: 'LOGISTICA' },
    { code: 'EN_TRANSITO', name: 'En Tránsito', order: 3, role: 'LOGISTICA' },
    { code: 'ENTREGADO', name: 'Entregado', order: 4, role: 'LOGISTICA' },
  ];
  const envPhaseIds = new Map<string, number>();

  for (const def of envPhases) {
    const p = await prisma.fase.upsert({
      where: {
        idFlujo_codigo: { idFlujo: envioFlow.idFlujo, codigo: def.code },
      },
      update: {
        idRolResponsable: roleIds.get(def.role),
        nombre: def.name,
        orden: def.order,
        activo: true,
      },
      create: {
        idFlujo: envioFlow.idFlujo,
        idRolResponsable: roleIds.get(def.role),
        codigo: def.code,
        nombre: def.name,
        orden: def.order,
        activo: true,
      },
    });
    envPhaseIds.set(def.code, p.idFase);
  }

  const envTransitions = [
    ['PLANIFICADO', 'CARGADO'],
    ['CARGADO', 'EN_TRANSITO'],
    ['EN_TRANSITO', 'ENTREGADO'],
  ];
  for (const [o, d] of envTransitions) {
    await prisma.transicionFase.upsert({
      where: {
        idFaseOrigen_idFaseDestino: {
          idFaseOrigen: envPhaseIds.get(o)!,
          idFaseDestino: envPhaseIds.get(d)!,
        },
      },
      update: { activo: true },
      create: {
        idFaseOrigen: envPhaseIds.get(o)!,
        idFaseDestino: envPhaseIds.get(d)!,
        activo: true,
      },
    });
  }

  console.log('✅ Flujo de envío creado.');
}
