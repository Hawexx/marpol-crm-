import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  Button,
  BusyIndicator,
  Dialog,
  Icon,
  Input,
  Label,
  MessageStrip,
  ObjectStatus,
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
  DateInput,
  ContractStatusBadge,
  EmptyRow,
  Field,
  FieldGrid,
  KpiTile,
  PageHeader,
  Section,
  CONTRACT_FILE_KIND_LABEL,
  CONTRACT_STATUS_LABEL,
  CONTRACT_TYPE_LABEL,
  daysUntil,
  fileIcon,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatMoney,
  today,
  PageSkeleton,
  TableSkeleton,
} from '../components/ui.js';
import type {
  Contract,
  ContractFile,
  ContractFileKind,
  ContractStatus,
  ContractType,
  Customer,
} from '../api/types.js';

/** Sunucunun kabul ettigi bicimler ve azami boyut - server/src/lib/uploads.ts ile ayni. */
const ACCEPTED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];
const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export default function ContractsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['contracts', search],
    queryFn: () => api.get<Contract[]>(`/contracts${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  const expiring = useQuery({
    queryKey: ['contracts-expiring'],
    queryFn: () => api.get<Contract[]>('/contracts/expiring?days=60'),
  });

  if (selected) return <ContractDetail id={selected} onBack={() => setSelected(null)} />;

  const active = (list.data ?? []).filter((c) => c.status === 'YURURLUKTE').length;
  const pending = (list.data ?? []).filter((c) => c.status === 'IMZA_BEKLIYOR').length;

  return (
    <div className="mp-page">
      <PageHeader
        title="Sözleşmeler"
        subtitle="Gizlilik, garanti, teslimat ve bakım sözleşmelerinin versiyonlanmış yaşam döngüsü"
      />

      <div className="mp-kpis">
        <KpiTile label="Toplam" value={list.data?.length ?? 0} tone="info" />
        <KpiTile label="Yürürlükte" value={active} tone="good" />
        <KpiTile label="İmza Bekleyen" value={pending} tone="warning" />
        <KpiTile
          label="60 Gün İçinde Bitecek"
          value={expiring.data?.length ?? 0}
          tone={(expiring.data?.length ?? 0) > 0 ? 'critical' : 'good'}
        />
      </div>

      {(expiring.data?.length ?? 0) > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <MessageStrip design="Critical" hideCloseButton>
            Yaklaşan yenilemeler:{' '}
            {expiring.data
              ?.map((c) => `${c.customer?.name} (${formatDate(c.endDate ?? c.renewalDate)})`)
              .join(' · ')}
          </MessageStrip>
        </div>
      )}

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => {
          list.refetch();
          expiring.refetch();
        }}
        onCreate={() => setCreating(true)}
        createLabel="Yeni Sözleşme"
        canCreate={can('SOZLESMELER', 'create')}
        count={list.data?.length}
      />

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow
          icon="signature"
          text={search ? 'Aramanızla eşleşen sözleşme yok.' : 'Henüz sözleşme kaydı yok.'}
          hint={
            search
              ? 'Sözleşme no, başlık ya da müşteri adına göre arayabilirsiniz.'
              : 'Gizlilik, çerçeve, garanti ve bakım sözleşmelerini sürümleriyle birlikte burada izleyin.'
          }
          action={
            !search && can('SOZLESMELER', 'create') ? (
              <Button design="Emphasized" icon="add" onClick={() => setCreating(true)}>
                Yeni Sözleşme
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Sözleşme No</th>
                <th>Başlık</th>
                <th>Müşteri</th>
                <th>Tür</th>
                <th>Durum</th>
                <th>Başlangıç</th>
                <th>Bitiş</th>
                <th className="mp-num">Bedel</th>
                <th className="mp-num">Sürüm</th>
                <th className="mp-num">Evrak</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => {
                const left = daysUntil(c.endDate);
                const soon = c.status === 'YURURLUKTE' && left !== null && left <= 60;
                return (
                  <tr key={c.id} className={soon ? 'mp-row--overdue' : undefined}>
                    <td>{c.contractNo}</td>
                    <td>
                      <strong>{c.title}</strong>
                    </td>
                    <td>{c.customer?.name}</td>
                    <td>{CONTRACT_TYPE_LABEL[c.type]}</td>
                    <td>
                      <ContractStatusBadge status={c.status} />
                    </td>
                    <td>{formatDate(c.startDate)}</td>
                    <td>
                      {formatDate(c.endDate)}
                      {soon && left !== null && <div className="mp-optgroup__req">{left} gün kaldı</div>}
                    </td>
                    <td className="mp-num">{c.value ? formatMoney(c.value, c.currency) : '-'}</td>
                    <td className="mp-num">{c._count?.versions ?? 0}</td>
                    <td className="mp-num">
                      {c._count?.files ? (
                        <span title={`${c._count.files} evrak yüklü`}>
                          <Icon name="attachment" /> {c._count.files}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <Button design="Transparent" icon="detail-view" onClick={() => setSelected(c.id)}>
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

      {creating && (
        <ContractDialog
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

function ContractDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { toast, error: showError } = useNotify();
  const [versionOpen, setVersionOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['contract', id],
    queryFn: () => api.get<Contract>(`/contracts/${id}`),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['contract', id] });

  const setStatus = useMutation({
    mutationFn: (status: ContractStatus) => api.patch(`/contracts/${id}/status`, { status }),
    onSuccess: () => {
      toast('Durum güncellendi.');
      refresh();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  if (isLoading || !data) {
    return (
      <PageSkeleton kpis={4} rows={5} />
    );
  }

  return (
    <div className="mp-page">
      <PageHeader
        title={data.title}
        subtitle={`${data.contractNo} · ${data.customer?.name ?? ''} · ${CONTRACT_TYPE_LABEL[data.type]}`}
        actions={
          <>
            {can('SOZLESMELER', 'create') && (
              <Button design="Emphasized" icon="add" onClick={() => setVersionOpen(true)}>
                Yeni sürüm
              </Button>
            )}
            {can('SOZLESMELER', 'approve') && data.status !== 'YURURLUKTE' && (
              <Button design="Positive" icon="accept" onClick={() => setStatus.mutate('YURURLUKTE')}>
                Yürürlüğe al
              </Button>
            )}
            <Button design="Transparent" icon="nav-back" onClick={onBack}>
              Listeye dön
            </Button>
          </>
        }
      />

      <div className="mp-split">
        <div>
          <Section title="Sürüm geçmişi">
            <div className="mp-note">
              Her değişiklik yeni sürüm olarak saklanır; eski sürümler silinmez, arşivde kalır.
            </div>
            {!data.versions?.length ? (
              <EmptyRow />
            ) : (
              <div className="mp-table-wrap">
                <table className="mp-table">
                  <thead>
                    <tr>
                      <th className="mp-num">Sürüm</th>
                      <th>Tarih</th>
                      <th>Değişiklik notu</th>
                      <th>İçerik</th>
                      <th>Oluşturan</th>
                      <th>Güncel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.versions.map((v) => (
                      <tr key={v.id} style={{ opacity: v.isCurrent ? 1 : 0.65 }}>
                        <td className="mp-num">
                          <strong>v{v.version}</strong>
                        </td>
                        <td>{formatDate(v.createdAt)}</td>
                        <td>{v.changeNote ?? '-'}</td>
                        <td style={{ maxWidth: 320 }}>{v.body ?? '-'}</td>
                        <td>{v.createdBy?.fullName ?? '-'}</td>
                        <td>{v.isCurrent ? 'Güncel' : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <ContractFilesSection contract={data} onChanged={refresh} />
        </div>

        <div>
          <Section title="Sözleşme bilgileri">
            <FieldGrid>
              <Field label="Durum" value={<ContractStatusBadge status={data.status} />} />
              <Field label="Tür" value={CONTRACT_TYPE_LABEL[data.type]} />
              <Field label="Başlangıç" value={formatDate(data.startDate)} />
              <Field label="Bitiş" value={formatDate(data.endDate)} />
              <Field label="Yenileme tarihi" value={formatDate(data.renewalDate)} />
              <Field label="Otomatik yenileme" value={data.autoRenew ? 'Evet' : 'Hayır'} />
              <Field label="Bedel" value={data.value ? formatMoney(data.value, data.currency) : '-'} />
              <Field label="Garanti süresi" value={data.warrantyMonths ? `${data.warrantyMonths} ay` : '-'} />
              <Field label="Teslim koşulu" value={data.deliveryTerms} />
              <Field label="Ödeme koşulu" value={data.paymentTerms} />
              <Field label="Uygulanacak hukuk" value={data.governingLaw} />
            </FieldGrid>
            {data.penaltyClause && (
              <>
                <div className="mp-field__label" style={{ marginTop: '0.75rem' }}>Cezai şart</div>
                <div className="mp-field__value">{data.penaltyClause}</div>
              </>
            )}
            {data.notes && (
              <>
                <div className="mp-field__label" style={{ marginTop: '0.75rem' }}>Notlar</div>
                <div className="mp-field__value">{data.notes}</div>
              </>
            )}
          </Section>

          {can('SOZLESMELER', 'approve') && (
            <Section title="Durum">
              <Select
                style={{ width: '100%' }}
                onChange={(e) => setStatus.mutate(e.detail.selectedOption.dataset.value as ContractStatus)}
              >
                {(Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[]).map((s) => (
                  <Option key={s} data-value={s} selected={data.status === s}>
                    {CONTRACT_STATUS_LABEL[s]}
                  </Option>
                ))}
              </Select>
            </Section>
          )}
        </div>
      </div>

      {versionOpen && (
        <VersionDialog
          contractId={id}
          onClose={() => setVersionOpen(false)}
          onSaved={() => {
            setVersionOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function VersionDialog({
  contractId,
  onClose,
  onSaved,
}: {
  contractId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [changeNote, setChangeNote] = useState('');
  const [body, setBody] = useState('');

  const save = useMutation({
    mutationFn: () => api.post(`/contracts/${contractId}/versions`, { changeNote, body }),
    onSuccess: () => {
      toast('Yeni sürüm oluşturuldu.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Yeni Sözleşme Sürümü"
      onClose={onClose}
      style={{ width: '600px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button design="Emphasized" onClick={() => save.mutate()} disabled={changeNote.length < 2}>
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div style={{ display: 'grid', gap: '0.75rem', padding: '0.5rem 0' }}>
        <div className="mp-note">
          Önceki sürüm arşivde kalır; yalnızca "güncel" işareti yeni sürüme taşınır.
        </div>
        <div>
          <Label required showColon>Değişiklik notu</Label>
          <Input style={{ width: '100%' }} value={changeNote} onInput={(e) => setChangeNote(e.target.value)} />
        </div>
        <div>
          <Label showColon>Sürüm metni / özeti</Label>
          <TextArea style={{ width: '100%' }} rows={5} value={body} onInput={(e) => setBody(e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

function ContractDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    customerId: '',
    type: 'SATIS' as ContractType,
    title: '',
    startDate: today(),
    endDate: '',
    renewalDate: '',
    value: 0,
    warrantyMonths: 24,
    deliveryTerms: '',
    paymentTerms: '',
    penaltyClause: '',
    notes: '',
  });

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const customers = useQuery({
    queryKey: ['customers-lookup'],
    queryFn: () => api.get<Customer[]>('/customers?active=true'),
  });

  const save = useMutation({
    mutationFn: () =>
      api.post('/contracts', {
        ...form,
        value: Number(form.value) || null,
        warrantyMonths: Number(form.warrantyMonths) || null,
        endDate: form.endDate || null,
        renewalDate: form.renewalDate || null,
      }),
    onSuccess: () => {
      toast('Sözleşme oluşturuldu.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Yeni Sözleşme"
      onClose={onClose}
      style={{ width: '680px', maxWidth: '95vw' }}
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
                Kaydet
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
          <Label required showColon>Başlık</Label>
          <Input style={{ width: '100%' }} value={form.title} onInput={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <Label showColon>Tür</Label>
          <Select style={{ width: '100%' }} onChange={(e) => set('type', e.detail.selectedOption.dataset.value)}>
            {(Object.keys(CONTRACT_TYPE_LABEL) as ContractType[]).map((t) => (
              <Option key={t} data-value={t} selected={form.type === t}>
                {CONTRACT_TYPE_LABEL[t]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>Bedel</Label>
          <Input type="Number" style={{ width: '100%' }} value={String(form.value)} onInput={(e) => set('value', e.target.value)} />
        </div>
        <div>
          <Label showColon>Başlangıç</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.startDate}
            onChange={(v) => set('startDate', v)}
          />
        </div>
        <div>
          <Label showColon>Bitiş</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.endDate}
            onChange={(v) => set('endDate', v)}
          />
        </div>
        <div>
          <Label showColon>Yenileme hatırlatma</Label>
          <DateInput
            style={{ width: '100%' }}
            value={form.renewalDate}
            onChange={(v) => set('renewalDate', v)}
          />
        </div>
        <div>
          <Label showColon>Garanti süresi (ay)</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={String(form.warrantyMonths)}
            onInput={(e) => set('warrantyMonths', e.target.value)}
          />
        </div>
        <div>
          <Label showColon>Teslim koşulu</Label>
          <Input style={{ width: '100%' }} value={form.deliveryTerms} onInput={(e) => set('deliveryTerms', e.target.value)} />
        </div>
        <div>
          <Label showColon>Ödeme koşulu</Label>
          <Input style={{ width: '100%' }} value={form.paymentTerms} onInput={(e) => set('paymentTerms', e.target.value)} />
        </div>
        <div className="mp-form__full">
          <Label showColon>Cezai şart</Label>
          <TextArea
            style={{ width: '100%' }}
            rows={2}
            value={form.penaltyClause}
            onInput={(e) => set('penaltyClause', e.target.value)}
          />
        </div>
        <div className="mp-form__full">
          <Label showColon>Notlar</Label>
          <TextArea style={{ width: '100%' }} rows={2} value={form.notes} onInput={(e) => set('notes', e.target.value)} />
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sözleşme evrakı - taranmış imzalı kopya, taslak ve ekler (PDF / PNG / JPEG)
// ---------------------------------------------------------------------------

function FileKindBadge({ kind }: { kind: ContractFileKind }) {
  const tone =
    kind === 'IMZALI_KOPYA' ? 'Positive' : kind === 'TASLAK' ? 'Critical' : 'Information';
  return <ObjectStatus state={tone}>{CONTRACT_FILE_KIND_LABEL[kind]}</ObjectStatus>;
}

/**
 * Sözleşmeye bağlı dosyalar. Evrak firma klasöründe saklanır; buradan
 * yüklenir, önizlenir, indirilir ve silinir.
 */
function ContractFilesSection({
  contract,
  onChanged,
}: {
  contract: Contract;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const { toast, error: showError } = useNotify();
  const { confirm, confirmDialog } = useConfirm();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<ContractFile | null>(null);

  const files = contract.files ?? [];

  const remove = useMutation({
    mutationFn: (fileId: string) => api.delete(`/contracts/files/${fileId}`),
    onSuccess: () => {
      toast('Evrak silindi.');
      onChanged();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  /**
   * Dosya oturum anahtarıyla alınır, geçici bir bağlantı üzerinden kaydedilir.
   *
   * Bağlantı belgeye eklenmeden `click()` çağrılırsa Firefox indirmeyi
   * başlatmaz; nesne URL'i hemen serbest bırakılırsa Safari indirmeyi yarıda
   * keser. Bu yüzden ekle → tıkla → bir sonraki turda temizle sırası izlenir.
   */
  const download = async (file: ContractFile) => {
    try {
      const blob = await api.blob(`/contracts/files/${file.id}?download=1`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
      }, 10_000);
    } catch (err) {
      showError(errorMessage(err));
    }
  };

  return (
    <Section
      title="Sözleşme evrakı"
      actions={
        can('SOZLESMELER', 'create') ? (
          <Button design="Emphasized" icon="add-document" onClick={() => setUploadOpen(true)}>
            Evrak yükle
          </Button>
        ) : undefined
      }
    >
      <div className="mp-note">
        Islak imzalı sözleşmenin taranmış kopyası, imzaya gitmeden önceki taslaklar ve ekler PDF,
        PNG veya JPEG olarak yüklenir. Dosyalar firmaya özel klasörde saklanır:{' '}
        {contract.customer?.code} / {contract.contractNo}
      </div>

      {!files.length ? (
        <EmptyRow
          icon="attachment"
          text="Henüz evrak yüklenmemiş"
          hint="Islak imzalı nüshayı, imza öncesi taslakları ve ekleri PDF, PNG veya JPEG olarak ekleyin."
          action={
            can('SOZLESMELER', 'create') ? (
              <Button design="Emphasized" icon="add-document" onClick={() => setUploadOpen(true)}>
                Evrak yükle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Dosya</th>
                <th>Tür</th>
                <th>Sürüm</th>
                <th className="mp-num">Boyut</th>
                <th>Yükleyen</th>
                <th>Tarih</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Icon name={fileIcon(f.mimeType)} style={{ marginInlineEnd: '0.35rem' }} />
                    <strong>{f.originalName}</strong>
                    {f.notes && <div className="mp-optgroup__help">{f.notes}</div>}
                  </td>
                  <td>
                    <FileKindBadge kind={f.kind} />
                  </td>
                  <td>{f.version ? `v${f.version.version}` : '-'}</td>
                  <td className="mp-num">{formatFileSize(f.sizeBytes)}</td>
                  <td>{f.uploadedBy?.fullName ?? '-'}</td>
                  <td>{formatDateTime(f.createdAt)}</td>
                  <td>
                    <div className="mp-inline-actions">
                      <Button
                        design="Transparent"
                        icon="show"
                        tooltip="Önizle"
                        onClick={() => setPreview(f)}
                      />
                      <Button
                        design="Transparent"
                        icon="download"
                        tooltip="İndir"
                        onClick={() => download(f)}
                      />
                      {can('SOZLESMELER', 'delete') && (
                        <Button
                          design="Transparent"
                          icon="delete"
                          tooltip="Sil"
                          accessibleName={`${f.originalName} evrakını sil`}
                          onClick={() =>
                            confirm({
                              title: 'Evrakı sil',
                              text: `"${f.originalName}" hem kayıttan hem sunucudaki klasörden kalıcı olarak silinecek.`,
                              onConfirm: () => remove.mutate(f.id),
                            })
                          }
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {uploadOpen && (
        <FileUploadDialog
          contract={contract}
          onClose={() => setUploadOpen(false)}
          onSaved={() => {
            setUploadOpen(false);
            onChanged();
          }}
        />
      )}

      {preview && <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />}

      {confirmDialog}
    </Section>
  );
}

function FileUploadDialog({
  contract,
  onClose,
  onSaved,
}: {
  contract: Contract;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<ContractFileKind>('IMZALI_KOPYA');
  const [versionId, setVersionId] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  /** Sunucuya gitmeden önce biçim ve boyut burada da denetlenir. */
  const accept = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!ACCEPTED_MIME.includes(candidate.type)) {
      setLocalError('Yalnızca PDF, PNG ve JPEG dosyaları yüklenebilir.');
      setFile(null);
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setLocalError(`Dosya çok büyük. Azami ${MAX_FILE_BYTES / (1024 * 1024)} MB yüklenebilir.`);
      setFile(null);
      return;
    }
    setLocalError(null);
    setFile(candidate);
  };

  const save = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('file', file as File);
      form.append('kind', kind);
      if (versionId) form.append('versionId', versionId);
      if (notes) form.append('notes', notes);
      return api.upload(`/contracts/${contract.id}/files`, form);
    },
    onSuccess: () => {
      toast('Evrak yüklendi.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText="Sözleşme Evrakı Yükle"
      onClose={onClose}
      style={{ width: '620px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>
                Vazgeç
              </Button>
              <Button
                design="Emphasized"
                icon="upload"
                onClick={() => save.mutate()}
                disabled={!file || save.isPending}
              >
                {save.isPending ? 'Yükleniyor...' : 'Yükle'}
              </Button>
            </>
          }
        />
      }
    >
      {localError && (
        <div style={{ marginBottom: '0.75rem' }}>
          <MessageStrip design="Negative" onClose={() => setLocalError(null)}>
            {localError}
          </MessageStrip>
        </div>
      )}

      {/* Buton olarak işaretlenir: klavyeyle odaklanıp Enter/Space ile açılır. */}
      <button
        type="button"
        className={`mp-dropzone${dragging ? ' mp-dropzone--active' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0]);
        }}
      >
        <Icon name={file ? fileIcon(file.type) : 'upload-to-cloud'} />
        <div>
          {file ? (
            <>
              <strong>{file.name}</strong>
              <div className="mp-dropzone__hint">{formatFileSize(file.size)}</div>
            </>
          ) : (
            <>
              <strong>Dosyayı buraya sürükleyin veya seçmek için tıklayın</strong>
              <div className="mp-dropzone__hint">PDF, PNG, JPEG · azami 20 MB</div>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          style={{ display: 'none' }}
          onChange={(e) => accept(e.target.files?.[0] ?? undefined)}
        />
      </button>

      <div className="mp-form" style={{ marginTop: '0.75rem' }}>
        <div>
          <Label showColon>Evrak türü</Label>
          <Select
            style={{ width: '100%' }}
            onChange={(e) => setKind(e.detail.selectedOption.dataset.value as ContractFileKind)}
          >
            {(Object.keys(CONTRACT_FILE_KIND_LABEL) as ContractFileKind[]).map((k) => (
              <Option key={k} data-value={k} selected={kind === k}>
                {CONTRACT_FILE_KIND_LABEL[k]}
              </Option>
            ))}
          </Select>
        </div>
        <div>
          <Label showColon>İlgili sürüm</Label>
          <Select
            style={{ width: '100%' }}
            onChange={(e) => setVersionId(e.detail.selectedOption.dataset.value ?? '')}
          >
            <Option data-value="" selected={!versionId}>
              Belirtilmedi
            </Option>
            {(contract.versions ?? []).map((v) => (
              <Option key={v.id} data-value={v.id} selected={versionId === v.id}>
                {`v${v.version}${v.isCurrent ? ' (güncel)' : ''}`}
              </Option>
            ))}
          </Select>
        </div>
        <div className="mp-form__full">
          <Label showColon>Not</Label>
          <Input
            style={{ width: '100%' }}
            placeholder="ör. 12.03.2026 tarihli ıslak imzalı nüsha"
            value={notes}
            onInput={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Evrak önizlemesi. Dosya oturum anahtarıyla indirilip geçici bir nesne URL
 * üzerinden gösterilir; görseller doğrudan, PDF gömülü çerçevede açılır.
 */
function FilePreviewDialog({ file, onClose }: { file: ContractFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    api
      .blob(`/contracts/files/${file.id}`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });

    // Diyalog kapandığında tarayıcı belleğindeki geçici URL serbest bırakılır.
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id]);

  return (
    <Dialog
      open
      headerText={file.originalName}
      onClose={onClose}
      style={{ width: '900px', maxWidth: '95vw' }}
      footer={
        <Bar
          endContent={
            <>
              {url && (
                <Button
                  design="Transparent"
                  icon="popup-window"
                  onClick={() => window.open(url, '_blank')}
                >
                  Yeni sekmede aç
                </Button>
              )}
              <Button design="Emphasized" onClick={onClose}>
                Kapat
              </Button>
            </>
          }
        />
      }
    >
      {error ? (
        <MessageStrip design="Negative" hideCloseButton>
          {error}
        </MessageStrip>
      ) : !url ? (
        <BusyIndicator active size="M" text="Evrak açılıyor..." />
      ) : file.mimeType === 'application/pdf' ? (
        <iframe title={file.originalName} src={url} className="mp-preview mp-preview--pdf" />
      ) : (
        <img alt={file.originalName} src={url} className="mp-preview mp-preview--image" />
      )}
    </Dialog>
  );
}
