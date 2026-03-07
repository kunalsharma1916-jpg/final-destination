import type { NextApiRequest } from "next";
import type { NextApiResponseServerIO } from "@/types/socket";
import { initSocketServer } from "@/lib/socket-server";

export default function handler(_req: NextApiRequest, res: NextApiResponseServerIO) {
  if (!res.socket.server.io) {
    res.socket.server.io = initSocketServer(res.socket.server);
  }
  res.end();
}

export const config = {
  api: {
    bodyParser: false,
  },
};
