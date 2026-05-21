const fs = require("fs");
const { INVENTORY_PATH } = require("./pathHelper");

/**
 * Lit le fichier inventory.json de manière asynchrone
 */
function readItems(callback) {
  fs.readFile(INVENTORY_PATH, "utf8", (err, data) => {
    if (err) {
      return callback(err, null);
    }
    try {
      const parsedData = JSON.parse(data);
      callback(null, parsedData.items);
    } catch (parseError) {
      callback(parseError, null);
    }
  });
}

/**
 * Écrit la liste complète des articles dans inventory.json
 */
function writeItems(items, callback) {
  const dataToWrite = JSON.stringify({ items: items }, null, 2);
  fs.writeFile(INVENTORY_PATH, dataToWrite, "utf8", (err) => {
    if (err) {
      return callback(err);
    }
    callback(null);
  });
}

/**
 * Filtre pur (sans effet de bord / sans lecture de fichier) par catégorie
 */
function filterByCategory(items, category) {
  return items.filter(
    (item) => item.category.toLowerCase() === category.toLowerCase(),
  );
}

module.exports = {
  readItems,
  writeItems,
  filterByCategory,
};
