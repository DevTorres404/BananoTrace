import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { EtlService } from './etl.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, EtlService],
})
export class AnalyticsModule {}

