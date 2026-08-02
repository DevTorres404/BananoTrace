import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';

describe('QualityController', () => {
  it('delegates category retrieval to the service', () => {
    const service = { getCategories: jest.fn().mockReturnValue([]) };
    const controller = new QualityController(
      service as unknown as QualityService,
    );

    expect(controller.getCategories()).toEqual([]);
    expect(service.getCategories).toHaveBeenCalledTimes(1);
  });
});
