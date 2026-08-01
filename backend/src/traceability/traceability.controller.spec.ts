import { Test, TestingModule } from '@nestjs/testing';
import { TraceabilityController } from './traceability.controller';

describe('TraceabilityController', () => {
  let controller: TraceabilityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TraceabilityController],
    }).compile();

    controller = module.get<TraceabilityController>(TraceabilityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
