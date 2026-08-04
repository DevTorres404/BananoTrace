import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { ConsultaResultado, PublicoService } from '../publico.service';
import { AuthService } from '../../../core/services/auth';
import { ThemeService } from '../../../core/services/theme';

type TraceEstado =
  | 'cargando'
  | 'encontrado'
  | 'no-encontrado'
  | 'no-disponible'
  | 'sin-codigo';

type EstadoVerificacion = 'verificado' | 'alerta' | 'sin-verificacion';

const TIPO_LABELS: Record<ConsultaResultado['tipo'], string> = {
  LOTE: 'Lote de producción',
  EMPAQUE: 'Caja de empaque',
  ENVIO: 'Envío',
};

const VERIFICACION_LABELS: Record<EstadoVerificacion, string> = {
  verificado: 'Producto verificado',
  alerta: 'Alerta de integridad',
  'sin-verificacion': 'Sin verificación',
};

interface PasoFechas {
  label: string;
  fecha: string;
}

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
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  estado: TraceEstado = 'cargando';
  resultado: ConsultaResultado | null = null;
  codigo = '';
  readonly tipoLabels = TIPO_LABELS;
  readonly verificacionLabels = VERIFICACION_LABELS;

  get isDarkMode(): boolean {
    return this.theme.theme() === 'dark';
  }

  get currentYear(): number {
    return new Date().getFullYear();
  }

  get estadoVerificacion(): EstadoVerificacion | null {
    const integridad = this.resultado?.integridadBlockchain;
    if (!integridad) return null;
    if (integridad.verificable && integridad.integra === true) return 'verificado';
    if (integridad.verificable && integridad.integra === false) return 'alerta';
    return 'sin-verificacion';
  }

  get pasosFechas(): PasoFechas[] {
    const fechas = this.resultado?.fechas;
    if (!fechas) return [];
    const candidatos: Array<{ label: string; fecha: string | null }> = [
      { label: 'Siembra', fecha: fechas.siembra },
      { label: 'Cosecha', fecha: fechas.cosecha },
      { label: 'Empaque', fecha: fechas.empaque },
      { label: 'Salida', fecha: fechas.salida },
      { label: 'Llegada estimada', fecha: fechas.llegadaEstimada },
    ];
    return candidatos
      .filter((c) => c.fecha !== null && c.fecha !== '')
      .map((c) => ({ label: c.label, fecha: c.fecha as string }));
  }

  get temperaturaLabel(): string | null {
    const temp = this.resultado?.envio?.temperaturaSalida;
    if (temp === null || temp === undefined || temp === '') return null;
    return temp.replace('.', ',');
  }

  get temperaturaEnRangoOptimo(): boolean | null {
    const temp = this.resultado?.envio?.temperaturaSalida;
    if (temp === null || temp === undefined || temp === '') return null;
    const valor = Number.parseFloat(temp.replace(',', '.'));
    if (Number.isNaN(valor)) return null;
    return valor >= 12 && valor <= 14;
  }

  toggleTheme(): void {
    this.theme.toggle();
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
        error: (err) => {
          this.resultado = null;
          this.estado = err?.status === 404 ? 'no-encontrado' : 'no-disponible';
        },
      });
  }
}
