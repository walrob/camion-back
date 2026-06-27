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
      select: ['id', 'email', 'name', 'password', 'createdAt', 'role', 'blocked', 'profileImage'],
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

  async remove(id: string, user: ActiveUserInterface) {
    const userBd = await this.usersRepository.findOneBy({ id });
    if (!userBd) throw new BadRequestException('No se encontró Usuario.');
    userBd.deletedBy = user.id;
    await this.usersRepository.save(userBd);
    return await this.usersRepository.softDelete(id);
  }
}
