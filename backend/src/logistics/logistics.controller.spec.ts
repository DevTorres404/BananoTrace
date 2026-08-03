import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ROLE_IDS } from '../auth/domain/role.constants';

describe('LogisticsController', () => {
  it('delegates catalog options to the service', () => {
    const service = { options: jest.fn().mockReturnValue({ puertos: [] }) };
    const controller = new LogisticsController(
      service as unknown as LogisticsService,
    );

    const request = { user: { sub: '1', idRol: 1 } };
    expect(controller.options(request as never)).toEqual({ puertos: [] });
    expect(service.options).toHaveBeenCalledWith(request.user);
  });

  it('keeps shipment queries restricted to internal logistics roles', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        LogisticsController.prototype.findAllEnvios,
      ),
    ).toEqual([
      ROLE_IDS.ADMINISTRADOR,
      ROLE_IDS.LOGISTICA,
      ROLE_IDS.GERENTE_PRODUCTOR,
    ]);
  });
});
