import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';

@Module({
  imports: [PrismaModule],
  controllers: [QualityController],
  providers: [QualityService]
})
export class QualityModule {}
