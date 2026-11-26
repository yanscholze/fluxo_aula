import { Link } from "react-router";

export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      className="brand"
      to="/painel"
      onClick={onClick}
      aria-label="Fluxo — Painel"
    >
      <span className="brand-icon" aria-hidden="true">
        <svg width="25" height="28" viewBox="0 0 25 28">
          <path
            fill="currentColor"
            d="M10 28V15H6v-6h4V7c0-5 3-7 8-7h5v6h-4c-2 0-2 1-2 3h5v6h-5v13z"
          />
        </svg>
      </span>
      <span className="brand-word">
        fluxo
        <span className="brand-dot" aria-hidden="true">
          .
        </span>
      </span>
    </Link>
  );
}
