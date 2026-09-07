import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTripDto {
  @IsUUID()
  @IsNotEmpty()
  truckId: string;

  @IsUUID()
  @IsOptional()
  trailerId?: string;

  @IsUUID()
  @IsNotEmpty()
  driverId: string;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsNotEmpty()
  origin: string;

  @IsString()
  @IsNotEmpty()
  destination: string;

  @IsString()
  @IsOptional()
  cargoDescription?: string;

  /**
   * Clave del catálogo `trip_classification`. Cada empresa arma sus rutas: el
   * servicio valida que la clave exista y esté vigente.
   */
  @IsString()
  @IsOptional()
  classification?: string;

  @IsDateString()
  @IsOptional()
  plannedStartAt?: string;

  @IsDateString()
  @IsOptional()
  plannedEndAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /**
   * Viático de monto fijo del viaje. Sólo se acepta si la empresa paga así
   * (`settlement.perDiemMode`); el servicio lo valida.
   */
  @IsNumber()
  @Min(0)
  @IsOptional()
  perDiemAmount?: number;

  @IsString()
  @IsOptional()
  perDiemCurrency?: string;

  /**
   * Viaje internacional (docs/CONFIGURACION.md §7.6). Los dos sólo se aceptan
   * con `trip.international` activo; el servicio lo valida.
   *
   * `null` es un valor con significado propio: **limpia** el campo en una
   * edición. Ausente quiere decir «no lo toques», y son cosas distintas — sin
   * esa diferencia, un país cargado por error no se podía quitar nunca.
   */
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/, {
    message: 'El país tiene que ser un código ISO de dos letras (AR, BR, PY).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  destinationCountry?: string | null;

  @IsString()
  @Length(3, 3)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  currency?: string | null;

  /**
   * Confirmación explícita para asignar el viaje a un chofer que está de
   * licencia: la finaliza el día anterior al inicio del viaje y deja registro
   * en el legajo. Sin esto, la asignación se rechaza. No sirve para
   * suspensiones ni bajas, que bloquean siempre.
   */
  @IsBoolean()
  @IsOptional()
  closeLeave?: boolean;
}
