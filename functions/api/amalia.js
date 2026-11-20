export async function onRequestPost({request,env}) {
 const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
 if(!env.OPENAI_API_KEY || env.AMALIA_ENABLED!=="true") return reply({error:"המנוע טרם הופעל."},503);
 if(request.headers.get("Origin")!==new URL(request.url).origin) return reply({error:"בקשה לא מורשית."},403);
 if(!env.AMALIA_RATE_LIMITER) return reply({error:"מגבלת השימוש טרם הוגדרה."},503);
 try {
 const {success}=await env.AMALIA_RATE_LIMITER.limit({key:request.headers.get("CF-Connecting-IP")||"unknown"});
 if(!success)return reply({error:"יותר מדי בקשות. נסו שוב בהמשך."},429);
 const raw=await request.text();if(raw.length>12000)return reply({error:"בקשה ארוכה מדי."},400);
 let d;try{d=JSON.parse(raw)}catch{return reply({error:"בקשה לא תקינה."},400)}
 const topic=typeof d?.topic==="string"?d.topic.trim():"";
 if(!topic||topic.length>1500)return reply({error:"יש להזין נושא באורך עד 1500 תווים."},400);
 const tone=new Map([["auto","אוטומטי"],["sarcastic","סרקסטי"],["angry","נוקב"],["legal","משפטי"],["funny","קומי"],["biblical","מקראי"]]).get(d.tone)||"אוטומטי";
 const length=new Map([["short","עד 280 תווים"],["medium","עד 100 מילים"],["long","עד 220 מילים"]]).get(d.length)||"עד 100 מילים";
 const level=Math.max(1,Math.min(10,Math.round(Number(d.level)||8)));
 const prompt="כתוב פוסט סאטירי מקורי בעברית, בלשון נקבה כשנדרש. ערבב עברית גבוהה עם סלנג, אירוניה, שאלות רטוריות, מונחים משפטיים, ביטויים מקראיים וסיום קצר ועוקצני. אל תציג את הטקסט כאילו נכתב בידי אדם אמיתי. אל תמציא עובדות או האשמות; התמקד בביקורת על רעיונות והתנהגות. החזר רק את הפוסט. סגנון: "+tone+"; חדות: "+level+"/10; אורך: "+length;
 const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:env.OPENAI_MODEL||"gpt-4.1-mini",messages:[{role:"system",content:prompt},{role:"user",content:topic}],max_tokens:700}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)return reply({error:"לא ניתן לחולל פוסט כרגע."},502);
 const result=await response.json();const post=result.choices?.[0]?.message?.content;
 return post?reply({post}):reply({error:"לא התקבל פוסט."},502);
 }catch{return reply({error:"לא ניתן לחולל פוסט כרגע."},502)}
}
export function onRequestGet(){return new Response("Method not allowed",{status:405,headers:{Allow:"POST"}})}
