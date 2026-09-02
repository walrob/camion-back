import { forwardRef, Global, Module } from '@nestjs/common';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { CompanyCurrency } from './entities/company-currency.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { TripLogEntry } from 'src/trip-log/entities/trip-log-entry.entity';
import { FuelRecord } from 'src/fuel/entities/fuel-record.entity';
import { CurrenciesService } from './currencies.service';
import { CurrenciesController } from './currencies.controller';
import { AuthModule } from 'src/auth/auth.module';

/**
 * `@Global()`, como ajustes y catálogos: la conversión a moneda base la
 * necesitan la bitácora, combustible, liquidaciones e indicadores.
 */
@Global()
@Module({
  imports: [
    TenantTypeOrmModule.forFeature([
      CompanyCurrency,
      ExchangeRate,
      // Entran sólo como entidades, para completar las conversiones pendientes.
      TripLogEntry,
      FuelRecord,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [CurrenciesController],
  providers: [CurrenciesService],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
