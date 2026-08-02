import { CommonModule, DOCUMENT } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  AfterViewInit,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { finalize } from 'rxjs';
import { ROLE_IDS } from '../../../core/auth/role.constants';
import { AuthService } from '../../../core/services/auth';
import { Producer } from '../../producers/producers.service';
import { Farm, FarmPayload, FarmsService } from '../farms.service';

@Component({
  selector: 'app-farm-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './farm-form.html',
  styleUrls: ['./farm-form.css'],
})
export class FarmForm implements OnInit, AfterViewInit, OnDestroy {
  @Input() farm: Farm | null = null;
  @Input() producers: Producer[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Farm>();
  @ViewChild('mapContainer') private mapContainer?: ElementRef<HTMLDivElement>;

  private readonly farmsService = inject(FarmsService);
  private readonly authService = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly cdr = inject(ChangeDetectorRef);
  private previousBodyOverflow = '';
  private map?: L.Map;
  private locationMarker?: L.CircleMarker;

  model: FarmPayload = this.emptyModel();
  isSaving = false;
  errorMessage = '';

  get isEditMode(): boolean {
    return this.farm !== null;
  }

  get isAdmin(): boolean {
    return this.authService.currentUser()?.idRol === ROLE_IDS.ADMINISTRADOR;
  }

  ngOnInit(): void {
    this.previousBodyOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
    if (this.farm) this.populate(this.farm);
  }

  ngOnDestroy(): void {
    this.document.body.style.overflow = this.previousBodyOverflow;
    this.map?.remove();
  }

  ngAfterViewInit(): void {
    if (!this.mapContainer) return;
    const coordinates = this.readCoordinates();
    const center: L.LatLngExpression = coordinates ?? [-1.8312, -78.1834];
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: true,
      attributionControl: true,
    }).setView(center, coordinates ? 15 : 6);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    if (coordinates) this.drawLocation(coordinates);
    this.map.on('click', (event: L.LeafletMouseEvent) => {
      this.model.latitud = event.latlng.lat.toFixed(6);
      this.model.longitud = event.latlng.lng.toFixed(6);
      this.drawLocation([event.latlng.lat, event.latlng.lng]);
      this.cdr.detectChanges();
    });
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    if (!this.isSaving) this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  updateMapFromInputs(): void {
    const coordinates = this.readCoordinates();
    if (!coordinates || !this.map) return;
    this.drawLocation(coordinates);
    this.map.setView(coordinates, Math.max(this.map.getZoom(), 15));
  }

  onSubmit(): void {
    this.errorMessage = '';
    const payload: FarmPayload = {
      nombre: this.model.nombre.trim(),
      pais: this.model.pais.trim(),
      region: this.model.region.trim(),
      localidad: this.model.localidad.trim(),
      sublocalidad: this.model.sublocalidad?.trim() || undefined,
      latitud: this.model.latitud || null,
      longitud: this.model.longitud || null,
      areaHectareas: this.model.areaHectareas || null,
      estado: this.model.estado ?? true,
    };
    if (this.isAdmin) payload.idProductor = this.model.idProductor;

    this.isSaving = true;
    const request = this.farm
      ? this.farmsService.updateFarm(this.farm.idFinca, payload)
      : this.farmsService.createFarm(payload);
    request
      .pipe(
        finalize(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (farm) => this.saved.emit(farm),
        error: (error) => {
          this.errorMessage = error.error?.message ?? 'No se pudo guardar la finca.';
        },
      });
  }

  private emptyModel(): FarmPayload {
    return {
      idProductor: '',
      nombre: '',
      pais: '',
      region: '',
      localidad: '',
      sublocalidad: '',
      latitud: null,
      longitud: null,
      areaHectareas: null,
      estado: true,
    };
  }

  private populate(farm: Farm): void {
    this.model = {
      idProductor: farm.idProductor,
      nombre: farm.nombre,
      pais: farm.pais,
      region: farm.region,
      localidad: farm.localidad,
      sublocalidad: farm.sublocalidad ?? '',
      latitud: farm.latitud,
      longitud: farm.longitud,
      areaHectareas: farm.areaHectareas,
      estado: farm.estado,
    };
  }

  private readCoordinates(): [number, number] | null {
    if (
      this.model.latitud === null ||
      this.model.latitud === undefined ||
      this.model.latitud === '' ||
      this.model.longitud === null ||
      this.model.longitud === undefined ||
      this.model.longitud === ''
    ) {
      return null;
    }
    const latitude = Number(this.model.latitud);
    const longitude = Number(this.model.longitud);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return null;
    }
    return [latitude, longitude];
  }

  private drawLocation(coordinates: L.LatLngExpression): void {
    if (!this.map) return;
    if (this.locationMarker) {
      this.locationMarker.setLatLng(coordinates);
      return;
    }
    this.locationMarker = L.circleMarker(coordinates, {
      radius: 9,
      color: '#ffffff',
      weight: 3,
      fillColor: '#16834b',
      fillOpacity: 1,
    }).addTo(this.map);
  }
}
