import http from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUBLIC = join(ROOT, "public");
const DATA = join(ROOT, "data");
const UPLOADS = join(DATA, "uploads");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024;
const TTL_HOURS = Number(process.env.TTL_HOURS || 24);
const META = join(DATA, "images.json");
const types = new Map([["image/jpeg",".jpg"],["image/png",".png"],["image/webp",".webp"],["image/gif",".gif"],["image/avif",".avif"],["image/heic",".heic"]]);
await mkdir(UPLOADS,{recursive:true});
async function metadata(){try{return JSON.parse(await readFile(META,"utf8"));}catch{return []}}
async function save(rows){await writeFile(META,JSON.stringify(rows,null,2));}
function send(res,status,data,headers={}){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers});res.end(JSON.stringify(data));}
function safeEqual(a,b){const x=Buffer.from(a||"");const y=Buffer.from(b||"");return x.length===y.length&&timingSafeEqual(x,y);}
async function cleanup(){const rows=await metadata();const now=Date.now();const keep=[];for(const row of rows){if(row.expiresAt<=now){await unlink(join(UPLOADS,row.diskName)).catch(()=>{});}else keep.push(row);}if(keep.length!==rows.length)await save(keep);}
setInterval(()=>cleanup().catch(console.error),15*60*1000).unref();
function token(){return randomBytes(24).toString("hex");}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(req.method==="GET"&&url.pathname==="/api/health")return send(res,200,{ok:true,name:"ImageBridge",maxUploadMB:MAX_BYTES/1048576,ttlHours:TTL_HOURS});
  if(req.method==="POST"&&url.pathname==="/api/images"){
    const mime=(req.headers["content-type"]||"").split(";")[0].toLowerCase();
    if(!types.has(mime))return send(res,415,{error:"Unsupported image type. Use JPEG, PNG, WEBP, GIF, AVIF or HEIC."});
    const declared=Number(req.headers["content-length"]||0);if(declared>MAX_BYTES)return send(res,413,{error:"Image exceeds upload limit."});
    const id=randomUUID(), accessToken=token(), diskName=id+types.get(mime), path=join(UPLOADS,diskName);
    let size=0, failed=false;
    const out=createWriteStream(path,{flags:"wx"});
    req.on("data",chunk=>{size+=chunk.length;if(size>MAX_BYTES&&!failed){failed=true;req.destroy();out.destroy();}});
    req.pipe(out);
    out.on("error",async()=>{await unlink(path).catch(()=>{});if(!res.headersSent)send(res,413,{error:"Upload failed or file too large."});});
    out.on("finish",async()=>{if(failed||size===0){await unlink(path).catch(()=>{});if(!res.headersSent)send(res,400,{error:"Empty or invalid upload."});return;}
      const row={id,diskName,name:basename(decodeURIComponent(req.headers["x-file-name"]||"image"+types.get(mime))).slice(0,160),mime,size,token:accessToken,createdAt:Date.now(),expiresAt:Date.now()+TTL_HOURS*3600000};
      const rows=await metadata();rows.unshift(row);await save(rows);
      send(res,201,{id,name:row.name,mime,size,createdAt:row.createdAt,expiresAt:row.expiresAt,url:`/api/images/${id}?token=${accessToken}`,deleteUrl:`/api/images/${id}?token=${accessToken}`});
    });return;
  }
  const match=url.pathname.match(/^\/api\/images\/([\w-]+)$/);
  if(match){
    const rows=await metadata(),row=rows.find(x=>x.id===match[1]);
    if(!row||row.expiresAt<=Date.now())return send(res,404,{error:"Image not found or expired."});
    if(!safeEqual(url.searchParams.get("token"),row.token))return send(res,403,{error:"Invalid access token."});
    if(req.method==="GET"){res.writeHead(200,{"content-type":row.mime,"content-length":row.size,"cache-control":"private, max-age=60","x-content-type-options":"nosniff","content-disposition":"inline"});return createReadStream(join(UPLOADS,row.diskName)).pipe(res);}
    if(req.method==="DELETE"){await unlink(join(UPLOADS,row.diskName)).catch(()=>{});await save(rows.filter(x=>x.id!==row.id));return send(res,200,{ok:true,deleted:row.id});}
  }
  if(req.method==="GET"&&url.pathname==="/api/history"){const rows=await metadata();return send(res,200,{images:rows.filter(x=>x.expiresAt>Date.now()).map(({id,name,mime,size,createdAt,expiresAt})=>({id,name,mime,size,createdAt,expiresAt}))});}
  if(req.method==="GET"){
    const file=url.pathname==="/"?"index.html":url.pathname.slice(1);
    if(file.includes("..")||file.includes("\\"))return send(res,400,{error:"Bad path"});
    try{const path=join(PUBLIC,file);const info=await stat(path);if(!info.isFile())throw Error();const ext=extname(path);const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml"}[ext]||"application/octet-stream";res.writeHead(200,{"content-type":mime,"x-content-type-options":"nosniff"});return createReadStream(path).pipe(res);}catch{return send(res,404,{error:"Not found"});}
  }
  send(res,405,{error:"Method not allowed"});
});
server.listen(PORT,HOST,()=>console.log(`ImageBridge running at http://${HOST}:${PORT}`));
