import { Module } from '@nestjs/common';
import { ProducersService } from './producers.service';
import { ProducersController } from './producers.controller';

@Module({
  controllers: [ProducersController],
  providers: [ProducersService],
})
export class ProducersModule {}
