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
import { ProducersService } from './producers.service';
import type { CreateProducerDto } from './dto/create-producer.dto';
import type { UpdateProducerDto } from './dto/update-producer.dto';

@Controller('producers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLE_IDS.ADMINISTRADOR, ROLE_IDS.PRODUCTOR)
export class ProducersController {
  constructor(private readonly producersService: ProducersService) {}

  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Post()
  create(@Body() dto: CreateProducerDto) {
    return this.producersService.create(dto);
  }

  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Get('assignable-users')
  findAssignableUsers(@Query('producerId') producerId?: string) {
    return this.producersService.findAssignableUsers(producerId);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.producersService.findAll(request.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.producersService.findOne(id, request.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProducerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.producersService.update(id, dto, request.user);
  }

  @Roles(ROLE_IDS.ADMINISTRADOR)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.producersService.remove(id);
  }
}
