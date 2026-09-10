import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
  DefaultValuePipe,
  ParseIntPipe,
  Delete,
  Patch,
  UploadedFile,
  ParseArrayPipe,
  Body,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { UsersService } from './users.service';
import { sendXlsx } from 'src/common/excel';
import { Role } from '../common/enums/role.enum';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { Pagination } from 'nestjs-typeorm-paginate';
import { User } from './entities/user.entity';
import { UploadImage } from 'src/common/decorators/upload-image.decorator';
import { StorageService } from 'src/common/storage/storage.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';
import { UpdateProfileDto } from './dto/update-user.dto';

@ApiTags('Users')
@Controller('users')
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
  ) {}

  @Auth(Role.ADMIN, Role.HR, Role.MANAGER)
  @Get()
  @ApiQuery({ name: 'search', required: false, type: String })
  findPagination(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number = 10,
    @Query('search') search?: string,
    @Query('role', new ParseArrayPipe({ items: String, separator: ',', optional: true }))
    roles?: Role[],
  ): Promise<Pagination<User>> {
    limit = limit > 100 ? 100 : limit;
    return this.usersService.paginate({ page, limit }, search, roles);
  }

  // Descarga el equipo con el mismo buscador y filtro de rol que la tabla.
  @Auth(Role.ADMIN, Role.HR, Role.MANAGER)
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Get('export')
  @ApiQuery({ name: 'search', required: false, type: String })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
    @Query('role', new ParseArrayPipe({ items: String, separator: ',', optional: true }))
    roles?: Role[],
  ): Promise<StreamableFile> {
    const buffer = await this.usersService.exportXlsx(search, roles);
    return sendXlsx(res, 'equipo.xlsx', buffer);
  }

  @Auth(Role.ADMIN)
  @Post('toggle-block/:id')
  async toggleBlockUser(@Param('id') id: string) {
    const user = await this.usersService.toggleBlockUser(id);
    return {
      message: user.blocked ? 'Usuario bloqueado correctamente.' : 'Usuario desbloqueado correctamente.',
      userId: user.id,
      blocked: user.blocked,
    };
  }

  @Auth()
  @Get('profile')
  async getProfile(@ActiveUser() user: ActiveUserInterface) {
    const userBd = await this.usersService.findOneById(user.id);
    if (!userBd) throw new BadRequestException('Usuario no encontrado.');
    const { password, ...userWithoutPassword } = userBd as any;
    return userWithoutPassword;
  }

  @Auth()
  @Patch('profile')
  @UploadImage()
  async updateProfile(
    @Body() updateProfileDto: UpdateProfileDto,
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    if (file) {
      const imageKey = await this.storageService.uploadFile(file, 'erp_images');
      updateProfileDto.profileImage = imageKey;
    }
    return this.usersService.updateProfile(user.id, updateProfileDto);
  }

  @Auth(Role.ADMIN)
  @Get(':id')
  async getUserById(@Param('id') id: string) {
    const user = await this.usersService.findOneById(id);
    if (!user) throw new BadRequestException('Usuario no encontrado.');
    const { password, ...userWithoutPassword } = user as any;
    return userWithoutPassword;
  }

  @Auth(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.usersService.remove(id, user);
  }
}
