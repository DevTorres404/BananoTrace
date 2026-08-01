import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { ProductionModule } from './production/production.module';
import { QualityModule } from './quality/quality.module';
import { LogisticsModule } from './logistics/logistics.module';
import { TraceabilityModule } from './traceability/traceability.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PrismaModule, UsersModule, ProductionModule, QualityModule, LogisticsModule, TraceabilityModule, AuthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
