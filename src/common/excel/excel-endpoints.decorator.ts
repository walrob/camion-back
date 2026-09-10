import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { UploadFile } from 'src/common/decorators/upload-file.decorator';

/**
 * Decorador común de los endpoints `POST :recurso/import`.
 *
 * El archivo va a memoria (10 MB alcanza de sobra para las 5.000 filas que
 * admite el motor) y `dryRun` habilita la previsualización: el front siempre
 * pega primero con `dryRun=true` para mostrar el resumen y recién confirma.
 */
export function ExcelImport(maxSizeMb = 10) {
  return applyDecorators(
    UploadFile('file', maxSizeMb),
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: { file: { type: 'string', format: 'binary' } },
      },
    }),
    ApiQuery({
      name: 'dryRun',
      required: false,
      type: Boolean,
      description: 'Valida y devuelve el resumen sin escribir nada.',
    }),
  );
}

/** `?dryRun=true` viene como texto: sólo el "true" explícito simula. */
export function isDryRun(value?: string | boolean): boolean {
  return value === true || value === 'true' || value === '1';
}
