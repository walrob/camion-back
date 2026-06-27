import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import { AttachmentsService } from './attachments.service';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';
import { ListAttachmentDto } from './dto/list-attachment.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { UploadFile } from 'src/common/decorators/upload-file.decorator';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @Auth()
  @UploadFile()
  @ApiConsumes('multipart/form-data')
  upload(
    @Body() dto: UploadAttachmentDto,
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.attachmentsService.upload(
      file,
      dto.entityType,
      dto.entityId,
      user.id,
    );
  }

  @Get()
  @Auth()
  list(@Query() dto: ListAttachmentDto) {
    return this.attachmentsService.listByEntity(dto.entityType, dto.entityId);
  }

  @Get(':id/url')
  @Auth()
  getUrl(@Param('id') id: string) {
    return this.attachmentsService.getPresignedUrl(id);
  }

  @Delete(':id')
  @Auth()
  remove(
    @Param('id') id: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.attachmentsService.remove(id, user.id);
  }
}
