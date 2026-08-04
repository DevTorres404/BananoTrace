import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface EtlRefreshResult {
  durationMs: number;
  views: {
    name: string;
    rowCount: number;
  }[];
}

@Injectable()
export class EtlService {
  private readonly logger = new Logger(EtlService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Refreshes all BI materialized views concurrently.
   * Uses CONCURRENTLY so reads are not blocked during refresh.
   * Requires the unique indexes on each view to be in place.
   */
  async refreshAll(): Promise<EtlRefreshResult> {
    const start = Date.now();
    this.logger.log('ETL refresh started');

    await this.prisma.$executeRaw`
      REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.fact_lotes
    `;
    this.logger.log('fact_lotes refreshed');

    await this.prisma.$executeRaw`
      REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.fact_envios
    `;
    this.logger.log('fact_envios refreshed');

    // Collect row counts for observability
    const [lotesCount, enviosCount] = await Promise.all([
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM analytics.fact_lotes
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM analytics.fact_envios
      `,
    ]);

    const durationMs = Date.now() - start;
    const result: EtlRefreshResult = {
      durationMs,
      views: [
        { name: 'fact_lotes',  rowCount: Number(lotesCount[0]?.count  ?? 0n) },
        { name: 'fact_envios', rowCount: Number(enviosCount[0]?.count ?? 0n) },
      ],
    };

    this.logger.log(`ETL refresh completed in ${durationMs}ms`, result.views);
    return result;
  }
}
