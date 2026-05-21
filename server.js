const http = require("http");
const fs = require("fs");
const url = require("url"); // Module natif pour parser les query strings facilement
const { LOG_PATH } = require("./utils/pathHelper");
const {
  readItems,
  writeItems,
  filterByCategory,
} = require("./utils/inventory");

const PORT = 3000;

// Création du serveur HTTP brut
const server = http.createServer((req, res) => {
  // --- 5. LOGGING SYSTEM ---
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${req.method} ${req.url}\n`;

  fs.appendFile(LOG_PATH, logLine, "utf8", (err) => {
    if (err) console.error("Erreur lors de l'écriture du log:", err);
  });

  // Configuration par défaut des headers pour servir du JSON
  res.setHeader("Content-Type", "application/json");

  // Parsing de l'URL pour récupérer la route et les query parameters (?category=...)
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // --- GESTION DES ROUTES ---

  // 1. GET / -> Status de l'API
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

  // 2. GET /items (Inclut le filtrage par catégorie et la démo Async)
  if (pathname === "/items" && req.method === "GET") {
    // Démonstration asynchrone demandée :
    console.log("reading..."); // S'affiche instantanément dans le terminal

    readItems((err, items) => {
      /* EXPLICATION EVENT LOOP :
               Quand fs.readFile est appelé, Node.js délègue la lecture physique du fichier 
               au pool de threads du système d'exploitation et rend immédiatement la main. 
               Le message "reading..." s'affiche donc AVANT que le fichier ne soit lu.
               Une fois la lecture terminée, l'événement est poussé dans la Event Queue 
               et cette fonction callback est enfin exécutée par l'Event Loop.
            */
      if (err) {
        res.writeHead(500);
        return res.end(
          JSON.stringify({ error: "Erreur lors de la lecture des données" }),
        );
      }

      // Filtrage optionnel par catégorie (?category=grains)
      if (query.category) {
        const filtered = filterByCategory(items, query.category);
        res.writeHead(200);
        return res.end(JSON.stringify(filtered));
      }

      res.writeHead(200);
      return res.end(JSON.stringify(items));
    });
  }

  // 3. BONUS: GET /items/{id} (Extraction manuelle de l'ID)
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

        // Opérations asynchrones enchaînées : (1) Lecture -> (2) Écriture
        readItems((err, items) => {
          if (err) {
            res.writeHead(500);
            return res.end(
              JSON.stringify({ error: "Erreur lors de la lecture" }),
            );
          }

          // Auto-incrémentation simple de l'ID
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

  // 5. BONUS: DELETE /items/{id}
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

  // 6. BONUS: GET /logs (Lit app.log et renvoie un tableau de chaînes JSON)
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
      // Découpage par ligne et filtre pour enlever les entrées vides
      const logArray = data.split("\n").filter((line) => line.trim() !== "");
      res.writeHead(200);
      return res.end(JSON.stringify(logArray));
    });
  }

  // 7. Route 404 par défaut
  else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Route non trouvée" }));
  }
});

// Lancement du serveur
server.listen(PORT, () => {
  console.log(`Serveur brut démarré sur http://localhost:${PORT}`);
});
