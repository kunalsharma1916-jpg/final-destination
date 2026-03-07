import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";

declare global {
  // eslint-disable-next-line no-var
  var ioGlobal: SocketIOServer | undefined;
}

export function initSocketServer(server: HttpServer) {
  if (!global.ioGlobal) {
    global.ioGlobal = new SocketIOServer(server, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: {
        origin: "*",
      },
    });

    global.ioGlobal.on("connection", (socket) => {
      socket.on("join_session", (sessionId: string) => {
        if (sessionId) socket.join(`session:${sessionId}`);
      });

      socket.on("join_admin", (sessionId: string) => {
        if (sessionId) socket.join(`admin:${sessionId}`);
      });
    });
  }

  return global.ioGlobal;
}

export function getSocketServer() {
  return global.ioGlobal;
}
