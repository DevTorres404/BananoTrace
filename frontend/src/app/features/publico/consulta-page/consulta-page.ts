import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { ConsultaResultado, PublicoService } from '../publico.service';

type ConsultaEstado = 'cargando' | 'encontrado' | 'no-encontrado' | 'sin-codigo';

const TIPO_LABELS: Record<ConsultaResultado['tipo'], string> = {
  LOTE: 'Lote de producción',
  EMPAQUE: 'Caja de empaque',
  ENVIO: 'Envío',
};

@Component({
  selector: 'app-consulta-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './consulta-page.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './consulta-page.css'],
})
export class ConsultaPage implements OnInit {
  private readonly publicoService = inject(PublicoService);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);

  estado: ConsultaEstado = 'sin-codigo';
  resultado: ConsultaResultado | null = null;
  codigo = '';
  readonly tipoLabels = TIPO_LABELS;

  ngOnInit(): void {
    const codigo = this.route.snapshot.queryParamMap.get('codigo')?.trim();
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
      .pipe(
        finalize(() => {
          this.cdr.detectChanges();
        }),
      )
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
