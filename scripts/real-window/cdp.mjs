#!/usr/bin/env node
/**
 * 通过 WebView2 的远程调试端口在真实窗口里执行一段 JS。
 * 用法：<js> | node cdp.mjs eval <port>
 *       node cdp.mjs probe <port>     # 列出可调试目标，端口未开时退出码 1
 *
 * 之所以不用 PowerShell 的 WebSocket：Node 24 自带 WebSocket 与 fetch，
 * 少一层依赖，也避免长表达式在命令行里的引号地狱（表达式从 stdin 读）。
 */
const [mode, portArg] = process.argv.slice(2);
const port = portArg ?? "9333";

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`调试端口返回 ${response.status}`);
  return response.json();
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function evaluate(expression) {
  const targets = await listTargets();
  const page = targets.find((entry) => entry.type === "page") ?? targets[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("没有可调试的页面目标");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP 超时（15s）")), 15000);
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
          },
        }),
      );
    });
    socket.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id !== 1) return;
      clearTimeout(timer);
      resolve(payload);
    });
    socket.addEventListener("error", (event) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket 错误：${event.message ?? "unknown"}`));
    });
  });
  socket.close();

  if (result.error) throw new Error(result.error.message ?? "CDP 调用失败");
  if (result.result?.exceptionDetails) {
    const detail = result.result.exceptionDetails;
    throw new Error(detail.exception?.description ?? detail.text ?? "页面抛错");
  }
  return result.result?.result?.value;
}

try {
  if (mode === "probe") {
    const targets = await listTargets();
    console.log(JSON.stringify(targets.map((entry) => ({ type: entry.type, url: entry.url }))));
    process.exit(0);
  }
  if (mode !== "eval") {
    console.error("用法：<js> | node cdp.mjs eval <port> | node cdp.mjs probe <port>");
    process.exit(64);
  }
  const expression = await readStdin();
  if (!expression.trim()) {
    console.error("stdin 里没有表达式");
    process.exit(64);
  }
  const value = await evaluate(expression);
  console.log(JSON.stringify(value ?? null));
} catch (error) {
  console.error(String(error.message ?? error));
  process.exit(1);
}
