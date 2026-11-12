import type { Veiculo } from '../tipos/veiculos';

/** ABC1234 -> ABC-1234; Mercosul (ABC1D23) fica como está. */
export function formatarPlaca(placa: string): string {
  return /^[A-Z]{3}[0-9]{4}$/.test(placa) ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa;
}

export function descricaoVeiculo(v: Pick<Veiculo, 'marca' | 'modelo' | 'ano'>): string {
  return `${v.marca} ${v.modelo}${v.ano ? ` ${v.ano}` : ''}`;
}

export function formatarKm(km: number): string {
  return `${new Intl.NumberFormat('pt-BR').format(km)} km`;
}
