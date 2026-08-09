import { readFile, writeFile } from "node:fs/promises";

const workerConfigUrl = new URL("../dist/server/wrangler.json", import.meta.url);
const workerConfig = JSON.parse(await readFile(workerConfigUrl, "utf8"));

if (Array.isArray(workerConfig.compatibility_flags)) {
  workerConfig.compatibility_flags = workerConfig.compatibility_flags.filter(
    (flag) => flag !== "nodejs_compat",
  );

  if (workerConfig.compatibility_flags.length === 0) {
    delete workerConfig.compatibility_flags;
  }
}

await writeFile(workerConfigUrl, `${JSON.stringify(workerConfig)}\n`);
