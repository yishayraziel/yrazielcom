export async function onRequestPost({request,env}) {
 const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
 if(!env.OPENAI_API_KEY) return reply({error:"מפתח OpenAI טרם זמין בפריסה."},503);
 if(env.AMALIA_ENABLED!=="true") return reply({error:"משתנה ההפעלה טרם זמין בפריסה."},503);
 if(request.headers.get("Origin")!==new URL(request.url).origin) return reply({error:"בקשה לא מורשית."},403);
 if(!env.AMALIA_DB) return reply({error:"מסד מגבלת השימוש טרם זמין בפריסה."},503);
 let stage="request";
 let db, reservationId, completed=false;
 try {
 const raw=await request.text();if(raw.length>12000)return reply({error:"בקשה ארוכה מדי."},400);
 let d;try{d=JSON.parse(raw)}catch{return reply({error:"בקשה לא תקינה."},400)}
 const topic=typeof d?.topic==="string"?d.topic.trim():"";
 if(!topic||topic.length>1500)return reply({error:"יש להזין נושא באורך עד 1500 תווים."},400);
 stage="database";
 // Reserve quota atomically before calling OpenAI.
 const day=new Date().toISOString().slice(0,10), month=day.slice(0,7);
 const enc=new TextEncoder();
 const key=await crypto.subtle.importKey("raw",enc.encode(env.OPENAI_API_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("HMAC",key,enc.encode(day+"|"+(request.headers.get("CF-Connecting-IP")||"unknown")));
 const visitor=Array.from(new Uint8Array(sig),b=>b.toString(16).padStart(2,"0")).join("");
 db=env.AMALIA_DB;
 // Versioned reservations prevent earlier failed Gemini/OpenAI attempts from counting.
 await db.prepare("CREATE TABLE IF NOT EXISTS amalia_quota_v2 (request_id TEXT PRIMARY KEY, day TEXT NOT NULL, visitor TEXT NOT NULL)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS amalia_quota_v2_day_visitor ON amalia_quota_v2(day,visitor)").run();
 reservationId=crypto.randomUUID();
 const reservation=await db.prepare("INSERT INTO amalia_quota_v2(request_id,day,visitor) SELECT ?1,?2,?3 WHERE (SELECT COUNT(*) FROM amalia_quota_v2 WHERE day=?2 AND visitor=?3)<50 AND (SELECT COUNT(*) FROM amalia_quota_v2 WHERE day=?2)<100 AND (SELECT COUNT(*) FROM amalia_quota_v2 WHERE day>=?4 AND day<?5)<1000").bind(reservationId,day,visitor,month+"-01",month+"-32").run();
 if(reservation.meta?.changes!==1){reservationId=null;return reply({error:"המכסה היומית או החודשית של האתר נוצלה. נסו שוב לאחר חידוש המכסה."},429);}
 const tone=new Map([["auto","אוטומטי"],["sarcastic","סרקסטי"],["angry","נוקב"],["legal","משפטי"],["funny","קומי"],["biblical","מקראי"]]).get(d.tone)||"אוטומטי";
 const length=new Map([["short","עד 280 תווים"],["medium","עד 100 מילים"],["long","עד 220 מילים"]]).get(d.length)||"עד 100 מילים";
 const level=Math.max(1,Math.min(10,Math.round(Number(d.level)||8)));
 const prompt="כתוב פוסט סאטירי מקורי בעברית, בלשון נקבה כשנדרש. ערבב עברית גבוהה עם סלנג, אירוניה, שאלות רטוריות, מונחים משפטיים, ביטויים מקראיים וסיום קצר ועוקצני. אל תציג את הטקסט כאילו נכתב בידי אדם אמיתי. אל תמציא עובדות או האשמות; התמקד בביקורת על רעיונות והתנהגות. החזר רק את הפוסט. סגנון: "+tone+"; חדות: "+level+"/10; אורך: "+length;
 stage="openai";
 const response=await fetch("https://api.openai.com/v1/responses",{
  method:"POST",
  headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},
  body:JSON.stringify({
   model:"gpt-5.4-mini",
   instructions:prompt,
   input:topic,
   max_output_tokens:600,
   reasoning:{effort:"low"}
  }),
  signal:AbortSignal.timeout(25000)
 });
 if(!response.ok){
   const err=await response.json().catch(()=>({}));
   const code=err?.error?.code;
   if(code==="insufficient_quota")return reply({error:"אין יתרה זמינה בחשבון OpenAI API. בדקו Billing."},503);
   if(response.status===401)return reply({error:"מפתח OpenAI אינו תקין או בוטל (401)."},502);
   if(response.status===403)return reply({error:"אין הרשאה למודל OpenAI בחשבון (403)."},502);
   if(response.status===404)return reply({error:"מודל OpenAI אינו זמין לחשבון (404)."},502);
   if(response.status===429)return reply({error:"מגבלת הבקשות של OpenAI הושגה (429)."},429);
   return reply({error:"שגיאה בשירות OpenAI ("+response.status+")."},502);
 }
 const result=await response.json();
 const post=(result.output||[]).flatMap(o=>o.content||[]).filter(x=>x.type==="output_text").map(x=>x.text||"").join("\n").trim();
 if(post){completed=true;return reply({post});}
 return reply({error:"OpenAI לא החזיר פוסט. נסו שוב."},502);
 }catch{return reply({error:stage==="database"?"תקלה במסד הנתונים D1 (DB_ERROR).":stage==="openai"?"תקשורת עם OpenAI נכשלה (NETWORK_ERROR).":"תקלה בעיבוד הבקשה."},502)}
 finally {if(reservationId&&!completed&&db){try{await db.prepare("DELETE FROM amalia_quota_v2 WHERE request_id=?1").bind(reservationId).run()}catch(e){console.error("Quota refund failed",e)}}}
}
export function onRequestGet(){return new Response("Method not allowed",{status:405,headers:{Allow:"POST"}})}
