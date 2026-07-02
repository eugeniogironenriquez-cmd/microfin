import {
  Module, Controller, Injectable, Get, Post, Put, Patch,
  Body, Param, NotFoundException,
} from '@nestjs/common';
import { exec } from 'child_process';

@Controller('printing')
export class PrintingController {
  @Get('printers')
  async getPrinters(): Promise<string[]> {
    return new Promise((resolve) => {
      exec('powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"', (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }

        const printers = stdout
          .split(/\r?\n/)
          .map(x => x.trim())
          .filter(Boolean);

        resolve(printers);
      });
    });
  }

  
}

@Module({
  controllers: [PrintingController],
})
export class PrintingModule {}

