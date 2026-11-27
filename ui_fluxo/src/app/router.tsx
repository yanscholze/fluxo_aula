import { createBrowserRouter, Navigate } from "react-router";
import Shell from "./shell";
import { Accounts, Categories, Transactions } from "../features/finance";
import { Cards, Installments } from "../features/cards";
import { Profile } from "../features/profile";

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/lancamentos" replace /> },
      { path: "entrar", element: null },
      { path: "lancamentos", element: <Transactions /> },
      { path: "contas", element: <Accounts /> },
      { path: "categorias", element: <Categories /> },
      { path: "cartoes", element: <Cards /> },
      { path: "parcelamentos", element: <Installments /> },
      { path: "perfil", element: <Profile /> },
      { path: "*", element: <Navigate to="/lancamentos" replace /> },
    ],
  },
]);
