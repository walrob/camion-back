import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateChecklistDto {
  @IsUUID()
  @IsNotEmpty()
  tripId: string;

  @IsUUID()
  @IsNotEmpty()
  truckId: string;

  @IsUUID()
  @IsNotEmpty()
  driverId: string;
}
