import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceExcelService } from './maintenance-excel.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ReopenDto } from 'src/common/dto/reopen.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { Role } from 'src/common/enums/role.enum';
import { Feature } from 'src/common/enums/feature.enum';
import { RequiresFeature } from 'src/auth/decorators/requires-feature.decorator';
import { ActiveUser } from 'src/common/decorators/active-user.decorator';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import { ExcelImport, isDryRun, sendXlsx } from 'src/common/excel';

@ApiTags('Maintenance')
@ApiBearerAuth()
@RequiresFeature(Feature.MAINTENANCE)
@Controller('maintenance')
export class MaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly maintenanceExcelService: MaintenanceExcelService,
  ) {}

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

  @Get('plans/export')
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.MANAGER)
  async exportPlans(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.maintenanceExcelService.exportPlans();
    return sendXlsx(res, 'planes-mantenimiento.xlsx', buffer);
  }

  @Get('plans/import/template')
  @Auth(Role.ADMIN, Role.MAINTENANCE)
  planTemplate(@Res({ passthrough: true }) res: Response): StreamableFile {
    return sendXlsx(
      res,
      'plantilla-planes-mantenimiento.xlsx',
      this.maintenanceExcelService.planTemplate(),
    );
  }

  @Post('plans/import')
  @Auth(Role.ADMIN, Role.MAINTENANCE)
  @ExcelImport()
  importPlans(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserInterface,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.maintenanceExcelService.importPlans(
      file.buffer,
      user,
      isDryRun(dryRun),
    );
  }

  // Sin truckId baja el historial completo del taller; con truckId, el del
  // camion elegido en la tabla.
  @Get('orders/export')
  @RequiresFeature(Feature.EXPORT_EXCEL)
  @Auth(Role.ADMIN, Role.MAINTENANCE, Role.MANAGER)
  @ApiQuery({ name: 'truckId', required: false })
  async exportOrders(
    @Res({ passthrough: true }) res: Response,
    @Query('truckId') truckId?: string,
  ): Promise<StreamableFile> {
    const buffer = await this.maintenanceExcelService.exportOrders(truckId);
    return sendXlsx(res, 'ordenes-mantenimiento.xlsx', buffer);
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

  /** Reabre una orden finalizada: el arreglo no quedó o se cargó mal. */
  @Patch('orders/:id/reopen')
  @Auth(Role.ADMIN, Role.MAINTENANCE)
  reopenOrder(
    @Param('id') id: string,
    @Body() dto: ReopenDto,
    @ActiveUser() user: ActiveUserInterface,
  ) {
    return this.maintenanceService.reopenOrder(id, dto.reason, user);
  }
}
