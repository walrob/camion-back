import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CertificationsService } from './certifications.service';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('HR - Certifications')
@ApiBearerAuth()
@Controller('hr/certifications')
export class CertificationsController {
  constructor(
    private readonly certificationsService: CertificationsService,
  ) {}

  @Post()
  @Auth(Role.ADMIN, Role.HR)
  create(
    @Body() dto: CreateCertificationDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.certificationsService.create(dto, user);
  }

  @Get('expiring')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  @ApiQuery({ name: 'days', required: false, type: Number })
  expiring(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days = 30,
  ) {
    return this.certificationsService.expiring(days);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.HR)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCertificationDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.certificationsService.update(id, dto, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.HR)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.certificationsService.remove(id, user);
  }
}
