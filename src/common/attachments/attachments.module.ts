import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { Attachment } from './entities/attachment.entity';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { StorageModule } from 'src/common/storage/storage.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([Attachment]),
    StorageModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
