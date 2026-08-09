import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { AuthModule } from 'src/auth/auth.module';
import { UsersController } from './users.controller';
import { StorageModule } from 'src/common/storage/storage.module';
import { UsersSeeder } from './users.seeder';
import { CompaniesModule } from 'src/companies/companies.module';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([User]),
    forwardRef(() => AuthModule),
    StorageModule,
    // El seeder necesita resolver la empresa a la que asignar el admin inicial.
    CompaniesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersSeeder],
  exports: [UsersService],
})
export class UsersModule {}
