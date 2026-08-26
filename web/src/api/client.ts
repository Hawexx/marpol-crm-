const TOKEN_KEY = 'marpol.crm.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: ApiErrorDetail[],
    /** Sunucunun dondurdugu tam govde - uyari/onay akislari icin. */
    public body?: unknown,
  ) {
    super(message);
  }
}

/** Oturum dustugunde uygulamayi giris ekranina dondurmek icin dinlenir. */
export const AUTH_EXPIRED_EVENT = 'marpol:auth-expired';

/** Oturum baslikli ham istek - JSON ve dosya akislarinin ortak temeli. */
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const token = tokenStore.get();
  // FormData gonderirken sinir (boundary) basligini tarayici kendisi yazmalidir.
  const isFormData = init.body instanceof FormData;

  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401) {
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }

  return res;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await send(path, init);

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error ?? 'Beklenmeyen bir hata olustu.',
      body?.details,
      body,
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Dosya yukler (multipart/form-data). */
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),

  /**
   * Korumali bir dosyayi indirir. Oturum anahtari baslikta gittigi icin
   * dosya `<img src>` / `<a href>` ile dogrudan cagrilamaz; icerik blob olarak
   * alinip tarayicida gecici bir URL uretilir.
   */
  blob: async (path: string): Promise<Blob> => {
    const res = await send(path);
    if (!res.ok) {
      const text = await res.text();
      const body = text ? (JSON.parse(text) as { error?: string }) : null;
      throw new ApiError(res.status, body?.error ?? 'Dosya alinamadi.');
    }
    return res.blob();
  },
};

/** Hata nesnesinden kullaniciya gosterilecek mesaji cikarir. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.details?.length) {
      return `${err.message} (${err.details.map((d) => d.message).join(' ')})`;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Bilinmeyen bir hata olustu.';
}
