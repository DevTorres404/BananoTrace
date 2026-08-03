import { BadRequestException } from '@nestjs/common';
import { BlockchainController } from './blockchain.controller';
import { BlockchainService } from './blockchain.service';

describe('BlockchainController', () => {
  function buildController(overrides: Partial<Record<keyof BlockchainService, jest.Mock>> = {}) {
    const service = {
      listarCadena: jest.fn().mockResolvedValue([]),
      verificarCadena: jest.fn().mockResolvedValue({ integra: true, bloques: 0, errores: [] }),
      confirmarPendientes: jest.fn().mockResolvedValue({ confirmados: 0, errores: 0 }),
      ...overrides,
    };
    return {
      controller: new BlockchainController(service as unknown as BlockchainService),
      service,
    };
  }

  it('lists the chain for a given instance id', () => {
    const { controller, service } = buildController();

    controller.listarCadena('12');

    expect(service.listarCadena).toHaveBeenCalledWith(12n);
  });

  it('verifies the chain for a given instance id', () => {
    const { controller, service } = buildController();

    controller.verificar('12');

    expect(service.verificarCadena).toHaveBeenCalledWith(12n);
  });

  it('delegates processing of pending blocks', () => {
    const { controller, service } = buildController();

    controller.procesarPendientes();

    expect(service.confirmarPendientes).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-numeric instance id before reaching the service', () => {
    const { controller, service } = buildController();

    expect(() => controller.listarCadena('abc')).toThrow(BadRequestException);
    expect(service.listarCadena).not.toHaveBeenCalled();
  });
});
