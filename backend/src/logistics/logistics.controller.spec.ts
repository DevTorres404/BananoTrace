import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';

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
});
