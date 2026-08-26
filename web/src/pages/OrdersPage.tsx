import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  Button,
  Dialog,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
  TextArea,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useNotify } from '../components/NotificationProvider.js';
import { DataToolbar } from '../components/DataToolbar.js';
import {
  EmptyRow,
  Field,
  FieldGrid,
  KpiTile,
  OrderStatusBadge,
  PageHeader,
  ProgressBar,
  Section,
  ERP_STATUS_LABEL,
  HANDOVER_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  daysUntil,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  PageSkeleton,
  TableSkeleton,
} from '../components/ui.js';
import type { ErpStatus, Order, OrderStatus } from '../api/types.js';

export default function OrdersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['orders', search],
    queryFn: () => api.get<Order[]>(`/orders${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  const kpi = useQuery({
    queryKey: ['orders-kpi'],
    queryFn: () =>
      api.get<{ total: number; late: number; revenue: number; byStatus: Record<string, number> }>(
        '/orders/summary/kpi',
      ),
  });

  if (selected) return <OrderDetail id={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="mp-page">
      <PageHeader
        title="Siparişler"
        subtitle="Sipariş takibi ve Marpol PPM üzerinden canlı üretim durumu"
      />

      <div className="mp-kpis">
        <KpiTile label="Toplam Sipariş" value={kpi.data?.total ?? 0} tone="info" />
        <KpiTile label="Üretimde" value={kpi.data?.byStatus?.URETIMDE ?? 0} tone="info" />
        <KpiTile label="Onay Bekleyen" value={kpi.data?.byStatus?.ONAY_BEKLIYOR ?? 0} tone="warning" />
        <KpiTile
          label="Termini Geçen"
          value={kpi.data?.late ?? 0}
          tone={(kpi.data?.late ?? 0) > 0 ? 'critical' : 'good'}
        />
        <KpiTile label="Toplam Ciro" value={formatMoney(kpi.data?.revenue ?? 0)} tone="good" />
      </div>

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => {
          list.refetch();
          kpi.refetch();
        }}
        count={list.data?.length}
        canCreate={false}
      />

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow
          icon="sales-order"
          text={search ? 'Aramanızla eşleşen sipariş yok.' : 'Henüz sipariş yok.'}
          hint={
            search
              ? 'Sipariş no, müşteri PO no ya da müşteri adına göre arayabilirsiniz.'
              : 'Siparişler, kabul edilen tekliflerin "Siparişe dönüştür" işlemiyle oluşur.'
          }
        />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Sipariş No</th>
                <th>Müşteri</th>
                <th>Müşteri PO</th>
                <th>Durum</th>
                <th>Sipariş tarihi</th>
                <th>Termin</th>
                <th>Üretim durumu</th>
                <th className="mp-num">Tutar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((o) => {
                const left = daysUntil(o.promisedDate);
                const late =
                  left !== null &&
                  left < 0 &&
                  !['TESLIM_EDILDI', 'FATURALANDI', 'IPTAL'].includes(o.status);
                const links = (o.items ?? []).map((i) => i.erpLink).filter(Boolean);
                const progress = links.length
                  ? links.reduce((s, l) => s + (l?.progressPct ?? 0), 0) / links.length
                  : null;
                return (
                  <tr key={o.id} className={late ? 'mp-row--overdue' : undefined}>
                    <td>{o.orderNo}</td>
                    <td>{o.customer?.name}</td>
                    <td>{o.customerPoNo ?? '-'}</td>
                    <td>
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td>{formatDate(o.orderDate)}</td>
                    <td>
                      {formatDate(o.promisedDate)}
                      {late && <div className="mp-optgroup__req">{Math.abs(left)} gün gecikme</div>}
                    </td>
                    <td style={{ minWidth: 110 }}>
                      {progress === null ? (
                        <span className="mp-person__title">ERP bağlantısı yok</span>
                      ) : (
                        <ProgressBar value={progress} tone={progress >= 100 ? 'good' : 'info'} />
                      )}
                    </td>
                    <td className="mp-num">{formatMoney(o.totalAmount, o.currency)}</td>
                    <td>
                      <Button design="Transparent" icon="detail-view" onClick={() => setSelected(o.id)}>
                        Aç
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!can('SIPARISLER', 'edit') && (
        <div className="mp-note" style={{ marginTop: '1rem' }}>
          Siparişler yalnızca görüntüleme yetkinizle açılıyor. Durum değişikliği için yetki gerekir.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { toast, error: showError } = useNotify();
  const [statusOpen, setStatusOpen] = useState(false);
  const [linkFor, setLinkFor] = useState<{ id: string; description: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<Order>(`/orders/${id}`),
  });

  const erp = useQuery({
    queryKey: ['erp-status'],
    queryFn: () => api.get<ErpStatus>('/orders/erp/status'),
    staleTime: 120_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['order', id] });

  const sync = useMutation({
    mutationFn: () =>
      api.post<{ results: { erpOrderNo: string; ok: boolean; message: string }[] }>(
        `/orders/${id}/erp-sync`,
      ),
    onSuccess: (res) => {
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length) {
        showError(`ERP senkronizasyonu kısmen başarısız: ${failed.map((f) => f.message).join(' | ')}`);
      } else {
        toast('Üretim durumu Marpol PPM üzerinden güncellendi.');
      }
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const handover = useMutation({
    mutationFn: () => api.post(`/orders/${id}/handover`),
    onSuccess: () => {
      toast('Malzeme listesi mühendisliğe aktarıldı.');
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton kpis={4} rows={5} />
    );
  }

  const links = (data.items ?? []).map((i) => i.erpLink).filter(Boolean);
  const progress = links.length
    ? links.reduce((s, l) => s + (l?.progressPct ?? 0), 0) / links.length
    : 0;
  const left = daysUntil(data.promisedDate);

  return (
    <div className="mp-page">
      <PageHeader
        title={data.orderNo}
        subtitle={`${data.customer?.name ?? ''}${data.quote ? ` · ${data.quote.quoteNo} teklifinden` : ''}`}
        actions={
          <>
            {links.length > 0 && (
              <Button design="Transparent" icon="synchronize" onClick={() => sync.mutate()}>
                ERP senkronize et
              </Button>
            )}
            {can('SIPARISLER', 'edit') && (
              <>
                <Button design="Transparent" icon="developer-settings" onClick={() => handover.mutate()}>
                  Mühendisliğe aktar
                </Button>
                <Button design="Emphasized" icon="status-positive" onClick={() => setStatusOpen(true)}>
                  Durum değiştir
                </Button>
              </>
            )}
            <Button design="Transparent" icon="nav-back" onClick={onBack}>
              Listeye dön
            </Button>
          </>
        }
      />

      {erp.data && !erp.data.connected && links.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <MessageStrip design="Critical" hideCloseButton>
            Marpol PPM'e ulaşılamıyor: {erp.data.message} Üretim durumu son senkronizasyondaki
            değerleri gösteriyor.
          </MessageStrip>
        </div>
      )}

      <div className="mp-kpis">
        <KpiTile label="Durum" value={<OrderStatusBadge status={data.status} />} tone="info" />
        <KpiTile label="Tutar" value={formatMoney(data.totalAmount, data.currency)} tone="good" />
        <KpiTile
          label="Termin"
          value={formatDate(data.promisedDate)}
          tone={left !== null && left < 0 ? 'critical' : 'info'}
          hint={left === null ? undefined : left < 0 ? `${Math.abs(left)} gün gecikme` : `${left} gün kaldı`}
        />
        <KpiTile
          label="Üretim İlerlemesi"
          value={links.length ? <ProgressBar value={progress} /> : 'ERP bağlantısı yok'}
          tone={links.length ? 'info' : 'warning'}
        />
      </div>

      <Section title="Sipariş kalemleri ve üretim durumu">
        <div className="mp-note">
          Her kalem Marpol PPM'deki bir üretim emrine bağlanabilir. "ERP senkronize et" ile hangi
          proses adımında olduğu buraya çekilir — satış ekibi müşterinin "siparişim ne durumda?"
          sorusunu buradan cevaplar.
        </div>
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Açıklama</th>
                <th className="mp-num">Miktar</th>
                <th className="mp-num">Birim fiyat</th>
                <th className="mp-num">Tutar</th>
                <th>Üretim emri</th>
                <th>ERP durumu</th>
                <th>Güncel adım</th>
                <th style={{ minWidth: 110 }}>İlerleme</th>
                <th>Son senk.</th>
                {can('SIPARISLER', 'edit') && <th />}
              </tr>
            </thead>
            <tbody>
              {(data.items ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.description}</strong>
                    {item.product && <div className="mp-person__title">{item.product.code}</div>}
                  </td>
                  <td className="mp-num">
                    {formatNumber(item.quantity)} {item.unit}
                  </td>
                  <td className="mp-num">{formatMoney(item.unitPrice, data.currency)}</td>
                  <td className="mp-num">{formatMoney(item.lineTotal, data.currency)}</td>
                  <td>{item.erpLink?.erpOrderNo ?? '-'}</td>
                  <td>
                    {item.erpLink?.erpStatus
                      ? (ERP_STATUS_LABEL[item.erpLink.erpStatus] ?? item.erpLink.erpStatus)
                      : '-'}
                    {item.erpLink?.lastSyncError && (
                      <div className="mp-optgroup__req">{item.erpLink.lastSyncError}</div>
                    )}
                  </td>
                  <td>{item.erpLink?.currentStep ?? '-'}</td>
                  <td>
                    {item.erpLink ? (
                      <ProgressBar
                        value={item.erpLink.progressPct}
                        tone={item.erpLink.progressPct >= 100 ? 'good' : 'info'}
                      />
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{item.erpLink?.lastSyncedAt ? formatDateTime(item.erpLink.lastSyncedAt) : '-'}</td>
                  {can('SIPARISLER', 'edit') && (
                    <td>
                      <Button
                        design="Transparent"
                        icon="chain-link"
                        onClick={() => setLinkFor({ id: item.id, description: item.description })}
                      >
                        {item.erpLink ? 'Değiştir' : 'Bağla'}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="mp-split">
        <div>
          <Section title="Mühendisliğe aktarımlar (PLM)">
            <div className="mp-note">
              Sipariş onaylandığında teklifteki malzeme listesi dondurularak mühendisliğe aktarılır.
            </div>
            {!data.handovers?.length ? (
              <EmptyRow text="Aktarım kaydı yok." />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Durum</th>
                      <th>ERP referansı</th>
                      <th>Not</th>
                      <th>Oluşturan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.handovers.map((h) => (
                      <tr key={h.id}>
                        <td>{formatDate(h.createdAt)}</td>
                        <td>{HANDOVER_STATUS_LABEL[h.status]}</td>
                        <td>{h.erpReference ?? '-'}</td>
                        <td>{h.note ?? '-'}</td>
                        <td>{h.createdBy?.fullName ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Durum geçmişi">
            {!data.history?.length ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Değişim</th>
                      <th>Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h) => (
                      <tr key={h.id}>
                        <td>{formatDateTime(h.changedAt)}</td>
                        <td>
                          {h.fromStatus ? `${ORDER_STATUS_LABEL[h.fromStatus]} → ` : ''}
                          {ORDER_STATUS_LABEL[h.toStatus]}
                        </td>
                        <td>{h.note ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title="Sipariş bilgileri">
            <FieldGrid>
              <Field label="Müşteri" value={data.customer?.name} />
              <Field label="Müşteri PO no" value={data.customerPoNo} />
              <Field label="Kaynak teklif" value={data.quote?.quoteNo} />
              <Field label="Sipariş tarihi" value={formatDate(data.orderDate)} />
              <Field label="Taahhüt tarihi" value={formatDate(data.promisedDate)} />
              <Field label="Teslim tarihi" value={formatDate(data.deliveredAt)} />
              <Field label="Ödeme koşulu" value={data.paymentTerms} />
              <Field label="Teslim koşulu" value={data.deliveryTerms} />
              <Field label="Oluşturan" value={data.createdBy?.fullName} />
            </FieldGrid>
          </Section>
        </div>
      </div>

      {statusOpen && (
        <StatusDialog
          order={data}
          onClose={() => setStatusOpen(false)}
          onSaved={() => {
            setStatusOpen(false);
            refresh();
          }}
        />
      )}

      {linkFor && (
        <ErpLinkDialog
          item={linkFor}
          onClose={() => setLinkFor(null)}
          onSaved={() => {
            setLinkFor(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusDialog({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () => api.patch(`/orders/${order.id}/status`, { status, note }),
    onSuccess: () => {
      toast('Durum güncellendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Sipariş Durumu"
      onClose={onClose}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button design="Emphasized" onClick={() => save.mutate()}>Kaydet</Button>
            </>
          }
        />
      }
    >
      <div style={{ display: 'grid', gap: '0.75rem', width: '420px', padding: '0.5rem 0' }}>
        {status === 'ONAYLANDI' && (
          <div className="mp-note">
            "Onaylandı" durumuna geçildiğinde malzeme listesi otomatik olarak mühendisliğe aktarılır.
          </div>
        )}
        <div>
          <Label showColon>Yeni durum</Label>
          <Select
            style={{ width: '100%' }}
            onChange={(e) => setStatus(e.detail.selectedOption.dataset.value as OrderStatus)}
          >
            {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
              <Option key={s} data-value={s} selected={status === s}>
                {ORDER_STATUS_LABEL[s]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Not</Label>
          <TextArea style={{ width: '100%' }} rows={2} value={note} onInput={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function ErpLinkDialog({
  item,
  onClose,
  onSaved,
}: {
  item: { id: string; description: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [query, setQuery] = useState('');
  const [erpOrderNo, setErpOrderNo] = useState('');

  const search = useQuery({
    queryKey: ['erp-search', query],
    queryFn: () =>
      api.get<{ erpOrderNo: string; erpStatus: string; customer: string | null; quantity: number }[]>(
        `/orders/erp/search?q=${encodeURIComponent(query)}`,
      ),
    enabled: query.length >= 2,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => api.post(`/orders/items/${item.id}/erp-link`, { erpOrderNo }),
    onSuccess: () => {
      toast('Üretim emri bağlandı.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Üretim Emrine Bağla"
      onClose={onClose}
      style={{ width: '620px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={!erpOrderNo}>
                Bağla
              </Button>
            </>
          }
        />
      }
    >
      <div style={{ display: 'grid', gap: '0.75rem', padding: '0.5rem 0' }}>
        <div>
          <Label showColon>Sipariş kalemi</Label>
          <div style={{ fontWeight: 600 }}>{item.description}</div>
        </div>
        <div>
          <Label showColon>Üretim emri no</Label>
          <Input
            style={{ width: '100%' }}
            placeholder="Örn: UE-2026-0001"
            value={erpOrderNo}
            onInput={(e) => setErpOrderNo(e.target.value)}
          />
        </div>
        <div>
          <Label showColon>PPM'de ara (opsiyonel)</Label>
          <Input
            style={{ width: '100%' }}
            placeholder="En az 2 karakter"
            value={query}
            onInput={(e) => setQuery(e.target.value)}
          />
        </div>
        {search.isError && (
          <MessageStrip design="Critical" hideCloseButton>
            {errorMessage(search.error)}
          </MessageStrip>
        )}
        {search.data && (
          <div className="mp-table-wrap mp-table-wrap--scroll" style={{ maxHeight: '13.75rem' }}>
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Emir No</th>
                  <th>Durum</th>
                  <th>Müşteri</th>
                  <th className="mp-num">Adet</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {search.data.map((o) => (
                  <tr key={o.erpOrderNo}>
                    <td>{o.erpOrderNo}</td>
                    <td>{ERP_STATUS_LABEL[o.erpStatus] ?? o.erpStatus}</td>
                    <td>{o.customer ?? '-'}</td>
                    <td className="mp-num">{o.quantity}</td>
                    <td>
                      <Button design="Transparent" onClick={() => setErpOrderNo(o.erpOrderNo)}>
                        Seç
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
