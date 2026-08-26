import type { ReactNode } from 'react';
import { Button, Input } from '@ui5/webcomponents-react';

/**
 * Liste sayfalarinin ustundeki arama + islem cubugu.
 * UI5 Toolbar yalnizca ToolbarItem turevlerini kabul ettigi icin
 * serbest icerik barindirabilen duz bir flex satiri kullanilir.
 */
export function DataToolbar({
  search,
  onSearchChange,
  onRefresh,
  onCreate,
  createLabel = 'Yeni',
  canCreate = true,
  extra,
  count,
  searchPlaceholder = 'Ara...',
}: {
  /**
   * Arama kutusu.
   *
   * Bazi sekmelerde sunucu tarafi arama yok; bu alanlar bos birakildiginda
   * kutu hic basilmaz. Onceden islevsiz bir kutu ekrana konuluyor ve yazi
   * yazmak hicbir sey yapmiyordu.
   */
  search?: string;
  onSearchChange?: (value: string) => void;
  onRefresh: () => void;
  onCreate?: () => void;
  createLabel?: string;
  canCreate?: boolean;
  extra?: ReactNode;
  count?: number;
  searchPlaceholder?: string;
}) {
  const hasSearch = search !== undefined && onSearchChange !== undefined;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap',
        padding: '0.5rem 0',
        marginBottom: '0.25rem',
      }}
    >
      {hasSearch && (
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onInput={(e) => onSearchChange(e.target.value)}
          accessibleName="Listede ara"
          showClearIcon
          style={{ width: '260px' }}
        />
      )}
      {count !== undefined && (
        <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem' }}>
          {count} kayıt
        </span>
      )}
      <div style={{ flex: 1 }} />
      {extra}
      <Button design="Transparent" icon="refresh" onClick={onRefresh}>
        Yenile
      </Button>
      {onCreate && canCreate && (
        <Button design="Emphasized" icon="add" onClick={onCreate}>
          {createLabel}
        </Button>
      )}
    </div>
  );
}
