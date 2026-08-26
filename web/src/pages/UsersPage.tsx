import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Bar,
  Button,
  CheckBox,
  Dialog,
  Input,
  Label,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useNotify } from '../components/NotificationProvider.js';
import { DataToolbar } from '../components/DataToolbar.js';
import { EmptyRow, PageHeader, Section, MODULE_LABEL, formatDateTime, formatPct,
  TableSkeleton,
} from '../components/ui.js';
import type { AppUser, ModuleKey, PermissionRow } from '../api/types.js';

/** Yetki matrisinin sütunları. */
const ACTIONS: { key: keyof PermissionRow; label: string; hint: string }[] = [
  { key: 'canView', label: 'Görüntüle', hint: 'Sekmeyi açabilir' },
  { key: 'canCreate', label: 'Oluştur', hint: 'Yeni kayıt ekleyebilir' },
  { key: 'canEdit', label: 'Düzenle', hint: 'Mevcut kaydı değiştirebilir' },
  { key: 'canDelete', label: 'Sil', hint: 'Kayıt silebilir' },
  { key: 'canApprove', label: 'Onayla', hint: 'Teklif/sözleşme onaylayabilir' },
];

export default function UsersPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AppUser | null | undefined>(undefined);

  const list = useQuery({
    queryKey: ['users', search],
    queryFn: () => api.get<AppUser[]>(`/users${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });

  return (
    <div className="mp-page">
      <PageHeader
        title="Yetkilendirme Paneli"
        subtitle="Her kullanıcıya sekme bazında görüntüleme, oluşturma, düzenleme, silme ve onaylama yetkisi atanır"
      />

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => list.refetch()}
        onCreate={() => setEditing(null)}
        createLabel="Yeni Kullanıcı"
        canCreate={can('YETKILENDIRME', 'create')}
        count={list.data?.length}
      />

      {list.isLoading ? (
        <TableSkeleton />
      ) : !list.data?.length ? (
        <EmptyRow
          icon="employee"
          text={search ? 'Aramanızla eşleşen kullanıcı yok.' : 'Kullanıcı kaydı yok.'}
          hint="Ad soyad, kullanıcı adı, sicil no ya da departmana göre arayabilirsiniz."
        />
      ) : (
        <div className="mp-table-wrap">
          <table className="mp-table">
            <thead>
              <tr>
                <th>Kullanıcı adı</th>
                <th>Ad Soyad</th>
                <th>Sicil</th>
                <th>Departman</th>
                <th>Ünvan</th>
                <th className="mp-num">İskonto yetkisi</th>
                <th className="mp-num">Yetkili sekme</th>
                <th>Rol</th>
                <th>Son giriş</th>
                <th>Durum</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((u) => {
                const activeModules = u.permissions.filter((p) => p.canView).length;
                return (
                  <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.55 }}>
                    <td>
                      <strong>{u.username}</strong>
                    </td>
                    <td>{u.fullName}</td>
                    <td>{u.employeeNo ?? '-'}</td>
                    <td>{u.department ?? '-'}</td>
                    <td>{u.title ?? '-'}</td>
                    <td className="mp-num">{formatPct(u.maxDiscountPct, 0)}</td>
                    <td className="mp-num">{u.isAdmin ? 'Tümü' : activeModules}</td>
                    <td>{u.isAdmin ? 'Yönetici' : 'Kullanıcı'}</td>
                    <td>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '-'}</td>
                    <td>{u.isActive ? 'Aktif' : 'Pasif'}</td>
                    <td>
                      {can('YETKILENDIRME', 'edit') && (
                        <Button design="Transparent" icon="edit" onClick={() => setEditing(u)}>
                          Yetkiler
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <UserDialog
          user={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            list.refetch();
          }}
        />
      )}
    </div>
  );
}

const ALL_MODULES: ModuleKey[] = [
  'GOSTERGE_PANELI',
  'MUSTERILER',
  'FIRSATLAR',
  'TEKLIFLER',
  'URUN_KATALOGU',
  'FIYATLANDIRMA',
  'SIPARISLER',
  'DOKUMANLAR',
  'SOZLESMELER',
  'SAHA_SERVIS',
  'RAPORLAR',
  'YETKILENDIRME',
];

function emptyMatrix(): PermissionRow[] {
  return ALL_MODULES.map((module) => ({
    module,
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
  }));
}

function UserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AppUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, error: showError } = useNotify();
  const [form, setForm] = useState({
    username: user?.username ?? '',
    password: '',
    fullName: user?.fullName ?? '',
    employeeNo: user?.employeeNo ?? '',
    department: user?.department ?? '',
    title: user?.title ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    isAdmin: user?.isAdmin ?? false,
    isActive: user?.isActive ?? true,
    maxDiscountPct: user?.maxDiscountPct ?? 5,
  });

  const [permissions, setPermissions] = useState<PermissionRow[]>(
    user?.permissions?.length ? user.permissions : emptyMatrix(),
  );

  const set = (key: keyof typeof form, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  function toggle(module: ModuleKey, action: keyof PermissionRow) {
    setPermissions((rows) =>
      rows.map((row) => {
        if (row.module !== module) return row;
        const next = { ...row, [action]: !row[action] };
        // Diğer yetkiler görüntüleme olmadan anlamsız; işaretlenince görüntüleme de açılır.
        if (action !== 'canView' && next[action]) next.canView = true;
        // Görüntüleme kapatılırsa diğerleri de kapanır.
        if (action === 'canView' && !next.canView) {
          next.canCreate = false;
          next.canEdit = false;
          next.canDelete = false;
          next.canApprove = false;
        }
        return next;
      }),
    );
  }

  function toggleRow(module: ModuleKey, on: boolean) {
    setPermissions((rows) =>
      rows.map((row) =>
        row.module === module
          ? { module, canView: on, canCreate: on, canEdit: on, canDelete: on, canApprove: on }
          : row,
      ),
    );
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        maxDiscountPct: Number(form.maxDiscountPct) || 0,
        permissions,
        ...(user && !form.password ? { password: undefined } : {}),
      };
      return user ? api.put(`/users/${user.id}`, payload) : api.post('/users', payload);
    },
    onSuccess: () => {
      toast(user ? 'Kullanıcı güncellendi.' : 'Kullanıcı oluşturuldu.');
      onSaved();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  return (
    <Dialog
      open
      headerText={user ? `${user.fullName} - Yetkiler` : 'Yeni Kullanıcı'}
      onClose={onClose}
      style={{ width: '1000px', maxWidth: '96vw' }}
      footer={
        <Bar
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>Vazgeç</Button>
              <Button
                design="Emphasized"
                onClick={() => save.mutate()}
                disabled={
                  form.username.length < 3 ||
                  form.fullName.length < 2 ||
                  (!user && form.password.length < 6)
                }
              >
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div style={{ padding: '0.5rem 0' }}>
        <div className="mp-form" style={{ marginBottom: '1rem' }}>
          <div>
            <Label required showColon>Kullanıcı adı</Label>
            <Input style={{ width: '100%' }} value={form.username} onInput={(e) => set('username', e.target.value)} />
          </div>
          <div>
            <Label required={!user} showColon>
              {user ? 'Yeni şifre (boş = değişmesin)' : 'Şifre'}
            </Label>
            <Input
              type="Password"
              style={{ width: '100%' }}
              value={form.password}
              onInput={(e) => set('password', e.target.value)}
            />
          </div>
          <div>
            <Label required showColon>Ad Soyad</Label>
            <Input style={{ width: '100%' }} value={form.fullName} onInput={(e) => set('fullName', e.target.value)} />
          </div>
          <div>
            <Label showColon>Sicil no</Label>
            <Input style={{ width: '100%' }} value={form.employeeNo} onInput={(e) => set('employeeNo', e.target.value)} />
          </div>
          <div>
            <Label showColon>Departman</Label>
            <Input style={{ width: '100%' }} value={form.department} onInput={(e) => set('department', e.target.value)} />
          </div>
          <div>
            <Label showColon>Ünvan</Label>
            <Input style={{ width: '100%' }} value={form.title} onInput={(e) => set('title', e.target.value)} />
          </div>
          <div>
            <Label showColon>E-posta</Label>
            <Input style={{ width: '100%' }} value={form.email} onInput={(e) => set('email', e.target.value)} />
          </div>
          <div>
            <Label showColon>Telefon</Label>
            <Input style={{ width: '100%' }} value={form.phone} onInput={(e) => set('phone', e.target.value)} />
          </div>
          <div>
            <Label showColon>Azami iskonto yetkisi (%)</Label>
            <Input
              type="Number"
              style={{ width: '100%' }}
              value={String(form.maxDiscountPct)}
              onInput={(e) => set('maxDiscountPct', e.target.value)}
            />
            <div className="mp-person__title">Bu oranın üstündeki teklifler onaya düşer.</div>
          </div>
          <div style={{ alignSelf: 'end', display: 'flex', gap: '1rem' }}>
            <CheckBox
              text="Sistem yöneticisi"
              checked={form.isAdmin}
              onChange={(e) => set('isAdmin', e.target.checked)}
            />
            <CheckBox text="Aktif" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          </div>
        </div>

        <Section title="Sekme yetkileri">
          {form.isAdmin ? (
            <div className="mp-note">
              Sistem yöneticileri tüm sekmelere ve işlemlere otomatik olarak erişir; ayrı yetki
              atanması gerekmez.
            </div>
          ) : (
            <div className="mp-note">
              Yetkisiz sekmeler kullanıcının sol menüsünde hiç görünmez. "Görüntüle" kapatılırsa
              diğer yetkiler de kapanır.
            </div>
          )}
          <div className="mp-table-wrap">
            <table className="mp-perm-table">
              <thead>
                <tr>
                  <th>Sekme</th>
                  {ACTIONS.map((a) => (
                    <th key={a.key} title={a.hint}>
                      {a.label}
                    </th>
                  ))}
                  <th>Tümü</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((row) => (
                  <tr key={row.module}>
                    <td>{MODULE_LABEL[row.module] ?? row.module}</td>
                    {ACTIONS.map((a) => (
                      <td key={a.key}>
                        <CheckBox
                          checked={Boolean(row[a.key])}
                          disabled={form.isAdmin}
                          onChange={() => toggle(row.module, a.key)}
                        />
                      </td>
                    ))}
                    <td>
                      <Button
                        design="Transparent"
                        disabled={form.isAdmin}
                        onClick={() => toggleRow(row.module, !row.canView)}
                      >
                        {row.canView ? 'Kaldır' : 'Ver'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </Dialog>
  );
}
