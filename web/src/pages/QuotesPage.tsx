import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  Button,
  BusyIndicator,
  Dialog,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
  TextArea,
} from '@ui5/webcomponents-react';
import { ApiError, api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useNotify } from '../components/NotificationProvider.js';
import { useConfirm } from '../components/confirm.js';
import { DataToolbar } from '../components/DataToolbar.js';
import {
  DateInput,
  EmptyRow,
  Field,
  FieldGrid,
  KpiTile,
  MarginBadge,
  PageHeader,
  QuoteStatusBadge,
  Section,
  QUOTE_STATUS_LABEL,
  formatDate,
  formatMoney,
  formatNumber,
  formatPct,
  revisionLabel,
  daysFromToday,
  num,
  PageSkeleton,
  TableSkeleton,
} from '../components/ui.js';
import { downloadQuotePdf } from '../pdf/quotePdf.js';
import type {
  ConfigureResult,
  Customer,
  Opportunity,
  Product,
  Quote,
  QuoteStatus,
} from '../api/types.js';

export default function QuotesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['quotes', search],
    queryFn: () => api.get<Quote[]>(`/quotes${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  if (selected) return <QuoteDetail id={selected} onBack={() => setSelected(null)} />;

  const pending = (list.data ?? []).filter((q) => q.status === 'ONAY_BEKLIYOR').length;

  return (
    <div className="mp-page">
      <PageHeader
        title="Teklifler (CPQ)"
        subtitle="Yapılandırma, dinamik fiyatlandırma ve revizyon yönetimi"
      />

      {pending > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <MessageStrip design="Critical" hideCloseButton>
            {pending} teklif marj/iskonto limiti aşıldığı için onay bekliyor.
          </MessageStrip>
        </div>
      )}

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setCreating(true)}
        createLabel="Yeni Teklif"
        canCreate={can('TEKLIFLER', 'create')}
        count={list.data?.length}
      />

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow
          icon="sales-quote"
          text={search ? 'Aramanızla eşleşen teklif yok.' : 'Henüz teklif oluşturulmamış.'}
          hint={
            search
              ? 'Teklif no, başlık veya müşteri adına göre arayabilirsiniz.'
              : 'Bir müşteri ve fırsat seçip konfigüratörden ürün ekleyerek ilk teklifi hazırlayın.'
          }
          action={
            !search && can('TEKLIFLER', 'create') ? (
              <Button design="Emphasized" icon="add" onClick={() => setCreating(true)}>
                Yeni Teklif
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Teklif No</th>
                <th>Rev.</th>
                <th>Başlık</th>
                <th>Müşteri</th>
                <th>Durum</th>
                <th className="mp-num">Kalem</th>
                <th className="mp-num">İskonto</th>
                <th className="mp-num">Tutar</th>
                <th className="mp-num">Marj</th>
                <th>Geçerlilik</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((q) => (
                <tr key={q.id}>
                  <td>{q.quoteNo}</td>
                  <td>{revisionLabel(q.revision)}</td>
                  <td>
                    <strong>{q.title}</strong>
                  </td>
                  <td>{q.customer?.name}</td>
                  <td>
                    <QuoteStatusBadge status={q.status} />
                  </td>
                  <td className="mp-num">{q._count?.items ?? 0}</td>
                  <td className="mp-num">{formatPct(q.discountPct)}</td>
                  <td className="mp-num">{formatMoney(q.totalPrice, q.currency)}</td>
                  <td className="mp-num">
                    <MarginBadge value={q.marginPct} />
                  </td>
                  <td>{formatDate(q.validUntil)}</td>
                  <td>
                    <Button design="Transparent" icon="detail-view" onClick={() => setSelected(q.id)}>
                      Aç
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <QuoteDialog
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            list.refetch();
            setSelected(id);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teklif detayı
// ---------------------------------------------------------------------------

function QuoteDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast, error: showError } = useNotify();
  const { confirm, confirmDialog } = useConfirm();
  const [configOpen, setConfigOpen] = useState(false);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [current, setCurrent] = useState(id);

  const { data, isLoading } = useQuery({
    queryKey: ['quote', current],
    queryFn: () => api.get<Quote>(`/quotes/${current}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['quote', current] });

  const setStatus = useMutation({
    mutationFn: (status: QuoteStatus) => api.patch<{ quote: Quote; message?: string }>(`/quotes/${current}/status`, { status }),
    onSuccess: (res) => {
      toast(res.message ?? 'Durum güncellendi.');
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const approve = useMutation({
    mutationFn: () => api.post(`/quotes/${current}/approve`),
    onSuccess: () => {
      toast('Teklif onaylandı ve gönderildi.');
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const reprice = useMutation({
    mutationFn: () => api.post(`/quotes/${current}/reprice`),
    onSuccess: () => {
      toast('Maliyetler güncel hammadde fiyatlarıyla yeniden hesaplandı.');
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const convert = useMutation({
    mutationFn: () => api.post<{ orderNo: string }>(`/quotes/${current}/convert-to-order`),
    onSuccess: (order) => {
      toast(`${order.orderNo} numaralı sipariş oluşturuldu.`);
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.delete(`/quotes/items/${itemId}`),
    onSuccess: () => {
      toast('Kalem silindi.');
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton kpis={7} rows={5} />
    );
  }

  const locked = data.status === 'KABUL_EDILDI' || data.status === 'REVIZE_EDILDI';
  const minMargin = data.policy?.minMarginPct ?? 15;

  return (
    <div className="mp-page">
      <PageHeader
        title={`${data.quoteNo} · ${revisionLabel(data.revision)}`}
        subtitle={`${data.title} — ${data.customer?.name ?? ''}`}
        actions={
          <>
            <Button design="Transparent" icon="pdf-attachment" onClick={() => downloadQuotePdf(data)}>
              PDF indir
            </Button>
            {can('TEKLIFLER', 'edit') && !locked && (
              <Button design="Transparent" icon="refresh" onClick={() => reprice.mutate()}>
                Fiyatları güncelle
              </Button>
            )}
            {can('TEKLIFLER', 'create') && (
              <Button design="Transparent" icon="duplicate" onClick={() => setReviseOpen(true)}>
                Yeni revizyon
              </Button>
            )}
            {can('TEKLIFLER', 'approve') && data.status === 'ONAY_BEKLIYOR' && (
              <Button design="Emphasized" icon="accept" onClick={() => approve.mutate()}>
                Onayla ve gönder
              </Button>
            )}
            {can('TEKLIFLER', 'approve') && data.status === 'KABUL_EDILDI' && (
              <Button design="Emphasized" icon="sales-order" onClick={() => convert.mutate()}>
                Siparişe dönüştür
              </Button>
            )}
            <Button design="Transparent" icon="nav-back" onClick={onBack}>
              Listeye dön
            </Button>
          </>
        }
      />

      {data.status === 'ONAY_BEKLIYOR' && data.approvalNote && (
        <div className="mp-note mp-note--warning">
          <strong>Onay gerekiyor:</strong> {data.approvalNote}
        </div>
      )}
      {data.revisionNote && (
        <div className="mp-note">
          <strong>{revisionLabel(data.revision)} gerekçesi:</strong> {data.revisionNote}
        </div>
      )}

      <div className="mp-kpis">
        <KpiTile label="Durum" value={<QuoteStatusBadge status={data.status} />} tone="info" />
        <KpiTile label="Ara Toplam" value={formatMoney(data.subtotal, data.currency)} tone="info" />
        <KpiTile
          label="İskonto"
          value={formatPct(data.discountPct)}
          tone={data.discountPct > (user?.maxDiscountPct ?? 5) ? 'warning' : 'info'}
          hint={formatMoney(data.discountAmount, data.currency)}
        />
        <KpiTile label="Toplam Maliyet" value={formatMoney(data.totalCost, data.currency)} tone="warning" />
        <KpiTile label="Müşteri Tutarı" value={formatMoney(data.totalPrice, data.currency)} tone="good" />
        <KpiTile
          label="Kâr Marjı"
          value={<MarginBadge value={data.marginPct} min={minMargin} />}
          tone={data.marginPct < minMargin ? 'critical' : 'good'}
          hint={`Asgari: %${minMargin}`}
        />
        <KpiTile label="Termin" value={`${data.leadTimeDays ?? 0} gün`} tone="info" />
      </div>

      {/* Revizyon zinciri - eski teklifler silinmez, buradan gezilir. */}
      {data.chain && data.chain.length > 1 && (
        <Section title="Revizyon zinciri">
          <div className="mp-revchain">
            {data.chain.map((rev) => (
              <button
                key={rev.id}
                type="button"
                className={`mp-rev${rev.id === current ? ' mp-rev--current' : ''}`}
                aria-current={rev.id === current ? 'true' : undefined}
                onClick={() => setCurrent(rev.id)}
              >
                <span className="mp-rev__label">{rev.revisionLabel}</span>
                <span className="mp-rev__meta">
                  {QUOTE_STATUS_LABEL[rev.status]}
                  <br />
                  {formatMoney(rev.totalPrice)}
                  <br />
                  marj %{rev.marginPct.toFixed(1)}
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Teklif kalemleri"
        actions={
          can('TEKLIFLER', 'edit') &&
          !locked && (
            <Button design="Emphasized" icon="add" onClick={() => setConfigOpen(true)}>
              Kalem ekle (konfigüratör)
            </Button>
          )
        }
      >
        {!data.items?.length ? (
          <EmptyRow
            icon="product"
            text="Kalem eklenmemiş"
            hint="Konfigüratörden ürün seçtiğinizde maliyet, kâr marjı ve termin anında hesaplanır."
            action={
              can('TEKLIFLER', 'edit') && !locked ? (
                <Button design="Emphasized" icon="add" onClick={() => setConfigOpen(true)}>
                  Kalem ekle (konfigüratör)
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Ürün / Açıklama</th>
                  <th>Konfigürasyon</th>
                  <th className="mp-num">Miktar</th>
                  <th className="mp-num">Birim maliyet</th>
                  <th className="mp-num">Birim fiyat</th>
                  <th className="mp-num">İsk.</th>
                  <th className="mp-num">Satır tutarı</th>
                  <th className="mp-num">Marj</th>
                  <th className="mp-num">Termin</th>
                  {can('TEKLIFLER', 'edit') && !locked && <th />}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.description}</strong>
                      {item.product && <div className="mp-person__title">{item.product.code}</div>}
                    </td>
                    <td style={{ maxWidth: '260px' }}>
                      {item.options?.length
                        ? item.options.map((o) => o.option.name).join(', ')
                        : '-'}
                    </td>
                    <td className="mp-num">
                      {formatNumber(item.quantity)} {item.unit}
                    </td>
                    <td className="mp-num">{formatMoney(item.unitCost, data.currency)}</td>
                    <td className="mp-num">{formatMoney(item.unitPrice, data.currency)}</td>
                    <td className="mp-num">{formatPct(item.discountPct, 0)}</td>
                    <td className="mp-num">{formatMoney(item.lineTotal, data.currency)}</td>
                    <td className="mp-num">
                      <MarginBadge value={item.marginPct} min={minMargin} />
                    </td>
                    <td className="mp-num">{item.leadTimeDays} gün</td>
                    {can('TEKLIFLER', 'edit') && !locked && (
                      <td>
                        <Button
                          design="Transparent"
                          icon="delete"
                          tooltip="Kalemi sil"
                          accessibleName={`${item.description} kalemini sil`}
                          onClick={() =>
                            confirm({
                              title: 'Kalemi sil',
                              text: `"${item.description}" teklif kaleminden çıkarılacak ve teklif toplamları yeniden hesaplanacak.`,
                              onConfirm: () => removeItem.mutate(item.id),
                            })
                          }
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="mp-table__foot">
                <tr>
                  <td colSpan={6}>Ara toplam</td>
                  <td className="mp-num">{formatMoney(data.subtotal, data.currency)}</td>
                  <td colSpan={can('TEKLIFLER', 'edit') && !locked ? 3 : 2} />
                </tr>
                <tr>
                  <td colSpan={6}>Genel iskonto ({formatPct(data.discountPct)})</td>
                  <td className="mp-num">-{formatMoney(data.discountAmount, data.currency)}</td>
                  <td colSpan={can('TEKLIFLER', 'edit') && !locked ? 3 : 2} />
                </tr>
                <tr>
                  <td colSpan={6}>Genel toplam</td>
                  <td className="mp-num">{formatMoney(data.totalPrice, data.currency)}</td>
                  <td colSpan={can('TEKLIFLER', 'edit') && !locked ? 3 : 2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>

      <div className="mp-split">
        <div>
          {/* Malzeme listesi - sipariş onaylanınca mühendisliğe bu liste akar. */}
          <Section title="Malzeme listesi (BOM)">
            <div className="mp-note">
              Teklif aşamasında oluşan bu liste, sipariş onaylandığında mühendisliğe aktarılır.
            </div>
            {!data.items?.some((i) => i.bomLines?.length) ? (
              <EmptyRow text="BOM satırı yok." />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Kalem</th>
                      <th>Malzeme</th>
                      <th className="mp-num">Miktar</th>
                      <th className="mp-num">Birim maliyet</th>
                      <th className="mp-num">Fire</th>
                      <th>Rev.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items?.flatMap((item) =>
                      (item.bomLines ?? []).map((b) => (
                        <tr key={b.id}>
                          <td>{item.description}</td>
                          <td>
                            {b.description}
                            {b.material && <span className="mp-option__delta"> ({b.material.code})</span>}
                          </td>
                          <td className="mp-num">
                            {formatNumber(b.quantity, 1)} {b.unit}
                          </td>
                          <td className="mp-num">{formatMoney(b.unitCost, data.currency)}</td>
                          <td className="mp-num">{formatPct(b.scrapPct, 0)}</td>
                          <td>{b.revision}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="İşçilik ve mühendislik eforu">
            {!data.items?.some((i) => i.laborLines?.length) ? (
              <EmptyRow text="İşçilik satırı yok." />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Kalem</th>
                      <th>Tür</th>
                      <th className="mp-num">Saat</th>
                      <th className="mp-num">Saatlik ücret</th>
                      <th className="mp-num">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items?.flatMap((item) =>
                      (item.laborLines ?? []).map((l) => (
                        <tr key={l.id}>
                          <td>{item.description}</td>
                          <td>{l.description ?? l.rate?.name ?? '-'}</td>
                          <td className="mp-num">{formatNumber(l.hours, 1)}</td>
                          <td className="mp-num">{formatMoney(l.hourlyRate, data.currency)}</td>
                          <td className="mp-num">{formatMoney(l.lineCost, data.currency)}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div>
          <Section title="Teklif bilgileri">
            <FieldGrid>
              <Field label="Müşteri" value={data.customer?.name} />
              <Field label="Fırsat" value={data.opportunity?.title} />
              <Field label="Fiyat politikası" value={data.policy?.name} />
              <Field label="Düzenleme" value={formatDate(data.issuedAt)} />
              <Field label="Geçerlilik" value={formatDate(data.validUntil)} />
              <Field label="Gönderim" value={formatDate(data.sentAt)} />
              <Field label="Ödeme koşulu" value={data.paymentTerms} />
              <Field label="Teslim koşulu" value={data.deliveryTerms} />
              <Field label="Hazırlayan" value={data.createdBy?.fullName} />
              <Field label="Onaylayan" value={data.approvedBy?.fullName} />
            </FieldGrid>
            {data.notes && (
              <>
                <div className="mp-field__label" style={{ marginTop: '0.75rem' }}>Notlar</div>
                <div className="mp-field__value">{data.notes}</div>
              </>
            )}
          </Section>

          {can('TEKLIFLER', 'edit') && (
            <Section title="Durum akışı">
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {data.status === 'TASLAK' && (
                  <Button design="Emphasized" icon="email" onClick={() => setStatus.mutate('GONDERILDI')}>
                    Müşteriye gönder
                  </Button>
                )}
                {(data.status === 'GONDERILDI' || data.status === 'PAZARLIK') && (
                  <>
                    <Button design="Transparent" icon="discussion" onClick={() => setStatus.mutate('PAZARLIK')}>
                      Pazarlık aşamasına al
                    </Button>
                    <Button design="Emphasized" icon="accept" onClick={() => setStatus.mutate('KABUL_EDILDI')}>
                      Kabul edildi
                    </Button>
                    <Button design="Negative" icon="decline" onClick={() => setStatus.mutate('REDDEDILDI')}>
                      Reddedildi
                    </Button>
                  </>
                )}
                {locked && (
                  <div className="mp-note">
                    Bu teklif kilitli. Değişiklik için yeni revizyon oluşturun.
                  </div>
                )}
              </div>
            </Section>
          )}
        </div>
      </div>

      {configOpen && (
        <ConfiguratorDialog
          quoteId={current}
          onClose={() => setConfigOpen(false)}
          onSaved={() => {
            setConfigOpen(false);
            refresh();
          }}
        />
      )}

      {confirmDialog}

      {reviseOpen && (
        <ReviseDialog
          quoteId={current}
          onClose={() => setReviseOpen(false)}
          onSaved={(newId) => {
            setReviseOpen(false);
            setCurrent(newId);
            queryClient.invalidateQueries({ queryKey: ['quotes'] });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Konfigüratör - kısıtlama denetimi + canlı maliyet
// ---------------------------------------------------------------------------

function ConfiguratorDialog({
  quoteId,
  onClose,
  onSaved,
}: {
  quoteId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [productId, setProductId] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [discountPct, setDiscountPct] = useState(0);
  const [acceptWarnings, setAcceptWarnings] = useState(false);

  const products = useQuery({
    queryKey: ['products-lookup'],
    queryFn: () => api.get<Product[]>('/catalog/products?active=true'),
  });

  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: () => api.get<Product>(`/catalog/products/${productId}`),
    enabled: Boolean(productId),
  });

  // Ürün seçilince varsayılan seçenekleri işaretle ve açıklamayı doldur.
  useEffect(() => {
    if (!product.data) return;
    const defaults = (product.data.optionGroups ?? [])
      .flatMap((g) => g.options)
      .filter((o) => o.isDefault)
      .map((o) => o.code);
    setSelectedOptions(defaults);
    setDescription(product.data.name);
    setAcceptWarnings(false);
  }, [product.data]);

  // Her seçim değişiminde sunucudaki CPQ motoru yeniden çalıştırılır.
  const configure = useQuery({
    queryKey: ['configure', productId, selectedOptions.join(','), quantity],
    queryFn: () =>
      api.post<ConfigureResult>(`/catalog/products/${productId}/configure`, {
        selectedOptions,
        quantity: Number(quantity) || 1,
      }),
    enabled: Boolean(productId),
  });

  const save = useMutation({
    mutationFn: () =>
      api.post(`/quotes/${quoteId}/items`, {
        productId,
        description,
        quantity: Number(quantity) || 1,
        selectedOptions,
        unitPrice: unitPrice === '' ? null : num(unitPrice),
        discountPct: Number(discountPct) || 0,
        acceptWarnings,
      }),
    onSuccess: () => {
      toast('Kalem eklendi.');
      onSaved();
    },
    onError: (err) => {
      // 409 + requiresAcknowledgement: riskli kombinasyon, onay istenir.
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { requiresAcknowledgement?: boolean } | undefined;
        if (body?.requiresAcknowledgement) {
          setAcceptWarnings(true);
          showError('Riskli kombinasyon. Uyarıları okuyup "Uyarıları kabul et" ile tekrar deneyin.');
          return;
        }
      }
      showError(errorMessage(err));
    },
  });

  function toggleOption(code: string, groupCode: string, isMultiple: boolean) {
    setSelectedOptions((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (isMultiple) return [...prev, code];
      // Tekli grupta aynı gruptaki diğer seçim kaldırılır.
      const group = product.data?.optionGroups?.find((g) => g.code === groupCode);
      const siblings = new Set((group?.options ?? []).map((o) => o.code));
      return [...prev.filter((c) => !siblings.has(c)), code];
    });
  }

  const validation = configure.data?.validation;
  const cost = configure.data?.cost;
  const effectivePrice = unitPrice === '' ? (cost?.suggestedUnitPrice ?? 0) : num(unitPrice);
  const lineTotal = effectivePrice * (Number(quantity) || 1) * (1 - (Number(discountPct) || 0) / 100);
  const lineCost = (cost?.unitCost ?? 0) * (Number(quantity) || 1);
  const margin = lineTotal > 0 ? ((lineTotal - lineCost) / lineTotal) * 100 : 0;

  /** Bir seçeneğin seçilmesi engelleyici kural tetikliyor mu (ön uyarı için). */
  const blockedCodes = useMemo(() => {
    const set = new Set<string>();
    for (const rule of product.data?.rules ?? []) {
      if (!rule.isActive || rule.severity !== 'ENGELLE') continue;
      if (rule.type !== 'ENGELLER') continue;
      // "when" tarafı tam seçiliyse "then" tarafındaki seçenekler seçilemez.
      if (rule.whenOptions.every((c) => selectedOptions.includes(c))) {
        rule.thenOptions.forEach((c) => set.add(c));
      }
      // Simetrik: "then" seçiliyse "when" tarafı da engellenir.
      if (rule.thenOptions.some((c) => selectedOptions.includes(c))) {
        rule.whenOptions.forEach((c) => set.add(c));
      }
    }
    selectedOptions.forEach((c) => set.delete(c));
    return set;
  }, [product.data, selectedOptions]);

  return (
    <Dialog
      open
      headerText="Ürün Yapılandırma ve Fiyatlandırma"
      onClose={onClose}
      style={{ width: '1080px', maxWidth: '96vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>
                Vazgeç
              </Button>
              {validation?.warnings.length ? (
                <Button
                  design={acceptWarnings ? 'Positive' : 'Attention'}
                  icon={acceptWarnings ? 'accept' : 'alert'}
                  onClick={() => setAcceptWarnings((v) => !v)}
                >
                  {acceptWarnings ? 'Uyarılar kabul edildi' : 'Uyarıları kabul et'}
                </Button>
              ) : null}
              <Button
                design="Emphasized"
                onClick={() => save.mutate()}
                disabled={
                  !productId ||
                  !validation?.valid ||
                  (Boolean(validation?.warnings.length) && !acceptWarnings)
                }
              >
                Teklife ekle
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-config" style={{ padding: '0.5rem 0' }}>
        <div>
          <div className="mp-form" style={{ marginBottom: '0.875rem' }}>
            <div className="mp-form__full">
              <Label required showColon>
                Ürün
              </Label>
              <Select
                style={{ width: '100%' }}
                onChange={(e) => setProductId(e.detail.selectedOption.dataset.value as string)}
              >
                <Option data-value="" selected={!productId}>
                  (seçiniz)
                </Option>
                {(products.data ?? []).map((p) => (
                  <Option key={p.id} data-value={p.id} selected={productId === p.id}>
                    {p.code} - {p.name}
                  </Option>
                ))}
              </Select>
            </div>
          </div>

          {product.isLoading && <BusyIndicator active size="S" text="Konfigüratör yükleniyor..." />}

          {product.data?.optionGroups?.map((group) => (
            <div key={group.id} className="mp-optgroup">
              <div className="mp-optgroup__head">
                <span className="mp-optgroup__name">{group.name}</span>
                {group.isRequired && <span className="mp-optgroup__req">zorunlu</span>}
                {group.isMultiple && <span className="mp-option__delta">(çoklu seçim)</span>}
              </div>
              {group.helpText && <div className="mp-optgroup__help">{group.helpText}</div>}
              <div className="mp-options">
                {group.options
                  .filter((o) => o.isActive)
                  .map((option) => {
                    const selected = selectedOptions.includes(option.code);
                    const blocked = blockedCodes.has(option.code);
                    const toggle = () => toggleOption(option.code, group.code, group.isMultiple);
                    return (
                      // Tıklanabilir kart, klavyeyle de kullanılabilmesi için
                      // onay kutusu rolü ve tuş desteği taşır.
                      <div
                        key={option.id}
                        className={`mp-option${selected ? ' mp-option--selected' : ''}${blocked ? ' mp-option--blocked' : ''}`}
                        role="checkbox"
                        aria-checked={selected}
                        tabIndex={0}
                        onClick={toggle}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                        title={blocked ? 'Mevcut seçimlerle birlikte üretilemez.' : option.description ?? ''}
                      >
                        <input
                          type="checkbox"
                          className="mp-option__box"
                          checked={selected}
                          readOnly
                          tabIndex={-1}
                          aria-hidden="true"
                        />
                        <span>
                          <span className="mp-option__name">{option.name}</span>
                          <br />
                          <span className="mp-option__delta">
                            {option.costDelta !== 0 &&
                              `maliyet ${option.costDelta > 0 ? '+' : ''}${formatMoney(option.costDelta)}`}
                            {option.leadTimeDelta !== 0 && ` · +${option.leadTimeDelta} gün`}
                            {blocked && ' · engellendi'}
                          </span>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}

          {validation?.blocking.map((v) => (
            <div key={v.ruleCode} className="mp-note mp-note--critical">
              <strong>Üretilemez ({v.ruleCode}):</strong> {v.message}
            </div>
          ))}
          {validation?.warnings.map((v) => (
            <div key={v.ruleCode} className="mp-note mp-note--warning">
              <strong>Dikkat ({v.ruleCode}):</strong> {v.message}
            </div>
          ))}

          {productId && (
            <div className="mp-form" style={{ marginTop: '0.875rem' }}>
              <div className="mp-form__full">
                <Label showColon>Kalem açıklaması</Label>
                <Input
                  style={{ width: '100%' }}
                  value={description}
                  onInput={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <Label showColon>Miktar</Label>
                <Input
                  type="Number"
                  style={{ width: '100%' }}
                  value={String(quantity)}
                  onInput={(e) => setQuantity(Number(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label showColon>Birim fiyat (boş = önerilen)</Label>
                <Input
                  type="Number"
                  style={{ width: '100%' }}
                  placeholder={String(cost?.suggestedUnitPrice ?? '')}
                  value={unitPrice}
                  onInput={(e) => setUnitPrice(e.target.value)}
                />
              </div>
              <div>
                <Label showColon>Kalem iskontosu (%)</Label>
                <Input
                  type="Number"
                  style={{ width: '100%' }}
                  value={String(discountPct)}
                  onInput={(e) => setDiscountPct(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Canlı maliyet dökümü - satışçı marjı anında görür. */}
        <div className="mp-card">
          <h4 className="mp-section__title" style={{ marginBottom: '0.5rem' }}>
            Maliyet dökümü
          </h4>
          {!cost ? (
            <EmptyRow text="Ürün seçin." />
          ) : (
            <div className="mp-cost">
              <div className="mp-cost__row">
                <span className="mp-cost__label">Temel maliyet</span>
                <span className="mp-cost__value">{formatMoney(cost.baseCost)}</span>
              </div>
              <div className="mp-cost__row">
                <span className="mp-cost__label">Hammadde (fire dahil)</span>
                <span className="mp-cost__value">{formatMoney(cost.materialCost)}</span>
              </div>
              <div className="mp-cost__row">
                <span className="mp-cost__label">İşçilik</span>
                <span className="mp-cost__value">{formatMoney(cost.laborCost)}</span>
              </div>
              <div className="mp-cost__row">
                <span className="mp-cost__label">Mühendislik eforu</span>
                <span className="mp-cost__value">{formatMoney(cost.engineeringCost)}</span>
              </div>
              <div className="mp-cost__row">
                <span className="mp-cost__label">Seçenek etkisi</span>
                <span className="mp-cost__value">{formatMoney(cost.optionCost)}</span>
              </div>
              <div className="mp-cost__row mp-cost__row--sub">
                <span className="mp-cost__label">Doğrudan maliyet</span>
                <span className="mp-cost__value">{formatMoney(cost.directCost)}</span>
              </div>
              <div className="mp-cost__row">
                <span className="mp-cost__label">Genel gider</span>
                <span className="mp-cost__value">{formatMoney(cost.overhead)}</span>
              </div>
              <div className="mp-cost__row">
                <span className="mp-cost__label">Mühendislik yükü</span>
                <span className="mp-cost__value">{formatMoney(cost.engineeringLoad)}</span>
              </div>
              <div className="mp-cost__row">
                <span className="mp-cost__label">Risk payı</span>
                <span className="mp-cost__value">{formatMoney(cost.contingency)}</span>
              </div>
              <div className="mp-cost__row mp-cost__row--sub">
                <span className="mp-cost__label">Birim maliyet</span>
                <span className="mp-cost__value">{formatMoney(cost.unitCost)}</span>
              </div>
              <div className="mp-cost__row">
                <span className="mp-cost__label">Önerilen birim fiyat</span>
                <span className="mp-cost__value">{formatMoney(cost.suggestedUnitPrice)}</span>
              </div>
              <div className="mp-cost__row mp-cost__row--total">
                <span className="mp-cost__label">Satır tutarı</span>
                <span className="mp-cost__value">{formatMoney(lineTotal)}</span>
              </div>
              <div className="mp-cost__row">
                <span className="mp-cost__label">Kâr marjı</span>
                <span className="mp-cost__value">
                  <MarginBadge value={margin} min={configure.data?.policy.minMarginPct ?? 15} />
                </span>
              </div>
              <div className="mp-cost__row">
                <span className="mp-cost__label">Termin</span>
                <span className="mp-cost__value">{cost.leadTimeDays} gün</span>
              </div>
              <div className="mp-person__title" style={{ marginTop: '0.5rem' }}>
                Politika: {configure.data?.policy.name} (asgari marj %
                {configure.data?.policy.minMarginPct})
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function ReviseDialog({
  quoteId,
  onClose,
  onSaved,
}: {
  quoteId: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { toast, error: showError } = useNotify();
  const [revisionNote, setNote] = useState('');

  const save = useMutation({
    mutationFn: () => api.post<Quote>(`/quotes/${quoteId}/revise`, { revisionNote }),
    onSuccess: (q) => {
      toast(`${revisionLabel(q.revision)} oluşturuldu.`);
      onSaved(q.id);
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Yeni Revizyon Oluştur"
      onClose={onClose}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button design="Emphasized" onClick={() => save.mutate()}>Oluştur</Button>
            </>
          }
        />
      }
    >
      <div style={{ display: 'grid', gap: '0.75rem', width: '460px', padding: '0.5rem 0' }}>
        <div className="mp-note">
          Mevcut teklif silinmez; "Revize Edildi" olarak arşivde kalır ve tüm kalemleri yeni
          revizyona kopyalanır.
        </div>
        <div>
          <Label showColon>Revizyon gerekçesi</Label>
          <TextArea
            style={{ width: '100%' }}
            rows={3}
            placeholder="Örn: Müşteri kurutma bölümü eklenmesini istedi."
            value={revisionNote}
            onInput={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

function QuoteDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    customerId: '',
    opportunityId: '',
    title: '',
    validUntil: daysFromToday(30),
    discountPct: 0,
    notes: '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const customers = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: () => api.get<Customer[]>('/customers?active=true'),
  });

  const opportunities = useQuery({
    queryKey: ['opportunities-lookup', form.customerId],
    queryFn: () => api.get<Opportunity[]>('/opportunities?open=true'),
    enabled: Boolean(form.customerId),
  });

  const save = useMutation({
    mutationFn: () =>
      api.post<Quote>('/quotes', {
        ...form,
        opportunityId: form.opportunityId || null,
        discountPct: Number(form.discountPct) || 0,
        validUntil: form.validUntil || null,
      }),
    onSuccess: (q) => {
      toast(`${q.quoteNo} oluşturuldu.`);
      onSaved(q.id);
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const forCustomer = (opportunities.data ?? []).filter((o) => o.customerId === form.customerId);

  return (
    <Dialog
      open
      headerText="Yeni Teklif"
      onClose={onClose}
      style={{ width: '640px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button
                design="Emphasized"
                onClick={() => save.mutate()}
                disabled={!form.customerId || form.title.length < 2}
              >
                Oluştur
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div className="mp-form__full">
          <Label required showColon>Müşteri</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('customerId', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.customerId}>(seçiniz)</Option>
            {(customers.data ?? []).map((c) => (
              <Option key={c.id} data-value={c.id} selected={form.customerId === c.id}>
                {c.name}
              </Option>
            ))}
          </Select>
        </div>
        <div className="mp-form__full">
          <Label showColon>Fırsat (opsiyonel)</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('opportunityId', e.detail.selectedOption.dataset.value)}>
            <Option data-value="" selected={!form.opportunityId}>(bağlı değil)</Option>
            {forCustomer.map((o) => (
              <Option key={o.id} data-value={o.id} selected={form.opportunityId === o.id}>
                {o.code} - {o.title}
              </Option>
            ))}
          </Select>
        </div>
        <div className="mp-form__full">
          <Label required showColon>Teklif başlığı</Label>
          <Input style={{ width: '100%' }} value={form.title} onInput={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <Label showColon>Geçerlilik tarihi</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.validUntil}
            onChange={(v) => set('validUntil', v)}
          />
        </div>
        <div>
          <Label showColon>Genel iskonto (%)</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.discountPct)}
            onInput={(e) => set('discountPct', e.target.value)}
          />
          <div className="mp-person__title">Boş bırakılırsa müşterinin sözleşmeli iskontosu uygulanır.</div>
        </div>
        <div className="mp-form__full">
          <Label showColon>Notlar</Label>
          <TextArea style={{ width: '100%' }} rows={3} value={form.notes} onInput={(e) => set('notes', e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}
