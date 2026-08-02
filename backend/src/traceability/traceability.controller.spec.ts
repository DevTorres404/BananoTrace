import { TraceabilityController } from './traceability.controller';
import { TraceabilityService } from './traceability.service';

describe('TraceabilityController', () => {
  it('delegates document type retrieval to the service', () => {
    const service = { getDocumentTypes: jest.fn().mockReturnValue([]) };
    const controller = new TraceabilityController(
      service as unknown as TraceabilityService,
    );

    expect(controller.getDocumentTypes()).toEqual([]);
    expect(service.getDocumentTypes).toHaveBeenCalledTimes(1);
  });
});
