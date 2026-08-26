import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import type { TickerData } from '../api/types.js';

/**
 * ShellBar'ın orta alanında sağdan sola akan canlı satış özeti.
 * Aynı içerik iki kez basılır; CSS animasyonu %50 kaydırınca kesintisiz döngü oluşur.
 */
export function StatusTicker() {
  const { data } = useQuery({
    queryKey: ['dashboard-ticker'],
    queryFn: () => api.get<TickerData>('/dashboard/ticker'),
    refetchInterval: 60_000,
  });

  if (!data) return null;

  const items: { label: string; value: string; critical?: boolean }[] = [
    { label: 'Aktif Müşteri', value: String(data.customers) },
    { label: 'Açık Fırsat', value: String(data.opportunities) },
    { label: 'Bekleyen Teklif', value: String(data.quotes) },
    { label: 'Üretimdeki Sipariş', value: String(data.activeOrders) },
    { label: 'Termini Geçen', value: String(data.lateOrders), critical: data.lateOrders > 0 },
    { label: 'Açık Servis', value: String(data.openTickets), critical: data.openTickets > 0 },
  ];

  const group = (
    <div className="mp-ticker__group">
      {items.map((item) => (
        <span
          key={item.label}
          className={`mp-ticker__item${item.critical ? ' mp-ticker__item--critical' : ''}`}
        >
          <span className="mp-ticker__label">{item.label}</span>
          <span className="mp-ticker__value">{item.value}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="mp-ticker">
      <div className="mp-ticker__track">
        {group}
        {group}
      </div>
    </div>
  );
}
