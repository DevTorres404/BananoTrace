import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { ProductionModule } from './production/production.module';
import { QualityModule } from './quality/quality.module';
import { LogisticsModule } from './logistics/logistics.module';
import { TraceabilityModule } from './traceability/traceability.module';
import { AuthModule } from './auth/auth.module';
import { ProducersModule } from './producers/producers.module';
import { FarmsModule } from './farms/farms.module';
import { LotsModule } from './lots/lots.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { QrModule } from './qr/qr.module';
import { PublicoModule } from './publico/publico.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [PrismaModule, UsersModule, ProductionModule, QualityModule, LogisticsModule, TraceabilityModule, AuthModule, ProducersModule, FarmsModule, LotsModule, BlockchainModule, QrModule, PublicoModule, AnalyticsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
