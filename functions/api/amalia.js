export async function onRequestPost({request,env}) {
 const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
 if(!env.GEMINI_API_KEY) return reply({error:"מפתח Gemini טרם זמין בפריסה."},503);
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
 // Reserve quota atomically before calling Gemini.
 const day=new Date().toISOString().slice(0,10), month=day.slice(0,7);
 const enc=new TextEncoder();
 const key=await crypto.subtle.importKey("raw",enc.encode(env.GEMINI_API_KEY),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
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
 stage="gemini";
 const models=["gemini-3.8-flash","gemini-3.6-flash","gemini-3.1-flash-lite"];
 let response;
 const body=JSON.stringify({systemInstruction:{parts:[{text:prompt}]},contents:[{role:"user",parts:[{text:topic}]}],generationConfig:{maxOutputTokens:2048}});
 for(let i=0;i<models.length;i++){
   if(i)await new Promise(resolve=>setTimeout(resolve,650*i));
   try{
     response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+models[i]+":generateContent",{method:"POST",headers:{"x-goog-api-key":env.GEMINI_API_KEY,"Content-Type":"application/json"},body,signal:AbortSignal.timeout(12000)});
   }catch(e){if(i===models.length-1)throw e;continue;}
   if(response.ok||![404,429,500,502,503,504].includes(response.status)||i===models.length-1)break;
   await response.body?.cancel().catch(()=>{});
 }
 if(!response)return reply({error:"לא ניתן להתחבר למודלים של Gemini כרגע."},503);
 if(!response.ok){
 if(response.status===429)return reply({error:"מכסת Gemini מוצתה. נסו שוב בהמשך."},429);
 if(response.status===400||response.status===401||response.status===403)return reply({error:"בדקו את מפתח Gemini ואת הרשאות הפרויקט ("+response.status+")."},502);
 return reply({error:"שגיאה בשירות Gemini ("+response.status+")."},502);
 }
 const result=await response.json();
 const post=result.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||"").join("").trim();
 return post?reply({post}):reply({error:"Gemini לא החזיר פוסט. נסו נושא אחר."},502);
 }catch{return reply({error:stage==="database"?"תקלה במסד הנתונים D1 (DB_ERROR).":stage==="gemini"?"תקשורת עם Gemini נכשלה (NETWORK_ERROR).":"תקלה בעיבוד הבקשה."},502)}
}
export function onRequestGet(){return new Response("Method not allowed",{status:405,headers:{Allow:"POST"}})}
