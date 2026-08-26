import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  Button,
  CheckBox,
  Dialog,
  Input,
  Label,
  Option,
  Select,
  TextArea,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useNotify } from '../components/NotificationProvider.js';
import { useConfirm } from '../components/confirm.js';
import { DataToolbar } from '../components/DataToolbar.js';
import {
  EmptyRow,
  Field,
  FieldGrid,
  PageHeader,
  Section,
  RULE_SEVERITY_LABEL,
  RULE_TYPE_LABEL,
  formatMoney,
  formatNumber,
  PageSkeleton,
  TableSkeleton,
} from '../components/ui.js';
import type { Product, RuleSeverity, RuleType } from '../api/types.js';

export default function CatalogPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['products', search],
    queryFn: () =>
      api.get<Product[]>(`/catalog/products${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  if (selected) return <ProductDetail id={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="mp-page">
      <PageHeader
        title="Ürün Kataloğu"
        subtitle="Konfigüre edilebilir ürünler, seçenek grupları ve mühendislik kısıtlama kuralları"
      />

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setCreating(true)}
        createLabel="Yeni Ürün"
        canCreate={can('URUN_KATALOGU', 'create')}
        count={list.data?.length}
      />

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow
          icon="product"
          text={search ? 'Aramanızla eşleşen ürün yok.' : 'Ürün kataloğu boş.'}
          hint={
            search
              ? 'Ürün kodu, adı veya ürün ailesine göre arayabilirsiniz.'
              : 'Konfigüre edilebilir ürünleri tanımlayın; seçenek grupları ve kısıtlama kuralları tekliflere buradan akar.'
          }
          action={
            !search && can('URUN_KATALOGU', 'create') ? (
              <Button design="Emphasized" icon="add" onClick={() => setCreating(true)}>
                Yeni Ürün
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Ürün</th>
                <th>Aile</th>
                <th className="mp-num">Temel maliyet</th>
                <th className="mp-num">Termin</th>
                <th className="mp-num">Seçenek grubu</th>
                <th className="mp-num">Kural</th>
                <th>Durum</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id}>
                  <td>{p.code}</td>
                  <td>
                    <strong>{p.name}</strong>
                    {p.description && <div className="mp-person__title">{p.description}</div>}
                  </td>
                  <td>{p.family ?? '-'}</td>
                  <td className="mp-num">{formatMoney(p.baseCost)}</td>
                  <td className="mp-num">{p.leadTimeDays} gün</td>
                  <td className="mp-num">{p._count?.optionGroups ?? 0}</td>
                  <td className="mp-num">{p._count?.rules ?? 0}</td>
                  <td>{p.isActive ? 'Aktif' : 'Pasif'}</td>
                  <td>
                    <Button design="Transparent" icon="detail-view" onClick={() => setSelected(p.id)}>
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
        <ProductDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.refetch();
          }}
        />
      )}
    </div>
  );
}

function ProductDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { toast, error: showError } = useNotify();
  const { confirm, confirmDialog } = useConfirm();
  const [ruleOpen, setRuleOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<Product>(`/catalog/products/${id}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['product', id] });

  const removeRule = useMutation({
    mutationFn: (ruleId: string) => api.delete(`/catalog/rules/${ruleId}`),
    onSuccess: () => {
      toast('Kural silindi.');
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton kpis={0} rows={8} />
    );
  }

  const allOptions = (data.optionGroups ?? []).flatMap((g) =>
    g.options.map((o) => ({ ...o, groupName: g.name })),
  );

  return (
    <div className="mp-page">
      <PageHeader
        title={data.name}
        subtitle={`${data.code}${data.family ? ` · ${data.family}` : ''}`}
        actions={
          <Button design="Transparent" icon="nav-back" onClick={onBack}>
            Listeye dön
          </Button>
        }
      />

      <Section title="Ürün bilgileri">
        <FieldGrid>
          <Field label="Kod" value={data.code} />
          <Field label="Aile" value={data.family} />
          <Field label="Birim" value={data.unit} />
          <Field label="Temel maliyet" value={formatMoney(data.baseCost)} />
          <Field label="Liste fiyatı" value={data.listPrice ? formatMoney(data.listPrice) : '-'} />
          <Field label="Standart termin" value={`${data.leadTimeDays} gün`} />
          <Field label="Konfigüre edilebilir" value={data.isConfigurable ? 'Evet' : 'Hayır'} />
          <Field label="Durum" value={data.isActive ? 'Aktif' : 'Pasif'} />
        </FieldGrid>
        {data.description && (
          <>
            <div className="mp-field__label" style={{ marginTop: '0.75rem' }}>Açıklama</div>
            <div className="mp-field__value">{data.description}</div>
          </>
        )}
      </Section>

      <Section title="Seçenek grupları">
        {!data.optionGroups?.length ? (
          <EmptyRow text="Seçenek grubu tanımlanmamış." />
        ) : (
          data.optionGroups.map((g) => (
            <div key={g.id} className="mp-optgroup">
              <div className="mp-optgroup__head">
                <span className="mp-optgroup__name">
                  {g.name} <span className="mp-option__delta">({g.code})</span>
                </span>
                {g.isRequired && <span className="mp-optgroup__req">zorunlu</span>}
                {g.isMultiple && <span className="mp-option__delta">çoklu seçim</span>}
              </div>
              {g.helpText && <div className="mp-optgroup__help">{g.helpText}</div>}
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Kod</th>
                      <th>Seçenek</th>
                      <th className="mp-num">Maliyet etkisi</th>
                      <th className="mp-num">Fiyat etkisi</th>
                      <th className="mp-num">Termin etkisi</th>
                      <th className="mp-num">Ek işçilik</th>
                      <th>Varsayılan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.options.map((o) => (
                      <tr key={o.id} style={{ opacity: o.isActive ? 1 : 0.5 }}>
                        <td>{o.code}</td>
                        <td>
                          <strong>{o.name}</strong>
                          {o.description && <div className="mp-person__title">{o.description}</div>}
                        </td>
                        <td className="mp-num">{formatMoney(o.costDelta)}</td>
                        <td className="mp-num">{o.priceDelta ? formatMoney(o.priceDelta) : '-'}</td>
                        <td className="mp-num">{o.leadTimeDelta ? `+${o.leadTimeDelta} gün` : '-'}</td>
                        <td className="mp-num">{o.laborHours ? `${formatNumber(o.laborHours, 1)} sa` : '-'}</td>
                        <td>{o.isDefault ? 'Evet' : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section
        title="Kısıtlama kuralları"
        actions={
          can('URUN_KATALOGU', 'create') && (
            <Button design="Emphasized" icon="add" onClick={() => setRuleOpen(true)}>
              Kural ekle
            </Button>
          )
        }
      >
        <div className="mp-note">
          Bu kurallar, satış personelinin mühendislik açısından üretilemez veya riskli bir
          kombinasyon seçmesini engeller. <strong>Engelle</strong> seviyesindeki kurallar teklif
          kaydını durdurur; <strong>Uyar</strong> seviyesindekiler satışçının onayıyla geçilebilir.
        </div>
        {!data.rules?.length ? (
          <EmptyRow text="Kural tanımlanmamış." />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Kural</th>
                  <th>Tip</th>
                  <th>Seviye</th>
                  <th>Tetikleyen</th>
                  <th>Hedef</th>
                  <th>Mesaj</th>
                  {can('URUN_KATALOGU', 'delete') && <th />}
                </tr>
              </thead>
              <tbody>
                {data.rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.code}</td>
                    <td>
                      <strong>{r.name}</strong>
                    </td>
                    <td>{RULE_TYPE_LABEL[r.type]}</td>
                    <td>
                      <span
                        style={{
                          color: r.severity === 'ENGELLE' ? 'var(--sapNegativeTextColor)' : 'var(--sapCriticalTextColor)',
                          fontWeight: 600,
                        }}
                      >
                        {RULE_SEVERITY_LABEL[r.severity]}
                      </span>
                    </td>
                    <td>{r.whenOptions.join(', ')}</td>
                    <td>{r.thenOptions.join(', ') || '-'}</td>
                    <td style={{ maxWidth: '320px' }}>{r.message}</td>
                    {can('URUN_KATALOGU', 'delete') && (
                      <td>
                        <Button
                          design="Transparent"
                          icon="delete"
                          tooltip="Kuralı sil"
                          accessibleName={`${r.name} kuralını sil`}
                          onClick={() =>
                            confirm({
                              title: 'Kısıtlama kuralını sil',
                              text: `"${r.name}" kuralı silinecek. Bu kuralın engellediği konfigürasyonlar bundan sonra teklife eklenebilir olur.`,
                              onConfirm: () => removeRule.mutate(r.id),
                            })
                          }
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Standart maliyet yapısı">
        <div className="mp-split">
          <div>
            <h5 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem' }}>Malzeme listesi (BOM)</h5>
            {!data.bomLines?.length ? (
              <EmptyRow text="BOM satırı yok." />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Malzeme</th>
                      <th className="mp-num">Miktar</th>
                      <th className="mp-num">Güncel fiyat</th>
                      <th className="mp-num">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bomLines.map((b) => {
                      // Maliyet motoru hammaddenin guncel fiyatini kullanir
                      // (server/src/routes/catalog.ts); tablo da ayni degeri
                      // gostermeli, BOM'a donmus eski anlik fiyati degil.
                      const unitCost = b.material?.currentPrice ?? b.unitCost;
                      return (
                        <tr key={b.id}>
                          <td>{b.description}</td>
                          <td className="mp-num">
                            {formatNumber(b.quantity, 1)} {b.unit}
                          </td>
                          <td className="mp-num">{formatMoney(unitCost)}</td>
                          <td className="mp-num">{formatMoney(b.quantity * unitCost)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h5 style={{ margin: '0 0 0.5rem', fontSize: '0.8125rem' }}>İşçilik / mühendislik</h5>
            {!data.laborLines?.length ? (
              <EmptyRow text="İşçilik satırı yok." />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th>Tür</th>
                      <th className="mp-num">Saat</th>
                      <th className="mp-num">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.laborLines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.description ?? l.rate?.name}</td>
                        <td className="mp-num">{formatNumber(l.hours, 1)}</td>
                        <td className="mp-num">{formatMoney(l.lineCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Section>

      {confirmDialog}

      {ruleOpen && (
        <RuleDialog
          productId={id}
          options={allOptions}
          onClose={() => setRuleOpen(false)}
          onSaved={() => {
            setRuleOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function RuleDialog({
  productId,
  options,
  onClose,
  onSaved,
}: {
  productId: string;
  options: { code: string; name: string; groupName: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'ENGELLER' as RuleType,
    severity: 'ENGELLE' as RuleSeverity,
    whenOptions: [] as string[],
    thenOptions: [] as string[],
    message: '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const toggle = (field: 'whenOptions' | 'thenOptions', code: string) =>
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(code) ? f[field].filter((c) => c !== code) : [...f[field], code],
    }));

  const save = useMutation({
    mutationFn: () => api.post(`/catalog/products/${productId}/rules`, form),
    onSuccess: () => {
      toast('Kural eklendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Kısıtlama Kuralı Ekle"
      onClose={onClose}
      style={{ width: '760px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button
                design="Emphasized"
                onClick={() => save.mutate()}
                disabled={!form.code || form.name.length < 2 || !form.whenOptions.length || form.message.length < 5}
              >
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div>
          <Label required showColon>Kural kodu</Label>
          <Input style={{ width: '100%' }} value={form.code} onInput={(e) => set('code', e.target.value)} />
        </div>
        <div>
          <Label required showColon>Kural adı</Label>
          <Input style={{ width: '100%' }} value={form.name} onInput={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <Label showColon>Tip</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('type', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(RULE_TYPE_LABEL) as RuleType[]).map((t) => (
              <Option key={t} data-value={t} selected={form.type === t}>
                {RULE_TYPE_LABEL[t]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Seviye</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('severity', e.detail.selectedOption.dataset.value)}>
            <Option data-value="ENGELLE" selected={form.severity === 'ENGELLE'}>
              Engelle (teklif verilemez)
            </Option>
            <Option data-value="UYAR" selected={form.severity === 'UYAR'}>
              Uyar (satışçı onayıyla geçilir)
            </Option>
          </Select>
        </div>
        <div className="mp-form__full">
          <Label required showColon>Tetikleyen seçenekler (hepsi seçiliyse kural çalışır)</Label>
          <div className="mp-options">
            {options.map((o) => (
              <div
                key={`w-${o.code}`}
                className={`mp-option${form.whenOptions.includes(o.code) ? ' mp-option--selected' : ''}`}
                role="checkbox"
                aria-checked={form.whenOptions.includes(o.code)}
                tabIndex={0}
                onClick={() => toggle('whenOptions', o.code)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggle('whenOptions', o.code);
                  }
                }}
              >
                <input
                  type="checkbox"
                  className="mp-option__box"
                  checked={form.whenOptions.includes(o.code)}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <span>
                  <span className="mp-option__name">{o.name}</span>
                  <br />
                  <span className="mp-option__delta">{o.groupName} · {o.code}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mp-form__full">
          <Label showColon>Hedef seçenekler</Label>
          <div className="mp-options">
            {options.map((o) => (
              <div
                key={`t-${o.code}`}
                className={`mp-option${form.thenOptions.includes(o.code) ? ' mp-option--selected' : ''}`}
                role="checkbox"
                aria-checked={form.thenOptions.includes(o.code)}
                tabIndex={0}
                onClick={() => toggle('thenOptions', o.code)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    toggle('thenOptions', o.code);
                  }
                }}
              >
                <input
                  type="checkbox"
                  className="mp-option__box"
                  checked={form.thenOptions.includes(o.code)}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <span>
                  <span className="mp-option__name">{o.name}</span>
                  <br />
                  <span className="mp-option__delta">{o.groupName} · {o.code}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mp-form__full">
          <Label required showColon>Kullanıcıya gösterilecek mesaj</Label>
          <TextArea
            style={{ width: '100%' }}
            rows={3}
            placeholder="Neden üretilemediğini/riskli olduğunu ve alternatifi açıklayın."
            value={form.message}
            onInput={(e) => set('message', e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

function ProductDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    code: '',
    name: '',
    family: '',
    description: '',
    unit: 'adet',
    baseCost: 0,
    leadTimeDays: 30,
    isConfigurable: true,
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      api.post('/catalog/products', {
        ...form,
        baseCost: Number(form.baseCost) || 0,
        leadTimeDays: Number(form.leadTimeDays) || 30,
      }),
    onSuccess: () => {
      toast('Ürün oluşturuldu.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Yeni Ürün"
      onClose={onClose}
      style={{ width: '620px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button
                design="Emphasized"
                onClick={() => save.mutate()}
                disabled={form.code.length < 2 || form.name.length < 2}
              >
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-form" style={{ padding: '0.5rem 0' }}>
        <div>
          <Label required showColon>Ürün kodu</Label>
          <Input style={{ width: '100%' }} value={form.code} onInput={(e) => set('code', e.target.value)} />
        </div>
        <div>
          <Label required showColon>Ürün adı</Label>
          <Input style={{ width: '100%' }} value={form.name} onInput={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <Label showColon>Ürün ailesi</Label>
          <Input style={{ width: '100%' }} value={form.family} onInput={(e) => set('family', e.target.value)} />
        </div>
        <div>
          <Label showColon>Birim</Label>
          <Input style={{ width: '100%' }} value={form.unit} onInput={(e) => set('unit', e.target.value)} />
        </div>
        <div>
          <Label showColon>Temel maliyet</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.baseCost)}
            onInput={(e) => set('baseCost', e.target.value)}
          />
        </div>
        <div>
          <Label showColon>Standart termin (gün)</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.leadTimeDays)}
            onInput={(e) => set('leadTimeDays', e.target.value)}
          />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <CheckBox
            text="Konfigüre edilebilir"
            checked={form.isConfigurable}
            onChange={(e) => set('isConfigurable', e.target.checked)}
          />
        </div>
        <div className="mp-form__full">
          <Label showColon>Açıklama</Label>
          <TextArea
            style={{ width: '100%' }}
            rows={3}
            value={form.description}
            onInput={(e) => set('description', e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
