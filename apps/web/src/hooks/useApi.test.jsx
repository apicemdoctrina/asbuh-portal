import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useApi, jsonFetcher } from "./useApi.js";

describe("useApi", () => {
  it("goes loading → data", async () => {
    const fetcher = vi.fn().mockResolvedValue([1, 2, 3]);
    const { result } = renderHook(() => useApi(fetcher, []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([1, 2, 3]);
    expect(result.current.error).toBeNull();
  });

  it("sets error message on failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useApi(fetcher, [], { errorMessage: "Не вышло" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Не вышло");
    expect(result.current.data).toBeNull();
  });

  it("refetches when deps change", async () => {
    const fetcher = vi.fn().mockResolvedValue("v");
    const { result, rerender } = renderHook(({ dep }) => useApi(fetcher, [dep]), {
      initialProps: { dep: 1 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);
    rerender({ dep: 2 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("does not fetch when enabled=false, fetches after enable", async () => {
    const fetcher = vi.fn().mockResolvedValue("x");
    const { result, rerender } = renderHook(({ enabled }) => useApi(fetcher, [], { enabled }), {
      initialProps: { enabled: false },
    });
    expect(result.current.loading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toBe("x"));
  });

  it("ignores stale request results (race protection)", async () => {
    let resolveFirst;
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockImplementationOnce(() => Promise.resolve("fresh"));
    const { result } = renderHook(() => useApi(fetcher, []));
    // Второй запрос стартует, пока первый ещё висит
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toBe("fresh");
    // Первый (устаревший) разрешается позже — не должен затереть свежие данные
    await act(async () => {
      resolveFirst("stale");
    });
    expect(result.current.data).toBe("fresh");
  });

  it("debounces auto-refetch but keeps manual refetch immediate", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn().mockResolvedValue("v");
      const { rerender } = renderHook(({ q }) => useApi(fetcher, [q], { debounce: 300 }), {
        initialProps: { q: "a" },
      });
      expect(fetcher).not.toHaveBeenCalled();
      // Быстрая смена deps до истечения таймера — предыдущий таймер сбрасывается
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      rerender({ q: "ab" });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(fetcher).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes setData for optimistic updates", async () => {
    const fetcher = vi.fn().mockResolvedValue([1]);
    const { result } = renderHook(() => useApi(fetcher, []));
    await waitFor(() => expect(result.current.data).toEqual([1]));
    act(() => result.current.setData([1, 2]));
    expect(result.current.data).toEqual([1, 2]);
  });
});

describe("jsonFetcher", () => {
  it("returns parsed json on ok", async () => {
    const call = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ a: 1 }) });
    await expect(jsonFetcher(call)()).resolves.toEqual({ a: 1 });
  });

  it("throws on !ok", async () => {
    const call = () => Promise.resolve({ ok: false, status: 500 });
    await expect(jsonFetcher(call)()).rejects.toThrow("HTTP 500");
  });
});
