import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) { }

  async generar(idLoteRaw: string) {
    const idLote = this.parseId(idLoteRaw);
    const lote = await this.prisma.loteProduccion.findUnique({
      where: { idLote },
      select: { codigoLote: true },
    });
    if (!lote) throw new NotFoundException('Lote no encontrado');

    const frontendUrl = (process.env.FRONTEND_URL ?? 'http://localhost:4200').replace(
      /\/$/,
      '',
    );
    const url = `${frontendUrl}/trace/${encodeURIComponent(lote.codigoLote)}`;
    const qrDataUri = await QRCode.toDataURL(url, { width: 600, margin: 2 });

    return { url, qrDataUri, codigo: lote.codigoLote };
  }

  private parseId(raw: string): bigint {
    if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
      throw new BadRequestException('Identificador de lote inválido');
    }
    return BigInt(raw);
  }
}
