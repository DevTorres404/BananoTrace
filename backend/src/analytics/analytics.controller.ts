import { Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { EtlService } from './etl.service';
import type { AuthenticatedRequest } from '../auth/domain/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLE_IDS } from '../auth/domain/role.constants';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
// Limitamos analytics a Administrador y Gerente Productor por ahora
@Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.GERENTE_PRODUCTOR)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly etlService: EtlService,
  ) {}

  @Get('produccion')
  produccion(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.analyticsService.produccion(request.user, query);
  }

  @Get('calidad')
  calidad(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.analyticsService.calidad(request.user, query);
  }

  @Get('logistica')
  logistica(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.analyticsService.logistica(request.user, query);
  }

  @Get('resumen')
  resumen(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.analyticsService.resumen(request.user, query);
  }

  /**
   * Refreshes all BI materialized views (fact_lotes, fact_envios).
   * Restricted to Administrador only — this is a potentially expensive operation.
   */
  @Post('etl/refresh')
  @HttpCode(200)
  @Roles(ROLE_IDS.ADMINISTRADOR)
  etlRefresh() {
    return this.etlService.refreshAll();
  }
}

