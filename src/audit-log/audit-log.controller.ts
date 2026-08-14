import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { AuditLogService } from './audit-log.service';

@ApiTags('Auditoría')
@ApiBearerAuth()
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  /**
   * Registro de acciones. Un usuario de empresa ve sólo lo suyo; el superadmin,
   * todo. El filtro se toma del token, no del parámetro.
   */
  @Get()
  @Auth(Role.SUPERADMIN, Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Acciones registradas, de la más reciente atrás.' })
  listar(
    @ActiveUser() user: ActiveUserInterface,
    @Query('companyId') companyId?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLog.listar(user, {
      companyId,
      action,
      search,
      desde,
      hasta,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('actions')
  @Auth(Role.SUPERADMIN, Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Acciones distintas presentes en el registro.' })
  acciones(@ActiveUser() user: ActiveUserInterface) {
    return this.auditLog.accionesRegistradas(user);
  }
}
