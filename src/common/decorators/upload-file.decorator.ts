import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

/**
 * Subida genérica de un archivo a memoria (imagen, audio, video o pdf).
 * Límite amplio para soportar evidencia de incidentes (audio/video).
 */
export function UploadFile(fieldName = 'file', maxSizeMb = 50) {
  return applyDecorators(
    UseInterceptors(
      FileInterceptor(fieldName, {
        storage: memoryStorage(),
        limits: { fileSize: maxSizeMb * 1024 * 1024 },
      }),
    ),
  );
}
