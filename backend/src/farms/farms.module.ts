import { Module } from '@nestjs/common';
import { FarmsService } from './farms.service';
import { FarmsController } from './farms.controller';

@Module({
  controllers: [FarmsController],
  providers: [FarmsService],
})
export class FarmsModule {}
