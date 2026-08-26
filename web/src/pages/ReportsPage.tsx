import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import {
  EmptyRow,
  KpiTile,
  PageHeader,
  ProgressBar,
  Section,
  formatMoney,
  PageSkeleton,
} from '../components/ui.js';
import type { BehaviorRow } from '../api/types.js';

export default function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['behavior-overview'],
    queryFn: () =>
      api.get<{ rows: BehaviorRow[]; distribution: Record<string, number> }>(
        '/customers/behavior/overview',
      ),
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton kpis={4} rows={8} />
    );
  }

  const rows = data.rows;
  const segments = Object.entries(data.distribution).sort((a, b) => b[1] - a[1]);
  const maxSegment = Math.max(1, ...segments.map(([, n]) => n));
  const atRisk = rows.filter((r) => r.churnRisk === 'yuksek').length;
  const champions = rows.filter((r) => r.segment.includes('Champion')).length;
  const totalRevenue = rows.reduce((s, r) => s + r.monetary, 0);

  return (
    <div className="mp-page">
      <PageHeader
        title="Raporlar"
        subtitle="RFM tabanlı davranış tahmini — her skorun gerekçesi müşteriye anlatılabilir"
      />

      <div className="mp-kpis">
        <KpiTile label="Analiz Edilen Müşteri" value={rows.length} tone="info" />
        <KpiTile label="Sadık Müşteri" value={champions} tone="good" />
        <KpiTile
          label="Yüksek Kayıp Riski"
          value={atRisk}
          tone={atRisk > 0 ? 'critical' : 'good'}
        />
        <KpiTile label="Toplam Ciro" value={formatMoney(totalRevenue)} tone="good" />
      </div>

      <div className="mp-split">
        <div>
          <Section title="Müşteri davranış tablosu">
            <div className="mp-note">
              <strong>RFM nasıl okunur?</strong> Üç rakam sırasıyla Yenilik (son sipariş ne kadar
              yakın), Sıklık (kaç sipariş) ve Parasal değer (toplam ciro) puanlarıdır. Her müşteri
              diğerlerine göre 1-5 arası puanlanır; 555 en iyi, 111 en zayıf profildir.
            </div>
            {rows.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Müşteri</th>
                      <th>Sektör</th>
                      <th>RFM</th>
                      <th>Segment</th>
                      <th className="mp-num">Son sipariş</th>
                      <th className="mp-num">Sipariş</th>
                      <th className="mp-num">Ciro</th>
                      <th style={{ minWidth: 110 }}>Satın alma olasılığı</th>
                      <th>Kayıp riski</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.customerId} className={r.churnRisk === 'yuksek' ? 'mp-row--overdue' : undefined}>
                        <td>
                          <strong>{r.customer?.name}</strong>
                          <div className="mp-person__title">{r.explanation}</div>
                        </td>
                        <td>{r.customer?.industry ?? '-'}</td>
                        <td>
                          <code>{r.rfm}</code>
                        </td>
                        <td>{r.segment}</td>
                        <td className="mp-num">
                          {r.recencyDays === null ? 'Hiç' : `${r.recencyDays} gün`}
                        </td>
                        <td className="mp-num">{r.frequency}</td>
                        <td className="mp-num">{formatMoney(r.monetary)}</td>
                        <td>
                          <ProgressBar
                            value={r.purchaseProbability}
                            tone={
                              r.purchaseProbability >= 70
                                ? 'good'
                                : r.purchaseProbability >= 40
                                  ? 'warning'
                                  : 'critical'
                            }
                          />
                        </td>
                        <td>
                          {r.churnRisk === 'yuksek' ? (
                            <strong style={{ color: 'var(--sapNegativeTextColor)' }}>Yüksek</strong>
                          ) : r.churnRisk === 'orta' ? (
                            <span style={{ color: 'var(--sapCriticalTextColor)' }}>Orta</span>
                          ) : (
                            <span style={{ color: 'var(--sapPositiveTextColor)' }}>Düşük</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title="Segment dağılımı">
            {segments.map(([name, count]) => (
              <div key={name} className="mp-seg">
                <span className="mp-seg__name">{name}</span>
                <span className="mp-seg__bar">
                  <span className="mp-seg__fill" style={{ width: `${(count / maxSegment) * 100}%` }} />
                </span>
                <span className="mp-seg__count">{count}</span>
              </div>
            ))}
          </Section>

          <Section title="Segment tanımları">
            <dl style={{ margin: 0, fontSize: '0.8125rem' }}>
              {[
                ['Sadık Müşteri (Champion)', 'Yakın zamanda, sık ve yüksek tutarlı alım yapıyor. Referans ve çapraz satış için ideal.'],
                ['Düzenli Müşteri', 'İstikrarlı alım yapıyor. Sadakat programına aday.'],
                ['Yeni Müşteri', 'Yakın zamanda ilk alımlarını yaptı. İkinci siparişe dönüşüm kritik.'],
                ['Sadık ama Yavaşlayan', 'Geçmişte güçlüydü, temas sıklığı düştü. Yeniden aktifleştirin.'],
                ['Standart Müşteri', 'Ortalama profil. Fırsat yaratacak tetikleyici gerekiyor.'],
                ['Risk Altında', 'Değerli ama uzaklaşıyor. Üst yönetim teması önerilir.'],
                ['Uykuya Dalmış', 'Uzun süredir sipariş yok. Kampanya ile geri kazanılabilir.'],
                ['Kaybedilmiş Müşteri', 'İlişki kopmuş. Yeniden kazanım maliyeti yüksek.'],
                ['Potansiyel Müşteri', 'Henüz siparişi yok. İlk siparişe dönüştürme hedefi.'],
              ].map(([name, desc]) => (
                <div key={name} style={{ marginBottom: '0.5rem' }}>
                  <dt style={{ fontWeight: 600 }}>{name}</dt>
                  <dd style={{ margin: 0, color: 'var(--sapContent_LabelColor)' }}>{desc}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Yöntem">
            <div style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
              Makine öğrenmesi modeli değil, açıklanabilir bir <strong>RFM</strong> analizi
              kullanılır:
              <ul style={{ paddingLeft: '1.1rem', marginTop: '0.375rem' }}>
                <li>
                  <strong>Yenilik (R):</strong> son siparişin üzerinden geçen gün
                </li>
                <li>
                  <strong>Sıklık (F):</strong> toplam sipariş adedi
                </li>
                <li>
                  <strong>Parasal değer (M):</strong> toplam ciro
                </li>
              </ul>
              Her müşteri bu üç metrikte diğerlerine göre 1-5 arası puanlanır; puan
              kombinasyonundan segment ve satın alma olasılığı türetilir. İptal edilen siparişler
              hesaba katılmaz.
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
