import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("src/generated/prisma");
const target = resolve("dist/src/generated/prisma");

await mkdir(resolve("dist/src/generated"), { recursive: true });
await cp(source, target, { recursive: true });
