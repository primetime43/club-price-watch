import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { buildExtension } from "./build-extension.ts";
import { ROOT, NATIVE_OUTPUT } from "./paths.ts";

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed: ${command} (exit ${result.status})`);
}
async function test(): Promise<void> {
  const files = (await readdir(resolve(ROOT, "tests"))).filter(name => name.endsWith(".test.ts")).sort().map(name => `tests/${name}`);
  if (!files.length) throw new Error("No TypeScript tests were found.");
  run(process.execPath, ["--experimental-strip-types", "--test", ...files]);
}
async function check(): Promise<void> {
  run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"]);
  await test();
}
async function publishNative(): Promise<void> {
  const env = { ...process.env, DOTNET_CLI_HOME: resolve(ROOT, ".build/dotnet-home"), NUGET_PACKAGES: resolve(ROOT, ".build/nuget"), DOTNET_GENERATE_ASPNET_CERTIFICATE: "false", DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1" };
  run("dotnet", ["run", "--project", "checker/ClubPriceWatch.Checker.Tests", "-c", "Release"], env);
  run("dotnet", ["publish", "checker/ClubPriceWatch.Checker/ClubPriceWatch.Checker.csproj", "-c", "Release", "-r", "win-x64", "--self-contained", "false", "-o", NATIVE_OUTPUT], env);
}

const target = process.argv[2] ?? "site";
if (target === "test") await test();
else if (target === "check") await check();
else if (target === "extension") await buildExtension();
else if (target === "site") run(process.execPath, ["node_modules/vinext/dist/cli.js", "build"]);
else if (target === "release") {
  await check();
  await publishNative();
  await buildExtension();
  run(process.execPath, ["node_modules/vinext/dist/cli.js", "build"]);
} else throw new Error(`Unknown build target: ${target}`);
