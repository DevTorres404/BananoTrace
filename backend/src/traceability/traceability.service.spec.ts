import { Test, TestingModule } from '@nestjs/testing';
import { TraceabilityService } from './traceability.service';

describe('TraceabilityService', () => {
  let service: TraceabilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TraceabilityService],
    }).compile();

    service = module.get<TraceabilityService>(TraceabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
