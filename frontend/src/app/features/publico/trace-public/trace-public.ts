import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { ConsultaResultado, PublicoService } from '../publico.service';

type TraceEstado = 'cargando' | 'encontrado' | 'no-encontrado' | 'sin-codigo';

const TIPO_LABELS: Record<ConsultaResultado['tipo'], string> = {
  LOTE: 'Lote de producción',
  EMPAQUE: 'Caja de empaque',
  ENVIO: 'Envío',
};

@Component({
  selector: 'app-trace-public',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trace-public.html',
  styleUrls: ['./trace-public.css'],
})
export class TracePublicPage implements OnInit {
  private readonly publicoService = inject(PublicoService);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);

  estado: TraceEstado = 'cargando';
  resultado: ConsultaResultado | null = null;
  codigo = '';
  readonly tipoLabels = TIPO_LABELS;

  isDarkMode = true;

  get currentYear(): number {
    return new Date().getFullYear();
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
  }

  ngOnInit(): void {
    const codigo = this.route.snapshot.paramMap.get('codigo')?.trim();
    if (!codigo) {
      this.estado = 'sin-codigo';
      return;
    }
    this.codigo = codigo;
    this.buscar(codigo);
  }

  private buscar(codigo: string): void {
    this.estado = 'cargando';
    this.publicoService
      .consultar(codigo)
      .pipe(finalize(() => this.cdr.detectChanges()))
      .subscribe({
        next: (resultado) => {
          this.resultado = resultado;
          this.estado = 'encontrado';
        },
        error: () => {
          this.resultado = null;
          this.estado = 'no-encontrado';
        },
      });
  }
}
