import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Унифицированный паттерн загрузки данных: loading/error/data + refetch.
 * Защищён от гонок: результат устаревшего запроса игнорируется.
 *
 * @param {() => Promise<any>} fetcher — async-функция, возвращает данные,
 *   бросает при ошибке (включая !res.ok)
 * @param {unknown[]} [deps=[]] — смена зависимостей → авто-refetch
 * @param {{ enabled?: boolean, errorMessage?: string, debounce?: number }} [options]
 *   debounce — задержка авто-refetch в мс (для поиска по мере ввода);
 *   ручной refetch() всегда мгновенный
 * @returns {{ data: any, loading: boolean, error: string|null,
 *   refetch: () => Promise<void>, setData: Function }}
 */
export function useApi(fetcher, deps = [], options = {}) {
  const { enabled = true, errorMessage = "Ошибка загрузки", debounce = 0 } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  // Счётчик запросов: только самый свежий имеет право записать результат
  const requestIdRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (id !== requestIdRef.current) return;
      setData(result);
    } catch (err) {
      if (id !== requestIdRef.current) return;
      setError(err?.userMessage || errorMessage);
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
    // errorMessage намеренно не в deps — это статичная строка
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (debounce > 0) {
      const timer = setTimeout(refetch, debounce);
      return () => clearTimeout(timer);
    }
    refetch();
    // deps приходят от вызывающего кода
  }, [enabled, debounce, refetch, ...deps]);

  return { data, loading, error, refetch, setData };
}

/**
 * Хелпер для типового fetcher'а: api() → проверка res.ok → res.json().
 *
 * @example
 * const { data } = useApi(jsonFetcher(() => api("/api/tasks")), []);
 */
export function jsonFetcher(call) {
  return async () => {
    const res = await call();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
}
