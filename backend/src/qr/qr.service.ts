import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';

export type TipoQr = 'corporativo' | 'publico';

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

  async generar(idLoteRaw: string, tipo: string) {
    if (tipo !== 'corporativo' && tipo !== 'publico') {
      throw new BadRequestException(
        "El tipo de QR debe ser 'corporativo' o 'publico'",
      );
    }
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
    const url =
      tipo === 'corporativo'
        ? `${frontendUrl}/lotes/${idLote.toString()}`
        : `${frontendUrl}/consulta?codigo=${encodeURIComponent(lote.codigoLote)}`;
    const qrDataUri = await QRCode.toDataURL(url);

    return { url, qrDataUri, tipo, codigo: lote.codigoLote };
  }

  private parseId(raw: string): bigint {
    if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
      throw new BadRequestException('Identificador de lote inválido');
    }
    return BigInt(raw);
  }
}
