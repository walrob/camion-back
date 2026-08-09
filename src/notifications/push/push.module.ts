import { forwardRef, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { DeviceToken } from './entities/device-token.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TenantTypeOrmModule.forFeature([DeviceToken]),
    forwardRef(() => AuthModule),
  ],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
