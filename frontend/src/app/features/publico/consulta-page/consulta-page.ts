import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { finalize } from 'rxjs';
import { ConsultaResultado, PublicoService } from '../publico.service';
import { Html5Qrcode } from 'html5-qrcode';
import { AuthService } from '../../../core/services/auth';

type ConsultaEstado = 'cargando' | 'encontrado' | 'no-encontrado' | 'sin-codigo';

const TIPO_LABELS: Record<ConsultaResultado['tipo'], string> = {
  LOTE: 'Lote de producción',
  EMPAQUE: 'Caja de empaque',
  ENVIO: 'Envío',
};

@Component({
  selector: 'app-consulta-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './consulta-page.html',
  styleUrls: ['../../farms/farms-page/farms-page.css', './consulta-page.css'],
})
export class ConsultaPage implements OnInit, OnDestroy {
  private readonly publicoService = inject(PublicoService);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly auth = inject(AuthService);

  estado: ConsultaEstado = 'sin-codigo';
  resultado: ConsultaResultado | null = null;
  codigo = '';
  readonly tipoLabels = TIPO_LABELS;

  scanning = false;
  private html5QrCode: Html5Qrcode | null = null;

  ngOnInit(): void {
    const codigo = this.route.snapshot.queryParamMap.get('codigo')?.trim();
    if (!codigo) {
      this.estado = 'sin-codigo';
      return;
    }
    this.codigo = codigo;
    this.buscar(codigo);
  }

  ngOnDestroy(): void {
    if (this.html5QrCode && this.html5QrCode.isScanning) {
      this.html5QrCode.stop().catch(console.error);
    }
  }

  async startScanner(): Promise<void> {
    this.scanning = true;
    this.estado = 'sin-codigo';
    this.resultado = null;
    this.cdr.detectChanges(); // Ensure #reader is in DOM

    try {
      this.html5QrCode = new Html5Qrcode("reader");
      await this.html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          this.onScanSuccess(decodedText);
        },
        (errorMessage) => {
          // ignore scan errors
        }
      );
    } catch (err) {
      console.error("Error starting scanner", err);
      this.scanning = false;
      this.cdr.detectChanges();
    }
  }

  async onScanSuccess(decodedText: string): Promise<void> {
    if (this.html5QrCode && this.html5QrCode.isScanning) {
      try {
        await this.html5QrCode.stop();
        this.html5QrCode.clear();
      } catch (e) {
        console.error("Error stopping scanner", e);
      }
      this.html5QrCode = null;
    }
    this.scanning = false;
    
    if (!decodedText) {
      this.estado = 'sin-codigo';
      return;
    }
    
    let parsedCode = decodedText;
    if (parsedCode.includes('/trace/')) {
      parsedCode = parsedCode.split('/trace/').pop() || decodedText;
    } else if (parsedCode.includes('/lotes/')) {
      parsedCode = parsedCode.split('/lotes/').pop() || decodedText;
    }
    
    this.codigo = decodeURIComponent(parsedCode);
    this.buscar(this.codigo);
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
