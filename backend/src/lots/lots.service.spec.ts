import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  EstadoFlujo,
  EstadoLote,
  Prisma,
  ResultadoControl,
} from '@prisma/client';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { PrismaService } from '../prisma/prisma.service';
import { LotsService } from './lots.service';

describe('LotsService', () => {
  let service: LotsService;
  let prisma: any;

  const lotRow = {
    idLote: 8n,
    idUnidad: 9n,
    idFinca: 5n,
    codigoLote: 'BAN-2026-001',
    idVariedad: 1,
    variedadCat: { codigo: 'CAVENDISH', nombre: 'Cavendish' },
    fechaSiembra: new Date('2026-01-15T00:00:00.000Z'),
    fechaEstimadaCosecha: null,
    fechaCosecha: null,
    cantidadPlantas: 1000,
    pesoCosechadoKg: new Prisma.Decimal('250.50'),
    estado: EstadoLote.EN_PRODUCCION,
    fechaRegistro: new Date('2026-01-15T00:00:00.000Z'),
    fechaActualizacion: null,
    finca: {
      idFinca: 5n,
      codigoFinca: 'FIN-2026-001',
      nombre: 'Finca Global',
      pais: 'Colombia',
      region: 'Antioquia',
      localidad: 'Medellín',
      productor: { idProductor: 3n, nombreRazonSocial: 'Productor Global' },
    },
  };

  const producer = { sub: '2', idRol: ROLE_IDS.SUPERVISOR_AGRICOLA, idProductor: '3' };

  beforeEach(() => {
    prisma = {
      loteProduccion: {
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      finca: { findMany: jest.fn() },
      variedad: { findMany: jest.fn() },
      flujoInstanciaUnidad: { findFirst: jest.fn() },
      faseEjecucion: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      transicionFase: { findMany: jest.fn() },
      transicionEjecucion: { create: jest.fn() },
      flujoInstancia: { update: jest.fn() },
      controlCalidad: { findFirst: jest.fn() },
      $transaction: jest.fn((input: unknown) =>
        Array.isArray(input)
          ? Promise.all(input)
          : (input as (tx: typeof prisma) => Promise<unknown>)(prisma),
      ),
    };
    service = new LotsService(prisma as PrismaService);
  });

  it('returns active varieties from the catalog as lot options', async () => {
    prisma.finca.findMany.mockResolvedValue([
      { idFinca: 5n, codigoFinca: 'FIN-2026-001', nombre: 'Finca Global' },
    ]);
    prisma.variedad.findMany.mockResolvedValue([
      { idVariedad: 1, codigo: 'CAVENDISH', nombre: 'Cavendish' },
    ]);

    const result = await service.options(producer);

    expect(prisma.variedad.findMany).toHaveBeenCalledWith({
      where: { activo: true },
      select: { idVariedad: true, codigo: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });
    expect(result.farms[0].idFinca).toBe('5');
    expect(result.varieties).toEqual([
      expect.objectContaining({ codigo: 'CAVENDISH', nombre: 'Cavendish' }),
    ]);
  });

  it('paginates and scopes lot listing to the linked producer', async () => {
    prisma.loteProduccion.findMany.mockResolvedValue([lotRow]);
    prisma.loteProduccion.count.mockResolvedValue(1);
    prisma.loteProduccion.aggregate.mockResolvedValue({
      _sum: { cantidadPlantas: 1000 },
    });

    const result = await service.findAll(
      { page: '2', pageSize: '5', estado: EstadoLote.EN_PRODUCCION },
      producer,
    );

    expect(prisma.loteProduccion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: {
          AND: expect.arrayContaining([
            { finca: { idProductor: 3n } },
            { estado: EstadoLote.EN_PRODUCCION },
          ]),
        },
      }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        idLote: '8',
        codigoLote: 'BAN-2026-001',
        variedad: 'CAVENDISH',
        variedadNombre: 'Cavendish',
      }),
    );
    expect(result.summary).toEqual({
      totalLots: 1,
      activeLots: 1,
      totalPlants: 1000,
    });
    expect(prisma.loteProduccion.aggregate).toHaveBeenCalledWith({
      where: { finca: { idProductor: 3n } },
      _sum: { cantidadPlantas: true },
    });
  });

  it('serializes lot detail without leaking nested BigInt records', async () => {
    prisma.loteProduccion.findFirst.mockResolvedValue({
      ...lotRow,
      unidad: {
        eventos: [
          {
            idEvento: 30n,
            fechaEvento: new Date('2026-01-15T00:00:00.000Z'),
            ubicacion: null,
            descripcion: 'Siembra registrada',
            datosAdicionales: {},
            tipoEvento: { nombre: 'SIEMBRA' },
            usuario: { nombres: 'Ana', apellidos: 'Productora' },
          },
        ],
        instancias: [],
      },
    });

    const result = await service.findOne('8', producer);

    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result).not.toHaveProperty('unidad');
    expect(result.timeline[0]).toEqual(
      expect.objectContaining({ idEvento: '30', tipo: 'SIEMBRA' }),
    );
  });

  it('rejects advancing a phase owned by a different role', async () => {
    prisma.loteProduccion.findFirst.mockResolvedValue({
      idLote: 8n,
      idUnidad: 9n,
      fechaSiembra: null,
      fechaEstimadaCosecha: null,
      fechaCosecha: null,
    });
    prisma.flujoInstanciaUnidad.findFirst.mockResolvedValue({
      idInstancia: 12n,
      instancia: { idFlujo: 1, estado: EstadoFlujo.EN_PROCESO },
    });
    prisma.faseEjecucion.findFirst.mockResolvedValue({
      idEjecucion: 20n,
      idFase: 2,
      estado: EstadoFlujo.EN_PROCESO,
      fase: { idRolResponsable: ROLE_IDS.CALIDAD, requiereAprobacion: false },
    });

    await expect(service.advance('8', {}, producer)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('uses configured phase transitions and destination state when advancing', async () => {
    const admin = {
      sub: '1',
      idRol: ROLE_IDS.ADMINISTRADOR,
      idProductor: null,
    };
    prisma.loteProduccion.findFirst.mockResolvedValue({
      idLote: 8n,
      idUnidad: 9n,
      fechaSiembra: null,
      fechaEstimadaCosecha: null,
      fechaCosecha: null,
    });
    prisma.flujoInstanciaUnidad.findFirst.mockResolvedValue({
      idInstancia: 12n,
      instancia: { idFlujo: 1, estado: EstadoFlujo.EN_PROCESO },
    });
    prisma.faseEjecucion.findFirst.mockResolvedValue({
      idEjecucion: 20n,
      idFase: 1,
      estado: EstadoFlujo.EN_PROCESO,
      fase: {
        nombre: 'Producción',
        idRolResponsable: ROLE_IDS.SUPERVISOR_AGRICOLA,
        requiereAprobacion: false,
      },
    });
    prisma.transicionFase.findMany.mockResolvedValue([
      {
        faseDestino: {
          idFase: 2,
          orden: 2,
          idRolResponsable: ROLE_IDS.CALIDAD,
          estadoLoteInicio: EstadoLote.COSECHADO,
        },
      },
    ]);
    prisma.faseEjecucion.update.mockResolvedValue({});
    prisma.faseEjecucion.create.mockResolvedValue({ idEjecucion: 21n });
    prisma.transicionEjecucion.create.mockResolvedValue({});
    prisma.loteProduccion.update.mockResolvedValue({});
    jest.spyOn(service, 'findOne').mockResolvedValue({ idLote: '8' } as never);

    await service.advance('8', { comentario: 'Fase finalizada' }, admin);

    expect(prisma.faseEjecucion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idFase: 2,
          estado: EstadoFlujo.EN_PROCESO,
        }),
      }),
    );
    expect(prisma.loteProduccion.update).toHaveBeenCalledWith({
      where: { idLote: 8n },
      data: { estado: EstadoLote.COSECHADO },
    });
  });

  it('blocks the transition to packaging when the latest control was rejected', async () => {
    const qualityActor = {
      sub: '3',
      idRol: ROLE_IDS.CALIDAD,
      idProductor: null,
    };
    prisma.loteProduccion.findFirst.mockResolvedValue({
      idLote: 8n,
      idUnidad: 9n,
    });
    prisma.flujoInstanciaUnidad.findFirst.mockResolvedValue({
      idInstancia: 12n,
      instancia: { idFlujo: 1, estado: EstadoFlujo.EN_PROCESO },
    });
    prisma.faseEjecucion.findFirst.mockResolvedValue({
      idEjecucion: 20n,
      idFase: 2,
      estado: EstadoFlujo.EN_PROCESO,
      fase: {
        codigo: 'CALIDAD',
        nombre: 'Control de calidad',
        idRolResponsable: ROLE_IDS.CALIDAD,
        requiereAprobacion: false,
      },
    });
    prisma.transicionFase.findMany.mockResolvedValue([
      {
        faseDestino: {
          idFase: 3,
          codigo: 'EMPAQUE',
          orden: 3,
          idRolResponsable: ROLE_IDS.CALIDAD,
        },
      },
    ]);
    prisma.controlCalidad.findFirst.mockResolvedValue({
      resultado: ResultadoControl.RECHAZADO,
    });

    await expect(service.advance('8', {}, qualityActor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.faseEjecucion.update).not.toHaveBeenCalled();
  });
});
