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
import { DocumentsService } from './documents.service';
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

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

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

  @Get('expiring')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER, Role.MANAGER)
  @ApiQuery({ name: 'days', required: false, type: Number })
  expiring(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days = 30) {
    return this.documentsService.expiring(days);
  }

  @Get('expiring/export')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.DISPATCHER, Role.MANAGER)
  @ApiQuery({ name: 'days', required: false, type: Number })
  async exportExpiring(
    @Res({ passthrough: true }) res: Response,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days = 30,
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
