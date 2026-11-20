export async function onRequestPost({request,env}) {
 const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
 if(!env.OPENAI_API_KEY) return reply({error:"מפתח ה-API טרם הוגדר."},503);
 if(env.AMALIA_ENABLED!=="true") return reply({error:"משתנה ההפעלה טרם זמין בפריסה."},503);
 if(request.headers.get("Origin")!==new URL(request.url).origin) return reply({error:"בקשה לא מורשית."},403);
 if(!env.AMALIA_DB) return reply({error:"מסד מגבלת השימוש טרם זמין בפריסה."},503);
 let stage="request";
 try {
 const raw=await request.text();if(raw.length>12000)return reply({error:"בקשה ארוכה מדי."},400);
 let d;try{d=JSON.parse(raw)}catch{return reply({error:"בקשה לא תקינה."},400)}
 const topic=typeof d?.topic==="string"?d.topic.trim():"";
 if(!topic||topic.length>1500)return reply({error:"יש להזין נושא באורך עד 1500 תווים."},400);
 stage="database";
 // Reserve quota atomically before calling the paid upstream API.
 const day=new Date().toISOString().slice(0,10), month=day.slice(0,7);
 const enc=new TextEncoder();
 const key=await crypto.subtle.importKey("raw",enc.encode(env.OPENAI_API_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("HMAC",key,enc.encode(day+"|"+(request.headers.get("CF-Connecting-IP")||"unknown")));
 const visitor=Array.from(new Uint8Array(sig),b=>b.toString(16).padStart(2,"0")).join("");
 const db=env.AMALIA_DB;
 await db.prepare("CREATE TABLE IF NOT EXISTS amalia_requests (day TEXT NOT NULL, visitor TEXT NOT NULL)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS amalia_day_visitor ON amalia_requests(day,visitor)").run();
 const reservation=await db.prepare("INSERT INTO amalia_requests(day,visitor) SELECT ?1,?2 WHERE (SELECT COUNT(*) FROM amalia_requests WHERE day=?1 AND visitor=?2)<10 AND (SELECT COUNT(*) FROM amalia_requests WHERE day=?1)<100 AND (SELECT COUNT(*) FROM amalia_requests WHERE day>=?3 AND day<?4)<1000").bind(day,visitor,month+"-01",month+"-32").run();
 if(reservation.meta?.changes!==1)return reply({error:"מכסת השימוש מוצתה. נסו שוב בהמשך."},429);
 const tone=new Map([["auto","אוטומטי"],["sarcastic","סרקסטי"],["angry","נוקב"],["legal","משפטי"],["funny","קומי"],["biblical","מקראי"]]).get(d.tone)||"אוטומטי";
 const length=new Map([["short","עד 280 תווים"],["medium","עד 100 מילים"],["long","עד 220 מילים"]]).get(d.length)||"עד 100 מילים";
 const level=Math.max(1,Math.min(10,Math.round(Number(d.level)||8)));
 const prompt="כתוב פוסט סאטירי מקורי בעברית, בלשון נקבה כשנדרש. ערבב עברית גבוהה עם סלנג, אירוניה, שאלות רטוריות, מונחים משפטיים, ביטויים מקראיים וסיום קצר ועוקצני. אל תציג את הטקסט כאילו נכתב בידי אדם אמיתי. אל תמציא עובדות או האשמות; התמקד בביקורת על רעיונות והתנהגות. החזר רק את הפוסט. סגנון: "+tone+"; חדות: "+level+"/10; אורך: "+length;
 stage="openai";
 const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-4.1-mini",messages:[{role:"system",content:prompt},{role:"user",content:topic}],max_tokens:700}),signal:AbortSignal.timeout(30000)});
 if(!response.ok){
 const upstream=await response.json().catch(()=>({}));
 const code=upstream?.error?.code;
 if(code==="insufficient_quota")return reply({error:"חשבון OpenAI API ללא יתרה או מכסה זמינה (insufficient_quota)."},502);
 if(response.status===401)return reply({error:"מפתח OpenAI API אינו תקין או בוטל (401)."},502);
 if(response.status===403)return reply({error:"למפתח OpenAI API אין הרשאה מתאימה (403)."},502);
 if(response.status===404)return reply({error:"מודל OpenAI אינו זמין לחשבון (404)."},502);
 if(response.status===429)return reply({error:"OpenAI מגביל את קצב הבקשות (429)."},502);
 return reply({error:"שגיאה בשירות OpenAI ("+response.status+")."},502);
 }
 const result=await response.json();const post=result.choices?.[0]?.message?.content;
 return post?reply({post}):reply({error:"לא התקבל פוסט."},502);
 }catch{return reply({error:stage==="database"?"תקלה במסד הנתונים D1 (DB_ERROR).":stage==="openai"?"תקשורת עם OpenAI נכשלה (NETWORK_ERROR).":"תקלה בעיבוד הבקשה."},502)}
}
export function onRequestGet(){return new Response("Method not allowed",{status:405,headers:{Allow:"POST"}})}
