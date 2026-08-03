import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicoService } from './publico.service';

@Controller('publico')
export class PublicoController {
  constructor(private readonly publicoService: PublicoService) {}

  @Get('consulta')
  consultar(@Query('codigo') codigo: string) {
    return this.publicoService.consultarPorCodigo(codigo);
  }

  @Get('instancias/:idInstancia/verificacion')
  verificacion(@Param('idInstancia') idInstancia: string) {
    return this.publicoService.verificacionResumen(idInstancia);
  }
}
