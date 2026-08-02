import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/domain/authenticated-user';
import { ROLE_IDS } from '../auth/domain/role.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { CreateCertificationDto } from './dto/create-certification.dto';
import type { CreateFarmDto } from './dto/create-farm.dto';
import type { UpdateCertificationDto } from './dto/update-certification.dto';
import type { UpdateFarmDto } from './dto/update-farm.dto';
import { FarmsService } from './farms.service';

@Controller('farms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.SUPERVISOR_AGRICOLA, ROLE_IDS.GERENTE_PRODUCTOR)
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  create(@Body() dto: CreateFarmDto, @Req() request: AuthenticatedRequest) {
    return this.farmsService.create(dto, request.user);
  }

  @Get('dashboard')
  dashboard(@Req() request: AuthenticatedRequest) {
    return this.farmsService.dashboard(request.user);
  }

  @Get('certifications')
  findCertifications(
    @Query('farmId') farmId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farmsService.findCertifications(request.user, farmId);
  }

  @Get('certification-options')
  certificationOptions() {
    return this.farmsService.certificationOptions();
  }

  @Get()
  findAll(
    @Query() query: Record<string, string | undefined>,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farmsService.findAll(query, request.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.farmsService.findOne(id, request.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFarmDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farmsService.update(id, dto, request.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.farmsService.remove(id, request.user);
  }

  @Post(':id/certifications')
  createCertification(
    @Param('id') id: string,
    @Body() dto: CreateCertificationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farmsService.createCertification(id, dto, request.user);
  }

  @Patch(':id/certifications/:certificationId')
  updateCertification(
    @Param('id') id: string,
    @Param('certificationId') certificationId: string,
    @Body() dto: UpdateCertificationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farmsService.updateCertification(
      id,
      certificationId,
      dto,
      request.user,
    );
  }

  @Delete(':id/certifications/:certificationId')
  removeCertification(
    @Param('id') id: string,
    @Param('certificationId') certificationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.farmsService.removeCertification(
      id,
      certificationId,
      request.user,
    );
  }
}
