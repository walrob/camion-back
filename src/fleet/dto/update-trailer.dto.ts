import { PartialType } from '@nestjs/mapped-types';
import { CreateTrailerDto } from './create-trailer.dto';

export class UpdateTrailerDto extends PartialType(CreateTrailerDto) {}
