import nextEnv from "@next/env";
import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { openAuthDatabase } from "../src/lib/auth-config.mts";
import { provisionAccount } from "./provision-account.mts";

function passwordPrompt(label: string): Promise<string> {
  if (!stdin.isTTY) throw new Error("Account creation requires an interactive terminal.");
  stdout.write(label);
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let password = "";
    function finish() {
      stdin.removeListener("keypress", onKey);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    }
    function onKey(text: string | undefined, key: { name?: string; ctrl?: boolean }) {
      if (key.ctrl && key.name === "c") {
        finish();
        reject(new Error("Account creation cancelled."));
      } else if (key.name === "return") {
        finish();
        resolve(password);
      } else if (key.name === "backspace") {
        if (password.length) {
          password = password.slice(0, -1);
          stdout.write("\b \b");
        }
      } else if (text && !key.ctrl && !/[\x00-\x1f\x7f]/.test(text)) {
        password += text;
        stdout.write("*".repeat(text.length));
      }
    }
    stdin.on("keypress", onKey);
  });
}

nextEnv.loadEnvConfig(process.cwd());
try {
  if (!stdin.isTTY) throw new Error("Run npm run account:create in an interactive terminal.");
  const prompt = createInterface({ input: stdin, output: stdout });
  let name: string;
  let email: string;
  try {
    name = await prompt.question("Name: ");
    email = await prompt.question("Email: ");
  } finally {
    prompt.close();
  }
  const password = await passwordPrompt("Password (12-128 characters): ");
  const confirmation = await passwordPrompt("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  const database = openAuthDatabase();
  try {
    const user = await provisionAccount(database, { name, email, password });
    console.log(`Account created for ${user.email}. You can now sign in.`);
  } finally {
    database.close();
  }
} catch (error) {
  console.error("Account creation failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
