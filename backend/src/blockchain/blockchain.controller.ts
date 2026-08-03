import { BadRequestException, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlockchainService } from './blockchain.service';

@Controller('blockchain')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  ROLE_IDS.ADMINISTRADOR,
  ROLE_IDS.LOGISTICA,
  ROLE_IDS.SUPERVISOR_AGRICOLA,
  ROLE_IDS.GERENTE_PRODUCTOR,
  ROLE_IDS.CALIDAD,
)
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}

  @Get('instancias/:idInstancia')
  listarCadena(@Param('idInstancia') idInstanciaRaw: string) {
    return this.blockchainService.listarCadena(this.parseId(idInstanciaRaw));
  }

  @Get('instancias/:idInstancia/verificar')
  @Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.LOGISTICA)
  verificar(@Param('idInstancia') idInstanciaRaw: string) {
    return this.blockchainService.verificarCadena(this.parseId(idInstanciaRaw));
  }

  @Post('procesar-pendientes')
  @Roles(ROLE_IDS.ADMINISTRADOR)
  procesarPendientes() {
    return this.blockchainService.confirmarPendientes();
  }

  private parseId(raw: string): bigint {
    if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
      throw new BadRequestException('Identificador de instancia inválido');
    }
    return BigInt(raw);
  }
}
