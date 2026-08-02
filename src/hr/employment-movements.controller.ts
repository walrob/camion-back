import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { EmploymentMovementsService } from './employment-movements.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { UploadFile } from 'src/common/decorators/upload-file.decorator';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('HR - Employment movements')
@ApiBearerAuth()
@Controller('hr/movements')
export class EmploymentMovementsController {
  constructor(
    private readonly movementsService: EmploymentMovementsService,
  ) {}

  @Post()
  @Auth(Role.ADMIN, Role.HR)
  @UploadFile()
  @ApiConsumes('multipart/form-data')
  create(
    @Body() dto: CreateMovementDto,
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.movementsService.create(dto, user, file);
  }

  /** Licencias y suspensiones vigentes hoy. */
  @Get('active')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  active() {
    return this.movementsService.active();
  }

  @Get(':id')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  findOne(@Param('id') id: string) {
    return this.movementsService.findOne(id);
  }

  @Get(':id/file')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  file(@Param('id') id: string) {
    return this.movementsService.getFileUrl(id);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.HR)
  @UploadFile()
  @ApiConsumes('multipart/form-data')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMovementDto,
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.movementsService.update(id, dto, user, file);
  }

  /** Reincorporación anticipada: cierra hoy el período abierto. */
  @Patch(':id/close')
  @Auth(Role.ADMIN, Role.HR)
  close(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.movementsService.close(id, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.HR)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.movementsService.remove(id, user);
  }
}
