/* eslint-disable no-restricted-syntax -- renders without the app stylesheet, so colours stay literal */
"use client";

// Root error boundary. Next renders this ONLY when the root layout itself throws
// (nested errors are caught closer); it replaces the layout, so it must ship its
// own <html>/<body> and can't rely on the global stylesheet having loaded —
// hence inline styles. Kept deliberately tiny and dependency-free.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5efe4",
          color: "#2b2620",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              margin: "0 0 0.5rem",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "0.9rem",
              color: "#6b6152",
              margin: "0 0 1.5rem",
              lineHeight: 1.5,
            }}
          >
            An unexpected error interrupted the page. Please try again, and if
            it keeps happening, refresh in a moment.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              cursor: "pointer",
              border: "none",
              borderRadius: "0.625rem",
              background: "#c2410c",
              color: "#fff",
              fontSize: "0.9rem",
              fontWeight: 600,
              padding: "0.7rem 1.25rem",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
