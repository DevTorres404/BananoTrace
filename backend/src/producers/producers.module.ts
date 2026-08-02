import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProducersService } from './producers.service';
import { ProducersController } from './producers.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ProducersController],
  providers: [ProducersService],
  exports: [ProducersService],
})
export class ProducersModule {}
