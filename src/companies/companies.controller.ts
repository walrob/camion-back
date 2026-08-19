import {
  BadRequestException,
  Body,
  Controller,
  forwardRef,
  Get,
  Inject,
  Patch,
  Post,
  UploadedFile,
} from '@nestjs/common';
import { UploadImage } from 'src/common/decorators/upload-image.decorator';
import { StorageService } from 'src/common/storage/storage.service';

/** Formatos aceptados para el logo. */
const TIPOS_DE_LOGO = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
];
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { CompaniesService } from './companies.service';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { Company } from './entities/company.entity';
import { AuthService } from 'src/auth/auth.service';

@ApiTags('Empresas')
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Alta pública desde la landing. **Sin autenticación**, por definición.
   *
   * Limitado a 5 intentos cada 10 minutos por IP (riesgo R6.1): un endpoint
   * público que crea tenants es un blanco obvio para el alta masiva de cuentas
   * basura, y cada tenant basura ocupa lugar y ensucia las métricas.
   */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({
    summary:
      'Crea una empresa con su usuario administrador y arranca el trial de ' +
      '30 días del plan Operación.',
  })
  async register(@Body() dto: RegisterCompanyDto) {
    const alta = await this.companiesService.register(dto);

    // El mail sale una vez confirmada el alta, no dentro de la transacción: si
    // el SMTP demora, la empresa ya está creada y el usuario puede pedir el
    // reenvío. Al revés —mandar y después fallar— dejaría un link a una cuenta
    // que no existe.
    await this.authService.enviarVerificacion(alta.adminEmail);

    return { ...alta, verificacionPendiente: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @Auth()
  @ApiOperation({ summary: 'Datos de la empresa del usuario autenticado.' })
  miEmpresa(@ActiveUser() user: ActiveUserInterface) {
    return this.companiesService.findOne(user.companyId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @Auth(Role.ADMIN)
  @ApiOperation({ summary: 'Actualiza los datos de la propia empresa.' })
  actualizar(
    @Body() datos: Partial<Company>,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.companiesService.actualizar(user.companyId, datos);
  }

  /**
   * Logo de la empresa, para el onboarding y la configuración.
   *
   * Es un endpoint aparte de `PATCH me` porque llega como `multipart` y no como
   * JSON. La `key` de S3 se resuelve acá y no la manda el cliente: dejar que el
   * front elija dónde se guarda sería dejarlo pisar el archivo de otra empresa.
   */
  @Patch('me/logo')
  @ApiBearerAuth()
  @Auth(Role.ADMIN)
  @UploadImage()
  @ApiOperation({ summary: 'Sube el logo de la empresa.' })
  async subirLogo(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');

    if (!TIPOS_DE_LOGO.includes(file.mimetype)) {
      throw new BadRequestException(
        'El logo tiene que ser una imagen PNG, JPG, WEBP o SVG.',
      );
    }

    const logoUrl = await this.storageService.uploadFile(file, 'erp_images');

    return this.companiesService.actualizar(user.companyId, { logoUrl });
  }

  @Patch('me/onboarding')
  @ApiBearerAuth()
  @Auth(Role.ADMIN)
  @ApiOperation({
    summary: 'Avanza el onboarding guiado. `step: 0` lo da por terminado.',
  })
  onboarding(
    @Body() body: { step: number },
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.companiesService.actualizarOnboarding(
      user.companyId,
      body.step,
    );
  }
}
