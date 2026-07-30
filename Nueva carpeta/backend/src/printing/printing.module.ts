import { Module } from '@nestjs/common';
import { PrintingController } from './printing.controller';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [PrintingController],
})
export class PrintingModule {}