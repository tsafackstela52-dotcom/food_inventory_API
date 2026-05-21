const http = require("http");
const fs = require("fs");
const url = require("url"); 
const { LOG_PATH } = require("./utils/pathHelper");
const {
  readItems,
  writeItems,
  filterByCategory,
} = require("./utils/inventory");

const PORT = 3000;


const server = http.createServer((req, res) => {
  // --- 5. LOGGING SYSTEM ---
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${req.method} ${req.url}\n`;

  fs.appendFile(LOG_PATH, logLine, "utf8", (err) => {
    if (err) console.error("Erreur lors de l'écriture du log:", err);
  });

  
  res.setHeader("Content-Type", "application/json");
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

 
  if (pathname === "/" && req.method === "GET") {
    res.writeHead(200);
    return res.end(
      JSON.stringify({
        status: "running",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      }),
    );
  }


  if (pathname === "/items" && req.method === "GET") {
  
    console.log("reading..."); 

    readItems((err, items) => {

      if (err) {
        res.writeHead(500);
        return res.end(
          JSON.stringify({ error: "Erreur lors de la lecture des données" }),
        );
      }

      
      if (query.category) {
        const filtered = filterByCategory(items, query.category);
        res.writeHead(200);
        return res.end(JSON.stringify(filtered));
      }

      res.writeHead(200);
      return res.end(JSON.stringify(items));
    });
  }


  else if (pathname.startsWith("/items/") && req.method === "GET") {
    const id = parseInt(pathname.split("/")[2], 10);

    readItems((err, items) => {
      if (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: "Erreur serveur" }));
      }
      const item = items.find((i) => i.id === id);
      if (!item) {
        res.writeHead(404);
        return res.end(
          JSON.stringify({ error: `Article avec l'id ${id} introuvable` }),
        );
      }
      res.writeHead(200);
      return res.end(JSON.stringify(item));
    });
  }

  // 4. POST /items (Ajouter un article, traitement de flux raw data)
  else if (pathname === "/items" && req.method === "POST") {
    let body = "";

    // Réception des morceaux de données (streams)
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    // Fin de la réception du body
    req.on("end", () => {
      try {
        const newItem = JSON.parse(body);

        // Validation minimale des champs
        if (
          !newItem.name ||
          !newItem.category ||
          !newItem.quantity ||
          !newItem.price
        ) {
          res.writeHead(400);
          return res.end(
            JSON.stringify({
              error:
                "Champs requis manquants (name, category, quantity, price)",
            }),
          );
        }
        readItems((err, items) => {
          if (err) {
            res.writeHead(500);
            return res.end(
              JSON.stringify({ error: "Erreur lors de la lecture" }),
            );
          }

          const nextId =
            items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1;
          newItem.id = nextId;

          items.push(newItem);

          writeItems(items, (writeErr) => {
            if (writeErr) {
              res.writeHead(500);
              return res.end(
                JSON.stringify({ error: "Erreur lors de l'écriture" }),
              );
            }
            res.writeHead(201); // Created
            return res.end(JSON.stringify(newItem));
          });
        });
      } catch (e) {
        res.writeHead(400);
        return res.end(
          JSON.stringify({ error: "Le format JSON envoyé est invalide" }),
        );
      }
    });
  }


  else if (pathname.startsWith("/items/") && req.method === "DELETE") {
    const id = parseInt(pathname.split("/")[2], 10);

    readItems((err, items) => {
      if (err) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: "Erreur serveur" }));
      }

      const itemToDelete = items.find((i) => i.id === id);
      if (!itemToDelete) {
        res.writeHead(404);
        return res.end(
          JSON.stringify({
            error: `Impossible de supprimer : id ${id} inexistant`,
          }),
        );
      }

      const updatedItems = items.filter((i) => i.id !== id);

      writeItems(updatedItems, (writeErr) => {
        if (writeErr) {
          res.writeHead(500);
          return res.end(
            JSON.stringify({
              error: "Erreur lors de la mise à jour de la base de données",
            }),
          );
        }
        res.writeHead(200);
        return res.end(
          JSON.stringify({
            message: "Article supprimé avec succès",
            item: itemToDelete,
          }),
        );
      });
    });
  }

 
  else if (pathname === "/logs" && req.method === "GET") {
    fs.readFile(LOG_PATH, "utf8", (err, data) => {
      if (err) {
        // Si le fichier n'existe pas encore, on renvoie un tableau vide
        if (err.code === "ENOENT") {
          res.writeHead(200);
          return res.end(JSON.stringify([]));
        }
        res.writeHead(500);
        return res.end(
          JSON.stringify({ error: "Erreur lors de la lecture des logs" }),
        );
      }
 
      const logArray = data.split("\n").filter((line) => line.trim() !== "");
      res.writeHead(200);
      return res.end(JSON.stringify(logArray));
    });
  }

  else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Route non trouvée" }));
  }
});


server.listen(PORT, () => {
  console.log(`Serveur brut démarré sur http://localhost:${PORT}`);
});
