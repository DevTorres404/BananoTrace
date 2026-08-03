import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { QrService } from './qr.service';

@Controller('qr')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  ROLE_IDS.ADMINISTRADOR,
  ROLE_IDS.SUPERVISOR_AGRICOLA,
  ROLE_IDS.CALIDAD,
  ROLE_IDS.LOGISTICA,
  ROLE_IDS.GERENTE_PRODUCTOR,
)
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Get('lotes/:id')
  generar(@Param('id') id: string) {
    return this.qrService.generar(id);
  }
}
