import { createBrowserRouter } from "react-router";
import { Root } from "./components/Root";
import { AuthScreen } from "./components/AuthScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { Lobby } from "./components/Lobby";
import { PlayTable } from "./components/PlayTable";
import { HandReview } from "./components/HandReview";
import { Store } from "./components/Store";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: AuthScreen },
      { path: "loading", Component: LoadingScreen },
      { path: "lobby", Component: Lobby },
      { path: "play", Component: PlayTable },
      { path: "review", Component: HandReview },
      { path: "store", Component: Store },
      { path: "*", Component: () => <div className="text-white p-10 font-bold text-2xl">404 - Not Found</div> },
    ],
  },
]);
