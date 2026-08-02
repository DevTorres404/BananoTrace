import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TraceabilityController } from './traceability.controller';
import { TraceabilityService } from './traceability.service';

@Module({
  imports: [PrismaModule],
  controllers: [TraceabilityController],
  providers: [TraceabilityService]
})
export class TraceabilityModule {}
