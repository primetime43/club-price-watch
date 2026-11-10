import { createBuilder } from "vite";
import { resolve } from "node:path";
import { ROOT } from "./paths.ts";

await (await createBuilder({ root: ROOT, configFile: resolve(ROOT, "docker/vite.config.ts") })).buildApp();
