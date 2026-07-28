import { clearToken, credentialsPath, saveToken, tokenSource, verifyToken } from "../credentials.js";

// `figma-relai login` — the token never arrives as an argv value, because argv
// lands in shell history and in every `ps` on the machine. Piped stdin or an
// interactive prompt only.

const HOW_TO_GET =
  "Generate one at figma.com → Settings → Security → Personal access tokens\n" +
  "(file content read scope; add comment scopes if you want manage_comments).";

async function readSecret(): Promise<string> {
  // Piped: `pbpaste | figma-relai login` or `echo $TOKEN | figma-relai login`
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8").trim();
  }
  process.stderr.write(`${HOW_TO_GET}\n\nPaste the token (input is hidden): `);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const onData = (key: string) => {
      for (const ch of key) {
        if (ch === "\r" || ch === "\n") {
          stdin.removeListener("data", onData);
          stdin.setRawMode?.(wasRaw ?? false);
          stdin.pause();
          process.stderr.write("\n");
          resolve(buf.trim());
          return;
        }
        if (ch === "\u0003") {
          // Ctrl-C
          stdin.setRawMode?.(wasRaw ?? false);
          process.stderr.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
        else if (ch >= " ") buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

export async function runLogin(): Promise<{ exitCode: number; message: string }> {
  if (process.env.FIGMA_TOKEN?.trim()) {
    process.stderr.write(
      "Note: FIGMA_TOKEN is set in this environment and takes precedence over the stored file.\n" +
        "Remove it from the MCP config if you want the stored token to be the one used.\n\n"
    );
  }

  const token = await readSecret();
  if (!token) {
    return { exitCode: 1, message: `No token given.\n\n${HOW_TO_GET}` };
  }
  if (!token.startsWith("figd_")) {
    process.stderr.write("Warning: Figma tokens usually start with \"figd_\". Verifying anyway…\n");
  }

  const check = await verifyToken(token);
  if (!check.ok) {
    return { exitCode: 1, message: `Not saved. ${check.reason}\n\n${HOW_TO_GET}` };
  }

  const path = saveToken(token);
  return {
    exitCode: 0,
    message:
      `Saved for ${check.handle}${check.email ? ` <${check.email}>` : ""}.\n` +
      `  ${path} (0600)\n\n` +
      "manage_comments and get_design_system's library catalogs are unlocked.\n" +
      "The token stays in this process — it is never sent over the relay to the plugin.",
  };
}

export function runLogout(): { exitCode: number; message: string } {
  const source = tokenSource();
  const removed = clearToken();
  const envNote =
    source === "env"
      ? "\nFIGMA_TOKEN is still set in this environment — remove it from the MCP config too."
      : "";
  return {
    exitCode: 0,
    message: removed
      ? `Removed ${credentialsPath()}.${envNote}`
      : `No stored token to remove.${envNote}`,
  };
}
