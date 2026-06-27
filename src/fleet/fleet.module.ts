import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Truck } from './entities/truck.entity';
import { Trailer } from './entities/trailer.entity';
import { Fleet } from './entities/fleet.entity';
import { TrucksService } from './trucks.service';
import { TrailersService } from './trailers.service';
import { FleetsService } from './fleets.service';
import { TrucksController } from './trucks.controller';
import { TrailersController } from './trailers.controller';
import { FleetsController } from './fleets.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Truck, Trailer, Fleet]),
    forwardRef(() => AuthModule),
  ],
  controllers: [TrucksController, TrailersController, FleetsController],
  providers: [TrucksService, TrailersService, FleetsService],
  exports: [TrucksService, TrailersService, FleetsService],
})
export class FleetModule {}
