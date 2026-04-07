import { Navigate, useLocation } from "react-router";
import { BackendPlayTable } from "./BackendPlayTable";

export function PlayTableEntry() {
  const location = useLocation();
  const queryRoomId = new URLSearchParams(location.search).get("roomId")?.trim() ?? "";
  const stateRoomId =
    typeof location.state?.roomId === "string" ? (location.state.roomId as string) : "";
  const roomId = queryRoomId || stateRoomId;

  if (roomId) {
    return <BackendPlayTable roomId={roomId} />;
  }

  return <Navigate to="/lobby" replace />;
}
