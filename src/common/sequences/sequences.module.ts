import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanySequence } from '../entities/company-sequence.entity';
import { SequencesService } from './sequences.service';

@Module({
  imports: [TypeOrmModule.forFeature([CompanySequence])],
  providers: [SequencesService],
  exports: [SequencesService],
})
export class SequencesModule {}
