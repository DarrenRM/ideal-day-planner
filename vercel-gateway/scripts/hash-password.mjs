import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { makePasswordHash } from "../lib/auth.mjs";

const terminal = createInterface({ input: stdin, output: stdout });
const password = await terminal.question("Password to hash: ");
terminal.close();
if (!password || password.length > 256) throw new Error("Use a password between 1 and 256 characters.");
stdout.write(`${makePasswordHash(password)}\n`);
