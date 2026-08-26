import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, Button, Dialog, Icon, Input, Label } from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useNotify } from '../components/NotificationProvider.js';
import {
  DateInput,
  EmptyRow,
  KpiTile,
  PageHeader,
  Section,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  daysUntil,
  daysFromToday,
  INTERACTION_LABEL,
  PageSkeleton,
} from '../components/ui.js';
import type { DashboardData, ErpStatus } from '../api/types.js';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { toast, error: showError } = useNotify();
  const [taskFor, setTaskFor] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  });

  const erp = useQuery({
    queryKey: ['dashboard-erp'],
    queryFn: () => api.get<ErpStatus>('/dashboard/erp'),
    // ERP kapalıysa her açılışta beklememek için seyrek yenilenir.
    staleTime: 120_000,
  });

  const completeTask = useMutation({
    mutationFn: (id: string) => api.patch(`/tasks/${id}/status`, { status: 'TAMAMLANDI' }),
    onSuccess: () => {
      toast('Görev tamamlandı.');
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => showError(errorMessage(err)),
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton kpis={8} rows={6} />
    );
  }

  const segments = Object.entries(data.segmentDistribution).sort((a, b) => b[1] - a[1]);
  const maxSegment = Math.max(1, ...segments.map(([, n]) => n));

  return (
    <div className="mp-page">
      <PageHeader
        title="Gösterge Paneli"
        subtitle="Satış hunisi, teklif durumu, üretim ve satış sonrası hizmetlerin tek ekranda özeti"
        actions={
          <>
            <ErpBadge status={erp.data} />
            <Button design="Transparent" icon="refresh" onClick={() => refetch()}>
              Yenile
            </Button>
          </>
        }
      />

      <div className="mp-kpis">
        <KpiTile label="Aktif Müşteri" value={formatNumber(data.customerCount)} tone="info" />
        <KpiTile
          label="Açık Fırsat"
          value={formatNumber(data.openOpportunities)}
          tone="info"
          hint={`Ağırlıklı: ${formatMoney(data.weightedPipeline)}`}
        />
        <KpiTile label="Pipeline Değeri" value={formatMoney(data.pipelineValue)} tone="info" />
        <KpiTile
          label="Bekleyen Teklif"
          value={formatNumber(data.openQuotes)}
          tone={data.pendingApproval > 0 ? 'warning' : 'info'}
          hint={data.pendingApproval > 0 ? `${data.pendingApproval} teklif onay bekliyor` : undefined}
        />
        <KpiTile label="Toplam Ciro" value={formatMoney(data.lifetimeValue)} tone="good" />
        <KpiTile
          label="Üretimdeki Sipariş"
          value={formatNumber(data.activeOrders)}
          tone={data.lateOrders > 0 ? 'critical' : 'good'}
          hint={data.lateOrders > 0 ? `${data.lateOrders} sipariş termini geçti` : undefined}
        />
        <KpiTile
          label="Açık Servis Kaydı"
          value={formatNumber(data.openTickets)}
          tone={data.overdueTickets > 0 ? 'critical' : 'good'}
          hint={data.overdueTickets > 0 ? `${data.overdueTickets} kayıt SLA dışı` : undefined}
        />
        <KpiTile
          label="Yaklaşan Sözleşme"
          value={formatNumber(data.expiringContracts)}
          tone={data.expiringContracts > 0 ? 'warning' : 'info'}
          hint="30 gün içinde biten/yenilenen"
        />
      </div>

      <div className="mp-split">
        <div>
          {/* Davranış analizini pasif bir rapor olmaktan çıkarıp aksiyona bağlayan panel. */}
          <Section title="Dikkat gerektiren müşteriler">
            <div className="mp-note">
              Churn riski yüksek olduğu hâlde üzerinde açık görev bulunmayan müşteriler. Tek tıkla
              takip görevi oluşturabilirsiniz.
            </div>
            {data.attentionNeeded.length === 0 ? (
              <EmptyRow text="Riskli müşterilerin tamamı takipte." />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Müşteri</th>
                      <th>Sektör</th>
                      <th>Segment</th>
                      <th className="mp-num">Son sipariş</th>
                      <th className="mp-num">Satın alma olasılığı</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.attentionNeeded.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                          <div className="mp-person__title">{c.code}</div>
                        </td>
                        <td>{c.industry ?? '-'}</td>
                        <td>{c.segment}</td>
                        <td className="mp-num">
                          {c.recencyDays === null ? 'Hiç' : `${c.recencyDays} gün önce`}
                        </td>
                        <td className="mp-num">%{c.purchaseProbability}</td>
                        <td>
                          <Button
                            design="Transparent"
                            icon="add-activity"
                            onClick={() => setTaskFor({ id: c.id, name: c.name })}
                          >
                            Görev oluştur
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Son etkileşimler">
            {data.recentInteractions.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Müşteri</th>
                      <th>Tür</th>
                      <th>Konu</th>
                      <th>Kişi</th>
                      <th>Kaydeden</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentInteractions.map((i) => (
                      <tr key={i.id}>
                        <td>{formatDate(i.occurredAt)}</td>
                        <td>{i.customer?.name ?? '-'}</td>
                        <td>{INTERACTION_LABEL[i.type]}</td>
                        <td>{i.subject}</td>
                        <td>{i.contact?.fullName ?? '-'}</td>
                        <td>{i.user?.fullName ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Son siparişler">
            {data.recentOrders.length === 0 ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Sipariş No</th>
                      <th>Müşteri</th>
                      <th>Tarih</th>
                      <th>Termin</th>
                      <th className="mp-num">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((o) => {
                      const left = daysUntil(o.promisedDate);
                      const late = left !== null && left < 0 && o.status !== 'TESLIM_EDILDI';
                      return (
                        <tr key={o.id} className={late ? 'mp-row--overdue' : undefined}>
                          <td>{o.orderNo}</td>
                          <td>{o.customer?.name ?? '-'}</td>
                          <td>{formatDate(o.orderDate)}</td>
                          <td>
                            {formatDate(o.promisedDate)}
                            {late && <strong> ({Math.abs(left as number)} gün gecikme)</strong>}
                          </td>
                          <td className="mp-num">{formatMoney(o.totalAmount, o.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title="Davranış segmentleri">
            {segments.length === 0 ? (
              <EmptyRow />
            ) : (
              segments.map(([name, count]) => (
                <div key={name} className="mp-seg">
                  <span className="mp-seg__name">{name}</span>
                  <span className="mp-seg__bar">
                    <span className="mp-seg__fill" style={{ width: `${(count / maxSegment) * 100}%` }} />
                  </span>
                  <span className="mp-seg__count">{count}</span>
                </div>
              ))
            )}
          </Section>

          <Section
            title={`Yaklaşan görevler${data.overdueTasks > 0 ? ` (${data.overdueTasks} gecikmiş)` : ''}`}
          >
            {data.upcomingTasks.length === 0 ? (
              <EmptyRow text="Açık görev yok." />
            ) : (
              data.upcomingTasks.map((t) => {
                const left = daysUntil(t.dueAt);
                const overdue = left !== null && left < 0;
                return (
                  <div
                    key={t.id}
                    className={`mp-opp-card${overdue ? ' mp-row--overdue' : ''}`}>
                    <div className="mp-opp-card__title">{t.title}</div>
                    <div className="mp-opp-card__meta">
                      {t.customer?.name ?? 'Genel'} · {formatDate(t.dueAt)}
                      {overdue ? ` · ${Math.abs(left as number)} gün gecikti` : ''}
                    </div>
                    <div style={{ marginTop: '0.25rem' }}>
                      <Button
                        design="Transparent"
                        icon="accept"
                        onClick={() => completeTask.mutate(t.id)}
                      >
                        Tamamlandı
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </Section>
        </div>
      </div>

      {taskFor && (
        <QuickTaskDialog
          customer={taskFor}
          onClose={() => setTaskFor(null)}
          onSaved={() => {
            setTaskFor(null);
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      )}
    </div>
  );
}

/** ERP (Marpol PPM) bağlantı rozeti. */
function ErpBadge({ status }: { status?: ErpStatus }) {
  if (!status) return null;
  const tone = !status.enabled ? '#6a6d70' : status.connected ? '#107e3e' : '#bb0000';
  const text = !status.enabled ? 'ERP kapalı' : status.connected ? 'ERP bağlı' : 'ERP bağlantısı yok';
  return (
    <span
      title={`${status.message} (${status.baseUrl})`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        fontSize: '0.8125rem',
        color: tone,
        fontWeight: 600,
        alignSelf: 'center',
      }}
    >
      <Icon name={status.connected ? 'connected' : 'disconnected'} style={{ color: tone }} />
      {text}
    </span>
  );
}

function QuickTaskDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: { id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [title, setTitle] = useState(`${customer.name} - yeniden temas`);
  const [dueAt, setDueAt] = useState(daysFromToday(7));

  const save = useMutation({
    mutationFn: () => api.post('/tasks', { customerId: customer.id, title, dueAt }),
    onSuccess: () => {
      toast('Görev oluşturuldu.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Takip görevi oluştur"
      onClose={onClose}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>
                Vazgeç
              </Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={!title || !dueAt}>
                Oluştur
              </Button>
            </>
          }
        />
      }
    >
      <div style={{ display: 'grid', gap: '0.75rem', width: '380px', padding: '0.5rem 0' }}>
        <div>
          <Label showColon>Müşteri</Label>
          <div style={{ fontWeight: 600 }}>{customer.name}</div>
        </div>
        <div>
          <Label required showColon>
            Görev
          </Label>
          <Input style={{ width: '100%' }} value={title} onInput={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label required showColon>
            Vade
          </Label>
          <DateInput style={{ width: '100%' }} value={dueAt} onChange={(v) => setDueAt(v)} />
        </div>
        <div className="mp-person__title">Oluşturulma: {formatDateTime(new Date().toISOString())}</div>
      </div>
    </Dialog>
  );
}
