import { Module } from '@nestjs/common';
import { PrintingController } from './printing.controller';
import { ThermalTicketService } from './thermal-ticket.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [PrintingController],
  providers: [ThermalTicketService],
})
export class PrintingModule {}