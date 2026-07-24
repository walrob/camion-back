import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@ApiTags('Maintenance')
@ApiBearerAuth()
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  // ───────── Planes ─────────
  @Post('plans')
  @Auth(Role.ADMIN, Role.MAINTENANCE)
  createPlan(@Body() dto: CreatePlanDto, @ActiveUser() user: ActiveUserInterface) {
    return this.maintenanceService.createPlan(dto, user);
  }

  @Get('plans')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.MANAGER)
  allPlans() {
    return this.maintenanceService.allPlans();
  }

  @Get('plans/upcoming')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.MANAGER)
  upcoming() {
    return this.maintenanceService.upcoming();
  }

  @Get('trucks/:truckId/plans')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.MANAGER)
  plansByTruck(@Param('truckId') truckId: string) {
    return this.maintenanceService.plansByTruck(truckId);
  }

  @Patch('plans/:id')
  @Auth(Role.ADMIN, Role.MAINTENANCE)
  updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.maintenanceService.updatePlan(id, dto, user);
  }

  @Delete('plans/:id')
  @Auth(Role.ADMIN, Role.MAINTENANCE)
  removePlan(@Param('id') id: string, @ActiveUser() user: ActiveUserInterface) {
    return this.maintenanceService.removePlan(id, user);
  }

  // ───────── Órdenes de trabajo ─────────
  @Post('orders')
  @Auth(Role.ADMIN, Role.MAINTENANCE)
  createOrder(@Body() dto: CreateOrderDto, @ActiveUser() user: ActiveUserInterface) {
    return this.maintenanceService.createOrder(dto, user);
  }

  @Get('trucks/:truckId/orders')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.MANAGER)
  ordersByTruck(@Param('truckId') truckId: string) {
    return this.maintenanceService.ordersByTruck(truckId);
  }

  @Get('orders/:id/pdf')
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.MANAGER)
  async orderPdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.maintenanceService.buildOrderPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="orden-de-trabajo.pdf"',
    });
    return new StreamableFile(buffer);
  }

  @Patch('orders/:id')
  @Auth(Role.ADMIN, Role.MAINTENANCE)
  updateOrder(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.maintenanceService.updateOrder(id, dto, user);
  }
}
