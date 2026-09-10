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
  Res,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CertificationsService } from './certifications.service';
import { HrExcelService } from './hr-excel.service';
import { CreateCertificationDto } from './dto/create-certification.dto';
import { UpdateCertificationDto } from './dto/update-certification.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';
import { UploadFile } from 'src/common/decorators/upload-file.decorator';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { ExcelImport, isDryRun, sendXlsx } from 'src/common/excel';

@ApiTags('HR - Certifications')
@ApiBearerAuth()
@RequiresFeature(Feature.HR_BASIC)
@Controller('hr/certifications')
export class CertificationsController {
  constructor(
    private readonly certificationsService: CertificationsService,
    private readonly hrExcelService: HrExcelService,
  ) {}

  @Post()
  @Auth(Role.ADMIN, Role.HR)
  @UploadFile()
  @ApiConsumes('multipart/form-data')
  create(
    @Body() dto: CreateCertificationDto,
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.certificationsService.create(dto, file, user);
  }

  @Get('expiring')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  @ApiQuery({ name: 'days', required: false, type: Number })
  expiring(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days = 30,
  ) {
    return this.certificationsService.expiring(days);
  }

  // Sin employeeId baja todos los permisos; con employeeId, los del legajo
  // abierto (que es como lo usa la tabla de la ficha del empleado).
  @Get('export')
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  @ApiQuery({ name: 'employeeId', required: false })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('employeeId') employeeId?: string,
  ): Promise<StreamableFile> {
    const buffer = await this.hrExcelService.exportCertifications(employeeId);
    return sendXlsx(res, 'permisos.xlsx', buffer);
  }

  @Get('import/template')
  @Auth(Role.ADMIN, Role.HR)
  async template(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendXlsx(
      res,
      'plantilla-permisos.xlsx',
      await this.hrExcelService.certificationTemplate(),
    );
  }

  @Post('import')
  @Auth(Role.ADMIN, Role.HR)
  @ExcelImport()
  import(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.hrExcelService.importCertifications(
      file.buffer,
      user,
      isDryRun(dryRun),
    );
  }

  @Get(':id/file')
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER, Role.DISPATCHER)
  file(@Param('id') id: string) {
    return this.certificationsService.getFileUrl(id);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.HR)
  @UploadFile()
  @ApiConsumes('multipart/form-data')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCertificationDto,
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.certificationsService.update(id, dto, file, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.HR)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.certificationsService.remove(id, user);
  }
}
