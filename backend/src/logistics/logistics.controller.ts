import {
  Body,
  Controller,
  Get,
  Param,
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
import type { AssignEmpaquesDto } from './dto/assign-empaques.dto';
import type { AdvanceLogisticsDto } from './dto/advance-logistics.dto';
import type { CreateEmpaqueDto } from './dto/create-empaque.dto';
import type { CreateEnvioDto } from './dto/create-envio.dto';
import { LogisticsService } from './logistics.service';

@Controller('logistics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get('options')
  @Roles(
    ROLE_IDS.ADMINISTRADOR,
    ROLE_IDS.CALIDAD,
    ROLE_IDS.LOGISTICA,
    ROLE_IDS.SUPERVISOR_AGRICOLA,
    ROLE_IDS.GERENTE_PRODUCTOR,
  )
  options(@Req() request: AuthenticatedRequest) {
    return this.logisticsService.options(request.user);
  }

  @Post('empaques')
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.CALIDAD, ROLE_IDS.GERENTE_PRODUCTOR)
  createEmpaque(
    @Body() dto: CreateEmpaqueDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.logisticsService.createEmpaque(dto, request.user);
  }

  @Get('empaques')
  @Roles(
    ROLE_IDS.ADMINISTRADOR,
    ROLE_IDS.CALIDAD,
    ROLE_IDS.LOGISTICA,
    ROLE_IDS.SUPERVISOR_AGRICOLA,
    ROLE_IDS.GERENTE_PRODUCTOR,
  )
  findAllEmpaques(@Query() query: Record<string, string | undefined>) {
    return this.logisticsService.findAllEmpaques(query);
  }

  @Post('empaques/:id/advance')
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR)
  advanceEmpaque(
    @Param('id') id: string,
    @Body() dto: AdvanceLogisticsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.logisticsService.advanceEmpaque(id, dto, request.user);
  }

  @Post('envios')
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR)
  createEnvio(
    @Body() dto: CreateEnvioDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.logisticsService.createEnvio(dto, request.user);
  }

  @Get('envios')
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR)
  findAllEnvios(@Query() query: Record<string, string | undefined>) {
    return this.logisticsService.findAllEnvios(query);
  }

  @Get('envios/:id')
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR)
  getEnvioById(@Param('id') id: string) {
    return this.logisticsService.getEnvioById(id);
  }

  @Post('envios/:id/advance')
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR)
  advanceEnvio(
    @Param('id') id: string,
    @Body() dto: AdvanceLogisticsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.logisticsService.advanceEnvio(id, dto, request.user);
  }

  @Post('envios/:id/empaques')
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA, ROLE_IDS.GERENTE_PRODUCTOR)
  assignEmpaques(
    @Param('id') id: string,
    @Body() dto: AssignEmpaquesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.logisticsService.assignEmpaques(id, dto, request.user);
  }
}
