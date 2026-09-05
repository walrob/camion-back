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
 * variables de entorno (SEED_ADMIN_*); si no están, no se crea nada.
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
    // Todo usuario pertenece a una empresa. Se resuelve desde la base en lugar
    // de repetir el UUID de la migración: así sigue funcionando aunque a la
    // empresa inicial se la renombre o se la vuelva a crear.
    const company = await this.companiesRepository.findOne({
      where: { isPlatform: false },
      order: { createdAt: 'ASC' },
    });

    if (!company) {
      this.logger.error(
        'No hay ninguna empresa cargada: no se puede crear el administrador ' +
          'inicial. Verifique que las migraciones se hayan ejecutado.',
      );
      return;
    }

    // El conteo excluye a la empresa plataforma: el superadmin no es un usuario
    // de cliente, y contarlo dejaría a una base recién migrada sin ningún
    // administrador de empresa según qué seeder arranque primero.
    const count = await this.usersRepository.count({
      where: { companyId: company.id },
    });
    if (count > 0) return;

    // Sin valores por defecto, a propósito. Antes, si faltaban las variables
    // se creaba `admin@fleetlog.com` con la contraseña `Admin1234`: una
    // credencial publicada en el repositorio, con rol de administrador, sobre
    // la primera empresa de una base recién migrada. Es preferible quedarse
    // sin administrador inicial —que se nota en el primer intento de ingreso
    // y se arregla definiendo las variables— que tener uno que cualquiera
    // puede usar y que no se nota nunca.
    const email = this.configService.get<string>('SEED_ADMIN_EMAIL');
    const password = this.configService.get<string>('SEED_ADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.warn(
        'Sin SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD: no se creó el ' +
          'administrador inicial. Definilas y reiniciá, o creá el usuario a mano.',
      );
      return;
    }

    const name =
      this.configService.get<string>('SEED_ADMIN_NAME') ?? 'Administrador';

    await this.usersRepository.save({
      email,
      name,
      password: await bcryptjs.hash(password, 10),
      role: Role.ADMIN,
      companyId: company.id,
      // Nace verificado: no hay a quién mandarle el mail de confirmación de una
      // cuenta que crea el propio sistema.
      emailVerifiedAt: new Date(),
    });

    this.logger.warn(
      `Usuario administrador inicial creado (${email}). ` +
        'Cambie la contraseña después del primer ingreso.',
    );
  }
}
