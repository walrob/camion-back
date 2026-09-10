import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto, UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { IPaginationOptions, Pagination } from 'nestjs-typeorm-paginate';
import { paginateAndSearch } from 'src/common/utils/paginate-and-search.util';
import {
  assertExportSize,
  boolCell,
  buildXlsx,
  dateCell,
  dateTimeCell,
  ExcelRow,
  EXPORT_ROW_LIMIT,
} from 'src/common/excel';
import { ROLE_LABELS } from 'src/common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto) {
    return await this.usersRepository.save(createUserDto);
  }

  async findOneByEmail(email: string) {
    return await this.usersRepository.findOneBy({ email });
  }

  async findOneById(id: string) {
    return await this.usersRepository.findOneBy({ id });
  }

  findOneByEmailWithPassword(email: string) {
    return this.usersRepository.findOne({
      where: { email },
      // `isDemo` es imprescindible: viaja en el JWT y es lo que lee el DemoReadOnlyGuard.
      select: [
        'id',
        'email',
        'name',
        'password',
        'createdAt',
        'role',
        'blocked',
        'profileImage',
        'isTemplateDark',
        'isDemo',
        // Sin esto el login rechazaría a TODO el mundo: la lista es explícita,
        // así que una columna ausente llega como `undefined` y se lee igual que
        // una casilla sin confirmar.
        'emailVerifiedAt',
        // La empresa y su estado comercial viajan en el JWT: son el eje del
        // aislamiento entre empresas.
        'companyId',
      ],
      relations: ['company'],
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    return await this.usersRepository.update(id, { ...updateUserDto });
  }

  async updateProfile(id: string, updateProfileDto: UpdateProfileDto) {
    return await this.usersRepository.update(id, { ...updateProfileDto });
  }

  async toggleBlockUser(id: string) {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    user.blocked = !user.blocked;
    return await this.usersRepository.save(user);
  }

  async paginate(
    options: IPaginationOptions,
    search?: string,
    roles?: Role[],
  ): Promise<Pagination<User>> {
    const baseWhere = {
      ...(roles?.length && { role: roles }),
    };

    return paginateAndSearch<User>(this.usersRepository, {
      page: Number(options.page),
      limit: Number(options.limit),
      search,
      searchFields: ['name', 'email'],
      orderBy: 'name',
      order: 'ASC',
      baseWhere,
      select: ['id', 'email', 'name', 'phone', 'role', 'createdAt', 'blocked', 'lastConnection'],
    });
  }

  /**
   * Descarga del equipo con el mismo buscador y filtro de rol que la tabla.
   *
   * Reusa `paginate` para no duplicar el `select` de columnas: la contraseña
   * y demás campos sensibles quedan fuera en un solo lugar.
   */
  async exportXlsx(search?: string, roles?: Role[]): Promise<Buffer> {
    const { items, meta } = await this.paginate(
      { page: 1, limit: EXPORT_ROW_LIMIT },
      search,
      roles,
    );
    assertExportSize(meta.totalItems ?? items.length);

    const columns = [
      'Nombre',
      'Email',
      'Telefono',
      'Rol',
      'Estado',
      'Ultima conexion',
      'Alta',
    ];

    const rows: ExcelRow[] = items.map((u) => ({
      Nombre: u.name ?? '',
      Email: u.email ?? '',
      Telefono: u.phone ?? '',
      Rol: ROLE_LABELS[u.role] ?? u.role,
      Estado: u.blocked ? 'Bloqueado' : 'Activo',
      'Ultima conexion': dateTimeCell(u.lastConnection),
      Alta: dateCell(u.createdAt),
    }));

    return buildXlsx('Equipo', columns, rows);
  }

  async remove(id: string, user: ActiveUserInterface) {
    const userBd = await this.usersRepository.findOneBy({ id });
    if (!userBd) throw new BadRequestException('No se encontró Usuario.');
    userBd.deletedBy = user.id;
    await this.usersRepository.save(userBd);
    return await this.usersRepository.softDelete(id);
  }
}
