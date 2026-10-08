import { execFileSync } from "node:child_process";
import { join } from "node:path";

/* Runs once before the suite: regenerates the fixture CSVs from the seeded
   generator, so nothing generated is committed and the files can never drift
   from the script that describes them. */
export default async function globalSetup() {
  execFileSync(process.execPath, [join(__dirname, "fixtures", "generate.mjs")], { stdio: "inherit" });
}
