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
import type { CreateQualityControlDto } from './dto/create-quality-control.dto';
import { QualityService } from './quality.service';

@Controller('quality')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.CALIDAD, ROLE_IDS.SUPERVISOR_AGRICOLA)
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  @Get('categories')
  getCategories() {
    return this.qualityService.getCategories();
  }

  /** GET /quality — Listar todos los controles (admin/calidad) */
  @Get()
  findAll(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.qualityService.findAll(query, request.user);
  }

  /** POST /quality — Registrar inspección de calidad */
  @Post()
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.CALIDAD)
  create(
    @Body() dto: CreateQualityControlDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.qualityService.create(dto, request.user);
  }

  /** GET /quality/lots/:lotId — Historial de controles de un lote */
  @Get('lots/:lotId')
  findByLot(
    @Param('lotId') lotId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.qualityService.findByLot(lotId, query, request.user);
  }

  /** GET /quality/lots/:lotId/status — Estado de bloqueo del lote (5.4) */
  @Get('lots/:lotId/status')
  getLotStatus(
    @Param('lotId') lotId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.qualityService.getLotQualityStatus(lotId, request.user);
  }

  /** GET /quality/:id — Detalle de un control */
  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.qualityService.findOne(id, request.user);
  }
}
