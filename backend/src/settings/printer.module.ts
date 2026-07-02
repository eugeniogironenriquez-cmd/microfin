import {
  Module, Controller, Injectable, Get, Post, Put, Patch,
  Body, Param, NotFoundException,
} from '@nestjs/common';
import { exec } from 'child_process';
import { Auth } from '../common/guards/roles.guard';


@Controller('printing')
export class PrintingController {

  @Get('printers')
  async getPrinters(): Promise<string[]> {
    const commands = [
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Printer | Select-Object -ExpandProperty Name"`,
      `wmic printer get name`,
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"`,
    ];

    for (const cmd of commands) {
      const printers = await this.runCommand(cmd);
      if (printers.length > 0) return printers;
    }

    return [];
  }

  private runCommand(command: string): Promise<string[]> {
    return new Promise((resolve) => {
      exec(command, { windowsHide: true }, (error, stdout, stderr) => {
        console.log('CMD:', command);
        console.log('ERROR:', error?.message);
        console.log('STDERR:', stderr);
        console.log('STDOUT:', stdout);

        if (error || !stdout) {
          resolve([]);
          return;
        }

        const printers = stdout
          .split(/\r?\n/)
          .map(x => x.trim())
          .filter(Boolean)
          .filter(x => x.toLowerCase() !== 'name');

        resolve([...new Set(printers)]);
      });
    });
  }
}

@Module({
  controllers: [PrintingController],
})
export class PrintingModule {}

