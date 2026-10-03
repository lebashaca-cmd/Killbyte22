import { createServer } from "node:http";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

const port = Number(process.env.PORT || 10000);

wisp.options.port_whitelist = [80, 443];
wisp.options.allow_direct_ip = false;
wisp.options.allow_udp_streams = false;
wisp.options.stream_limit_total = 100;

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end("ok");
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not Found");
});

server.on("upgrade", (request, socket, head) => {
  const requestPath = new URL(request.url, "http://localhost").pathname;
  if (requestPath !== "/wisp/") {
    socket.end();
    return;
  }
  wisp.routeRequest(request, socket, head);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Killbyte Wisp proxy listening on port ${port}.`);
});
