import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, finalize, forkJoin, of, throwError } from 'rxjs';
import {
  BlockchainBlock,
  BlockchainService,
  ChainVerification,
} from '../blockchain.service';

@Component({
  selector: 'app-blockchain-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './blockchain-page.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './blockchain-page.css'],
})
export class BlockchainPage implements OnInit {
  private readonly blockchainService = inject(BlockchainService);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);

  idInstancia = '';
  bloques: BlockchainBlock[] = [];
  verification: ChainVerification | null = null;
  isLoading = false;
  hasSearched = false;
  errorMessage = '';

  ngOnInit(): void {
    const fromQuery = this.route.snapshot.queryParamMap.get('instancia');
    if (fromQuery) {
      this.idInstancia = fromQuery;
      this.search();
    }
  }

  search(): void {
    const idInstancia = this.idInstancia.trim();
    if (!idInstancia) return;

    this.isLoading = true;
    this.hasSearched = true;
    this.errorMessage = '';
    forkJoin({
      bloques: this.blockchainService.getChain(idInstancia),
      verification: this.blockchainService.verifyChain(idInstancia).pipe(
        catchError(() => of(null))
      ),
    })
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: ({ bloques, verification }) => {
          this.bloques = bloques;
          this.verification = verification;
        },
        error: (error) => {
          this.bloques = [];
          this.verification = null;
          this.errorMessage =
            error.error?.message ?? 'No se pudo cargar la cadena de bloques.';
        },
      });
  }

  truncateHash(hash: string | null): string {
    if (!hash) return '—';
    return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
  }
}
