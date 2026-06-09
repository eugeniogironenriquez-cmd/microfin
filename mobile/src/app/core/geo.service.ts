import { Injectable } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Captura la ubicación GPS al registrar un pago o visita.
 * Devuelve null si el usuario no da permiso o no hay señal,
 * para no bloquear el registro (la geo es complementaria).
 */
@Injectable({ providedIn: 'root' })
export class GeoService {
  async getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') return null;
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }
}
