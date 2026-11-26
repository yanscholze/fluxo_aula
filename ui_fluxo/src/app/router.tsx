import { createBrowserRouter, Link, Navigate } from "react-router";
import Shell from "./shell";
import { Empty } from "../design-system/ui";
import {
  Accounts,
  Cards,
  Categories,
  Commitments,
  Dashboard,
  Installments,
  Reports,
  Transactions,
} from "../features/finance";
import { Captures, Rewards, Settings, Trips } from "../features/secondary";

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/painel" replace /> },
      { path: "entrar", element: null },
      { path: "painel", element: <Dashboard /> },
      { path: "lancamentos", element: <Transactions /> },
      { path: "contas", element: <Accounts /> },
      { path: "cartoes", element: <Cards /> },
      { path: "categorias", element: <Categories /> },
      { path: "planejamento", element: <Commitments /> },
      { path: "assinaturas", element: <Navigate to="/planejamento" replace /> },
      { path: "parcelamentos", element: <Installments /> },
      { path: "viagens", element: <Trips /> },
      { path: "recompensas", element: <Rewards /> },
      { path: "relatorios", element: <Reports /> },
      { path: "automaticos", element: <Captures /> },
      { path: "configuracoes", element: <Settings /> },
      {
        path: "*",
        element: (
          <Empty
            title="Página indisponível"
            description="Escolha uma área no menu para continuar."
            action={
              <Link className="button primary" to="/painel">
                Voltar ao painel
              </Link>
            }
          />
        ),
      },
    ],
  },
]);
