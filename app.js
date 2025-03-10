const { WebSocketServer, WebSocket } = require("ws");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const server = http.createServer((req, res) => {
  const url = req.url;

  if (url === "/" || url === "/index.html") {
    fs.readFile(path.join(__dirname, "index.html"), (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading index.html");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
  } else if (url === "/style.css") {
    fs.readFile(path.join(__dirname, "style.css"), (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading style.css");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/css" });
      res.end(data);
    });
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});

const wss = new WebSocketServer({ server });

const waitingClients = [];
const activePairs = new Map();

wss.on("connection", (ws) => {
  const clientId = uuidv4();
  console.log(`Client ${clientId.substring(0, 8)} connected`);

  waitingClients.push(ws);

  ws.send(
    JSON.stringify({
      type: "connection",
      id: clientId,
      message: "Waiting for a partner...",
    })
  );

  if (waitingClients.length >= 2) {
    const client1 = waitingClients.shift();
    const client2 = waitingClients.shift();

    activePairs.set(client1, client2);
    activePairs.set(client2, client1);

    [client1, client2].forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "paired",
            message:
              "You've been paired with someone! You can start your call.",
          })
        );
      }
    });
  }

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (
        data.type === "offer" ||
        data.type === "answer" ||
        data.type === "ice-candidate"
      ) {
        const partner = activePairs.get(ws);
        if (partner && partner.readyState === WebSocket.OPEN) {
          partner.send(message.toString());
        }
      }
    } catch (error) {
      console.log("Error processing message:", error);
    }
  });

  ws.on("close", () => {
    const waitingIndex = waitingClients.indexOf(ws);
    if (waitingIndex !== -1) {
      waitingClients.splice(waitingIndex, 1);
    }

    const partner = activePairs.get(ws);
    if (partner) {
      activePairs.delete(partner);
      activePairs.delete(ws);

      if (partner.readyState === WebSocket.OPEN) {
        partner.send(
          JSON.stringify({
            type: "partnerLeft",
            message:
              "Your partner has disconnected. Waiting for a new partner...",
          })
        );

        waitingClients.push(partner);
      }
    }

    console.log(`Client ${clientId.substring(0, 8)} disconnected`);
  });

  ws.on("error", (error) => {
    console.log(`WebSocket error: ${error.message}`);
  });
});

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  console.log(`ws://localhost:${PORT}`);
});
