import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("./dist/", import.meta.url).pathname;
const types = {".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".wasm":"application/wasm",".whl":"application/octet-stream",".onnx":"application/octet-stream",".py":"text/plain",".zip":"application/zip",".woff2":"font/woff2",".svg":"image/svg+xml"};
http.createServer((req,res)=>{
  let p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, "index.html");
  res.setHeader("Cross-Origin-Opener-Policy","same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy","require-corp");
  const data = fs.readFileSync(p);
  res.writeHead(200, {"Content-Type": types[path.extname(p)] || "application/octet-stream", "Content-Length": data.length});
  res.end(data);
}).listen(8766, ()=>console.log("dist sur :8766"));
