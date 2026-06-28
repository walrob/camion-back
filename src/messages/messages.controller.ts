import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @Auth()
  send(@Body() dto: SendMessageDto, @ActiveUser() user: ActiveUserInterface) {
    return this.messagesService.send(dto, user);
  }

  @Get('me')
  @Auth(Role.DRIVER)
  myThread(@ActiveUser() user: ActiveUserInterface) {
    return this.messagesService.threadForUser(user.id);
  }

  @Get('inbox')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER)
  inbox(@ActiveUser() user: ActiveUserInterface) {
    return this.messagesService.inbox(user.id, user.role);
  }

  @Get('conversation/:userId')
  @Auth(Role.ADMIN, Role.DISPATCHER, Role.MANAGER)
  conversation(
    @Param('userId') userId: string,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.messagesService.conversation(user.id, userId, user.role);
  }

  @Patch(':id/read')
  @Auth()
  markRead(@Param('id') id: string) {
    return this.messagesService.markRead(id);
  }
}
