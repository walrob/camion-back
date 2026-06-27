import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

export function UploadImage(fieldName = 'file') {
  return applyDecorators(
    UseInterceptors(
      FileInterceptor(fieldName, {
        storage: memoryStorage(),
        limits: { fileSize: 8 * 1024 * 1024 }, // 8MB (opcional)
      }),
    ),
  );
}
