import { IsBoolean, IsEnum, IsInt, IsString, Max, Min } from 'class-validator';
import { EngagementSegment } from '../engagement.rules';

export class UpdateOptOutDto {
  @IsString()
  t: string;

  @IsBoolean()
  optOut: boolean;
}

export class SendEngagementTestDto {
  @IsEnum(EngagementSegment)
  segment: EngagementSegment;

  @IsInt()
  @Min(1)
  @Max(3)
  step: number;
}
