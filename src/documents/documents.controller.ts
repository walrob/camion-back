import {
  Body,
  Controller,
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
import { DocumentsService } from './documents.service';
import { DocumentsExcelService } from './documents-excel.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import {
  DocumentCategory,
  DocumentOwnerType,
} from 'src/common/enums/document.enum';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { UploadFile } from 'src/common/decorators/upload-file.decorator';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';
import { ExcelImport, isDryRun, sendXlsx } from 'src/common/excel';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentsExcelService: DocumentsExcelService,
  ) {}

  @Post()
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER)
  @UploadFile()
  @ApiConsumes('multipart/form-data')
  create(
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.documentsService.create(dto, file, user);
  }

  @Get()
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER, Role.MANAGER)
  @ApiQuery({ name: 'ownerType', enum: DocumentOwnerType })
  @ApiQuery({ name: 'ownerId', required: false })
  @ApiQuery({ name: 'category', required: false, enum: DocumentCategory })
  list(
    @Query('ownerType') ownerType: DocumentOwnerType,
    @Query('ownerId') ownerId?: string,
    @Query('category') category?: DocumentCategory,
  ) {
    return this.documentsService.listByOwner(ownerType, ownerId, category);
  }

  // Descarga el gestor con los mismos filtros que la tabla (entidad, unidad
  // y categoria). Es distinto de 'expiring/export', que baja solo lo que vence.
  @Get('export')
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER, Role.MANAGER)
  @ApiQuery({ name: 'ownerType', required: false, enum: DocumentOwnerType })
  @ApiQuery({ name: 'ownerId', required: false })
  @ApiQuery({ name: 'category', required: false })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('ownerType') ownerType?: DocumentOwnerType,
    @Query('ownerId') ownerId?: string,
    @Query('category') category?: string,
  ): Promise<StreamableFile> {
    const buffer = await this.documentsExcelService.export({
      ownerType,
      ownerId,
      category,
    });
    return sendXlsx(res, 'documentos.xlsx', buffer);
  }

  @Get('import/template')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER)
  async template(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return sendXlsx(
      res,
      'plantilla-documentos.xlsx',
      await this.documentsExcelService.template(),
    );
  }

  @Post('import')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER)
  @ExcelImport()
  import(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.documentsExcelService.import(
      file.buffer,
      user,
      isDryRun(dryRun),
    );
  }

  @Get('expiring')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER, Role.MANAGER)
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description:
      'Sin días: la bandeja (vencidos y por vencer según la ventana de la ' +
      'empresa). Con días: todo lo que vence de acá a N días.',
  })
  expiring(
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.documentsService.expiring(days);
  }

  @Get('expiring/export')
  // La exportación a Excel es de Operación en adelante: en Control el
  // módulo se ve pero no se puede bajar el listado (MODELO-COMERCIAL §4.1).
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER, Role.MANAGER)
  @ApiQuery({ name: 'days', required: false, type: Number })
  async exportExpiring(
    @Res({ passthrough: true }) res: Response,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ): Promise<StreamableFile> {
    const buffer = await this.documentsService.exportExpiringXlsx(days);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="vencimientos.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Get('me')
  @Auth(Role.DRIVER)
  @ApiQuery({ name: 'truckId', required: false })
  findMine(
    @ActiveUser() user: ActiveUserInterface,
    @Query('truckId') truckId?: string,
  ) {
    return this.documentsService.findForDriver(user.id, truckId);
  }

  @Get(':id/file')
  @Auth(
    Role.ADMIN,
    Role.MAINTENANCE,
    Role.DISPATCHER,
    Role.MANAGER,
    Role.DRIVER,
  )
  file(@Param('id') id: string) {
    return this.documentsService.getFileUrl(id);
  }

  @Patch(':id')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER)
  @UploadFile()
  @ApiConsumes('multipart/form-data')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.documentsService.update(id, dto, file, user);
  }

  @Delete(':id')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER)
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.documentsService.remove(id, user);
  }
}
