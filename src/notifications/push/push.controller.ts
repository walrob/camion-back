import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PushService } from './push.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Push')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('tokens')
  @Auth()
  register(
    @Body() dto: RegisterTokenDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.pushService.register(user.id, dto.token, dto.platform);
  }

  @Delete('tokens/:token')
  @Auth()
  unregister(@Param('token') token: string) {
    return this.pushService.unregister(token);
  }
}
