import { useEffect } from "react";

/**
 * Runs `fn` after `delay` ms whenever any value in `deps` changes.
 * Clears the previous timer on each re-run (debounce).
 *
 * @param {() => void} fn
 * @param {unknown[]} deps
 * @param {number} [delay=300]
 */
export function useDebouncedEffect(fn, deps, delay = 300) {
  useEffect(() => {
    const timer = setTimeout(fn, delay);
    return () => clearTimeout(timer);
  }, [...deps, delay]);
}
