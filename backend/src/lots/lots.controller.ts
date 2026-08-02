import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/domain/authenticated-user';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AdvanceLotDto } from './dto/advance-lot.dto';
import type { CreateLotDto } from './dto/create-lot.dto';
import type { UpdateLotDto } from './dto/update-lot.dto';
import { LotsService } from './lots.service';

@Controller('lots')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  ROLE_IDS.ADMINISTRADOR,
  ROLE_IDS.PRODUCTOR,
  ROLE_IDS.CALIDAD,
  ROLE_IDS.LOGISTICA,
)
export class LotsController {
  constructor(private readonly lotsService: LotsService) {}

  @Post()
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.PRODUCTOR)
  create(@Body() dto: CreateLotDto, @Req() request: AuthenticatedRequest) {
    return this.lotsService.create(dto, request.user);
  }

  @Get('options')
  options(@Req() request: AuthenticatedRequest) {
    return this.lotsService.options(request.user);
  }

  @Get()
  findAll(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lotsService.findAll(query, request.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.lotsService.findOne(id, request.user);
  }

  @Patch(':id')
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.PRODUCTOR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLotDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lotsService.update(id, dto, request.user);
  }

  @Post(':id/advance')
  advance(
    @Param('id') id: string,
    @Body() dto: AdvanceLotDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lotsService.advance(id, dto, request.user);
  }
}
