import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const snapshotPattern =
  /^(getSrsillDissAceptncPosblInfoInqire|getEmrrmRltmUsefulSckbdInfoInqire)__(.+)__(\d{8}_\d{6})\.xml$/u;

function option(name) {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function fingerprint(sourceDirectory) {
  const files = (await readdir(sourceDirectory))
    .filter((filename) => snapshotPattern.test(filename))
    .sort();
  return `${files.length}:${files.at(-1) ?? ""}`;
}

function rebuild(sourceDirectory, outputPath) {
  const builder = path.resolve("scripts", "build-historical-metrics.mjs");
  const args = [builder, "--source", sourceDirectory];
  if (outputPath) args.push("--output", outputPath);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`과거 지표 생성기가 종료 코드 ${code}를 반환했습니다.`));
    });
  });
}

const sourceOption = option("--source") ?? process.env.HISTORICAL_DATA_DIR;
if (!sourceOption) {
  throw new Error(
    '--source "NEMC XML 폴더" 또는 HISTORICAL_DATA_DIR가 필요합니다.',
  );
}

const sourceDirectory = path.resolve(sourceOption);
const outputPath = option("--output");
const intervalMs = Number(option("--interval-ms") ?? 30_000);
if (!Number.isFinite(intervalMs) || intervalMs < 1_000) {
  throw new Error("--interval-ms는 1000 이상의 숫자여야 합니다.");
}

let lastBuilt = "";
console.log(
  JSON.stringify({
    status: "watching",
    source: sourceDirectory,
    intervalMs,
  }),
);

while (true) {
  try {
    const current = await fingerprint(sourceDirectory);
    if (current !== lastBuilt) {
      await rebuild(sourceDirectory, outputPath);
      lastBuilt = current;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
