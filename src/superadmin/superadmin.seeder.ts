import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcryptjs from 'bcryptjs';
import { User } from 'src/users/entities/user.entity';
import { Company } from 'src/companies/entities/company.entity';
import { Role } from 'src/common/enums/role.enum';
import { runAsSystem } from 'src/common/tenant/tenant-context';

/**
 * Crea el superadmin de plataforma si todavía no existe.
 *
 * La migración `Superadmin` ya lo sembraba, pero **sólo en el momento de
 * correrla**: quien definió `SEED_SUPERADMIN_*` después de migrar quedaba sin
 * usuario y sin más salida que revertir la migración o insertar la fila a mano.
 * Este seeder cierra ese hueco corriendo en cada arranque y sin efecto si el
 * usuario ya está.
 *
 * Corre en contexto de sistema porque toca la empresa plataforma, que no es la
 * del request —no hay request— y el filtrado por empresa no tiene con qué
 * filtrar.
 */
@Injectable()
export class SuperadminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuperadminSeeder.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const email = this.configService
      .get<string>('SEED_SUPERADMIN_EMAIL')
      ?.toLowerCase();
    const password = this.configService.get<string>('SEED_SUPERADMIN_PASSWORD');

    if (!email || !password) {
      this.logger.warn(
        'Sin SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD: el panel de ' +
          'plataforma queda inaccesible hasta definirlas.',
      );
      return;
    }

    await runAsSystem(async () => {
      const plataforma = await this.companiesRepository.findOne({
        where: { isPlatform: true },
      });

      if (!plataforma) {
        this.logger.error(
          'No existe la empresa plataforma: no se puede crear el superadmin. ' +
            'Verifique que las migraciones se hayan ejecutado.',
        );
        return;
      }

      const existente = await this.usersRepository.findOne({ where: { email } });

      if (existente) {
        // El email es único global (D1). Si ya está tomado por un usuario de
        // otra empresa hay que avisar: no se le sube el rol a superadmin por
        // configuración, porque eso convertiría una variable de entorno mal
        // puesta en un privilegio sobre todas las empresas.
        if (existente.role !== Role.SUPERADMIN) {
          this.logger.error(
            `SEED_SUPERADMIN_EMAIL (${email}) ya pertenece a un usuario con rol ` +
              `"${existente.role}". Elegí otro email: el superadmin no se creó.`,
          );
        }
        return;
      }

      await this.usersRepository.save(
        this.usersRepository.create({
          companyId: plataforma.id,
          email,
          name: 'Superadmin',
          password: await bcryptjs.hash(password, 10),
          role: Role.SUPERADMIN,
          emailVerifiedAt: new Date(),
        } as Partial<User>),
      );

      this.logger.warn(
        `Superadmin de plataforma creado (${email}). Cambiá la contraseña ` +
          'después del primer ingreso.',
      );
    });
  }
}
