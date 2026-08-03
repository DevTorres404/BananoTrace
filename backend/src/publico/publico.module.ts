import { Module } from '@nestjs/common';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicoController } from './publico.controller';
import { PublicoService } from './publico.service';

@Module({
  imports: [PrismaModule, BlockchainModule],
  controllers: [PublicoController],
  providers: [PublicoService],
})
export class PublicoModule {}
