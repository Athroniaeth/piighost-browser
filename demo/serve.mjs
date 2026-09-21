import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = new URL("./web/", import.meta.url).pathname;
const COI = process.env.COI === "1";
const types = {".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".json":"application/json",".wasm":"application/wasm",".whl":"application/octet-stream",".onnx":"application/octet-stream",".py":"text/plain",".zip":"application/zip"};
http.createServer((req,res)=>{
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (COI) { res.setHeader("Cross-Origin-Opener-Policy","same-origin"); res.setHeader("Cross-Origin-Embedder-Policy","require-corp"); }
  res.setHeader("Access-Control-Allow-Origin","*");
  fs.readFile(p, (err,data)=>{
    if (err) { res.writeHead(404); return res.end("404 "+req.url); }
    res.writeHead(200, {"Content-Type": types[path.extname(p)] || "application/octet-stream"});
    res.end(data);
  });
}).listen(8765, ()=>console.log("serving web/ on :8765 COI="+COI));
