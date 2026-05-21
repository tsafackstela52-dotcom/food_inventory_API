const path = require("path");

// Construction des chemins absolus cross-platform
const INVENTORY_PATH = path.join(__dirname, "..", "inventory.json");
const LOG_PATH = path.join(__dirname, "..", "app.log");

module.exports = {
  INVENTORY_PATH,
  LOG_PATH,
};
