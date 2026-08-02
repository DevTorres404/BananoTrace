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
import type { CreateDocumentDto } from './dto/create-document.dto';
import type { CreateEventDto } from './dto/create-event.dto';
import { TraceabilityService } from './traceability.service';

@Controller('traceability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  ROLE_IDS.ADMINISTRADOR,
  ROLE_IDS.SUPERVISOR_AGRICOLA,
  ROLE_IDS.CALIDAD,
  ROLE_IDS.LOGISTICA,
  ROLE_IDS.GERENTE_PRODUCTOR,
)
export class TraceabilityController {
  constructor(private readonly traceabilityService: TraceabilityService) {}

  /** GET /traceability/event-types — catálogo de tipos de evento */
  @Get('event-types')
  getEventTypes() {
    return this.traceabilityService.getEventTypes();
  }

  @Get('document-types')
  getDocumentTypes() {
    return this.traceabilityService.getDocumentTypes();
  }

  @Get('options')
  getOptions(@Req() request: AuthenticatedRequest) {
    return this.traceabilityService.getOptions(request.user);
  }

  @Get('events')
  findAllEvents(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.traceabilityService.findAll(query, request.user);
  }

  /** GET /traceability/units/:idUnidad/timeline — eventos de una unidad trazable */
  @Get('units/:idUnidad/timeline')
  getTimeline(
    @Param('idUnidad') idUnidad: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.traceabilityService.getTimeline(idUnidad, query, request.user);
  }

  /** GET /traceability/events/:id — detalle de un evento */
  @Get('events/:id')
  getEvent(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.traceabilityService.getEvent(id, request.user);
  }

  /** POST /traceability/events — registrar nuevo evento */
  @Post('events')
  createEvent(
    @Body() dto: CreateEventDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.traceabilityService.createEvent(dto, request.user);
  }

  /** POST /traceability/events/:id/documents — adjuntar documento de referencia */
  @Post('events/:id/documents')
  addDocument(
    @Param('id') id: string,
    @Body() dto: CreateDocumentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.traceabilityService.addDocument(id, dto, request.user);
  }
}
