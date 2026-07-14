import { createRequire } from "module";
import { logger } from "../../../shared/logger/index.js";
const require = createRequire(import.meta.url);
const { EventEmitter2 } = require("eventemitter2");

// Initialize a singleton Event Bus
const eventBus = new EventEmitter2({
  wildcard: true,
  delimiter: ".",
  newListener: false,
  removeListener: false,
  maxListeners: 20,
  verboseMemoryLeak: true,
  ignoreErrors: false,
});

// Add a global error listener to prevent unhandled rejections/crashes
eventBus.on("error", (err: any) => {
  logger.error("Unhandled error in Event Bus:", err);
});

export { eventBus };
