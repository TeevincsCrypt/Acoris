/**
 * The Acoris mark — a four-point star, echoing the "bloom" motif of the
 * protocol: verified history opening into better credit. Inherits
 * currentColor so it works on cream, white and deep indigo alike.
 */
export function AcorisMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M12 0.75c.6 5.34 3.16 8.42 8.4 9.28.9.15 1.35.6 1.35 1.24 0 .64-.45 1.09-1.35 1.24-5.24.86-7.8 3.94-8.4 9.28-.07.6-.48.96-1.02.96s-.95-.36-1.02-.96c-.6-5.34-3.16-8.42-8.4-9.28C.66 12.36.21 11.91.21 11.27c0-.64.45-1.09 1.35-1.24C6.8 9.17 9.36 6.09 9.96.75 10.03.15 10.44 0 10.98 0s.95.15 1.02.75Z"
        fill="currentColor"
      />
    </svg>
  );
}
