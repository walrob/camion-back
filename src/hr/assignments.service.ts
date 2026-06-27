import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TruckAssignment } from './entities/truck-assignment.entity';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(TruckAssignment)
    private readonly assignmentsRepository: Repository<TruckAssignment>,
  ) {}

  async assign(
    dto: CreateAssignmentDto,
    user: ActiveUserInterface,
  ): Promise<TruckAssignment> {
    const isPrimary = dto.isPrimary ?? true;

    // Solo puede haber una asignación primary activa por camión y por chofer.
    if (isPrimary) {
      await this.closeActivePrimary({ truckId: dto.truckId }, user.id);
      await this.closeActivePrimary({ employeeId: dto.employeeId }, user.id);
    }

    const assignment = this.assignmentsRepository.create({
      employeeId: dto.employeeId,
      truckId: dto.truckId,
      isPrimary,
      notes: dto.notes,
      assignedAt: new Date(),
      createdBy: user.id,
    });
    return this.assignmentsRepository.save(assignment);
  }

  async unassign(id: string, user: ActiveUserInterface): Promise<TruckAssignment> {
    const assignment = await this.assignmentsRepository.findOne({
      where: { id },
    });
    if (!assignment) throw new NotFoundException('Asignación no encontrada.');
    assignment.unassignedAt = new Date();
    assignment.updatedBy = user.id;
    return this.assignmentsRepository.save(assignment);
  }

  currentByEmployee(employeeId: string): Promise<TruckAssignment | null> {
    return this.assignmentsRepository.findOne({
      where: { employeeId, unassignedAt: IsNull(), isPrimary: true },
      relations: ['truck'],
    });
  }

  currentByTruck(truckId: string): Promise<TruckAssignment | null> {
    return this.assignmentsRepository.findOne({
      where: { truckId, unassignedAt: IsNull(), isPrimary: true },
      relations: ['employee'],
    });
  }

  historyByEmployee(employeeId: string): Promise<TruckAssignment[]> {
    return this.assignmentsRepository.find({
      where: { employeeId },
      relations: ['truck'],
      order: { assignedAt: 'DESC' },
    });
  }

  private async closeActivePrimary(
    where: { truckId?: string; employeeId?: string },
    userId: string,
  ) {
    const active = await this.assignmentsRepository.find({
      where: { ...where, unassignedAt: IsNull(), isPrimary: true },
    });
    for (const a of active) {
      a.unassignedAt = new Date();
      a.updatedBy = userId;
      await this.assignmentsRepository.save(a);
    }
  }
}
