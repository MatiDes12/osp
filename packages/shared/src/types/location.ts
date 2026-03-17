export interface Location {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
  cameraCount?: number;
  createdAt: string;
  updatedAt: string;
}
