import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantTypeOrmModule } from 'src/common/tenant/tenant-typeorm.module';
import { Company } from 'src/companies/entities/company.entity';
import { Subscription } from 'src/billing/entities/subscription.entity';
import { Payment } from 'src/billing/entities/payment.entity';
import { BillingModule } from 'src/billing/billing.module';
import { AuthModule } from 'src/auth/auth.module';
import { MpPaymentsService } from './mp-payments.service';
import { MpPaymentsController } from './mp-payments.controller';
import { MpPaymentsCron } from './mp-payments.cron';

/**
 * Cobro por Mercado Pago.
 *
 * **No hay `mp-auth/`.** Aturna lo necesita porque su modelo es marketplace y
 * cada institución cobra con su propia cuenta: eso obliga a OAuth, a guardar un
 * token por institución y a refrescarlo. Acá cobra siempre CamioNex con una
 * sola cuenta, así que toda esa mitad de la integración no existe.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Company]),
    TenantTypeOrmModule.forFeature([Subscription, Payment]),
    BillingModule,
    // El controlador usa @Auth(): necesita el JwtModule que exporta AuthModule.
    forwardRef(() => AuthModule),
  ],
  controllers: [MpPaymentsController],
  providers: [MpPaymentsService, MpPaymentsCron],
  exports: [MpPaymentsService],
})
export class MpPaymentsModule {}
