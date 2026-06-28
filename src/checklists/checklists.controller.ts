import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChecklistsService } from './checklists.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistItemDto } from './dto/update-item.dto';
import { SignChecklistDto } from './dto/sign-checklist.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Checklists')
@ApiBearerAuth()
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Post()
  @Auth(Role.DRIVER)
  create(
    @Body() dto: CreateChecklistDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.createForTrip(dto, user);
  }

  @Get('trip/:tripId')
  @Auth(Role.DRIVER, Role.ADMIN, Role.DISPATCHER, Role.MAINTENANCE, Role.MANAGER)
  getByTrip(@Param('tripId') tripId: string) {
    return this.checklistsService.getByTrip(tripId);
  }

  @Patch('items/:itemId')
  @Auth(Role.DRIVER)
  updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.updateItem(itemId, dto, user);
  }

  @Post(':id/sign')
  @Auth(Role.DRIVER)
  sign(
    @Param('id') id: string,
    @Body() dto: SignChecklistDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.checklistsService.sign(id, dto, user);
  }
}
