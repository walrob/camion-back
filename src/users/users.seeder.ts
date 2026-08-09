import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcryptjs from 'bcryptjs';
import { User } from './entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { Company } from 'src/companies/entities/company.entity';

/**
 * Crea un usuario administrador por defecto la primera vez que arranca la app,
 * solo si la tabla de usuarios está vacía. Las credenciales se toman de las
 * variables de entorno (SEED_ADMIN_*) con valores por defecto para desarrollo.
 */
@Injectable()
export class UsersSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersSeeder.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const count = await this.usersRepository.count();
    if (count > 0) return;

    // Todo usuario pertenece a una empresa. Se resuelve desde la base en lugar
    // de repetir el UUID de la migración: así sigue funcionando aunque a la
    // empresa inicial se la renombre o se la vuelva a crear.
    const company = await this.companiesRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (!company) {
      this.logger.error(
        'No hay ninguna empresa cargada: no se puede crear el administrador ' +
          'inicial. Verifique que las migraciones se hayan ejecutado.',
      );
      return;
    }

    const email = this.configService.get<string>('SEED_ADMIN_EMAIL') ?? 'admin@fleetlog.com';
    const password = this.configService.get<string>('SEED_ADMIN_PASSWORD') ?? 'Admin1234';
    const name = this.configService.get<string>('SEED_ADMIN_NAME') ?? 'Administrador';

    await this.usersRepository.save({
      email,
      name,
      password: await bcryptjs.hash(password, 10),
      role: Role.ADMIN,
      companyId: company.id,
    });

    this.logger.warn(
      `Usuario administrador inicial creado (${email}). ` +
        'Cambie la contraseña después del primer ingreso.',
    );
  }
}
