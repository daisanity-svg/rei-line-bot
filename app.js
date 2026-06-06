require('dotenv').config();
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const express=require('express');
const cors=require('cors');

const app=express();
app.use(cors());
app.use(express.json({limit:'10mb'}));

const PORT=Number(process.env.PORT||3000);
const DATA_DIR=process.env.DATA_DIR||'./data';
const CASE_FILE=process.env.CASE_FILE||path.join(DATA_DIR,'cases.json');
const PUBLIC_BASE_URL=process.env.PUBLIC_BASE_URL||'';
const LINE_TOKEN=process.env.LINE_CHANNEL_ACCESS_TOKEN||'';
const LINE_SECRET=process.env.LINE_CHANNEL_SECRET||'';
const OPENAI_API_KEY=process.env.OPENAI_API_KEY||'';
const OPENAI_MODEL=process.env.OPENAI_MODEL||'gpt-5.5';

fs.mkdirSync(DATA_DIR,{recursive:true});
if(!fs.existsSync(CASE_FILE)) fs.writeFileSync(CASE_FILE,JSON.stringify({cases:{},userCurrentCase:{}},null,2));

const load=()=>{try{return JSON.parse(fs.readFileSync(CASE_FILE,'utf8'))}catch{return{cases:{},userCurrentCase:{}}}};
const save=s=>{fs.mkdirSync(path.dirname(CASE_FILE),{recursive:true});fs.writeFileSync(CASE_FILE,JSON.stringify(s,null,2));};
const money=n=>Math.round(n||0).toLocaleString('zh-TW');
const wan=n=>`${money(Math.round((n||0)/10000))}萬`;
const pct=(v,d=2)=>`${((v||0)*100).toFixed(d)}%`;
function num(raw){if(raw==null)return undefined;const s=String(raw).replace(/[,，\s]/g,'');const m=s.match(/-?\d+(\.\d+)?/);if(!m)return undefined;let n=Number(m[0]);if(s.includes('萬'))n*=10000;else if(s.includes('%'))n/=100;return n;}
function after(t,labels){for(const l of labels){const m=t.match(new RegExp(`${l}\\s*[:：]?\\s*([^\\n\\r]+)`,'i'));if(m)return m[1].trim();}return undefined;}
const moneyAfter=(t,l)=>{const r=after(t,l);return r?num(r):undefined};
const pingAfter=(t,l)=>moneyAfter(t,l);
const clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined&&v!==''));
const hasUrl=t=>/(https?:\/\/[^\s]+)/i.test(t||'');
const firstUrl=t=>((t||'').match(/https?:\/\/[^\s]+/i)||[])[0];

function parse(t){
 const parkingMatch=t.match(/(坡道平面|坡平|坡道機械|坡機|機械車位|昇降機械|平面式|平面車位)/);
 const parkingType=parkingMatch?parkingMatch[1].replace('坡平','坡道平面').replace('坡機','坡道機械').replace('平面式','坡道平面').replace('平面車位','坡道平面'):undefined;
 return clean({
  projectName:after(t,['建案','案名','社區','projectName']),
  layout:after(t,['房型','格局','layout']), propertyType:'待確認',
  listingPrice:moneyAfter(t,['開價','總價','售價','listingPrice']), targetPrice:moneyAfter(t,['成交價','試算價','targetPrice']),
  totalAreaPing:pingAfter(t,['權狀坪數','權狀','總坪數','建坪','totalAreaPing']),
  mainBuildingAreaPing:pingAfter(t,['主建物坪數','主建物','室內坪數','mainBuildingAreaPing']),
  hasParking:/車位|房車|坡道|坡平|坡機|機械|平面式/.test(t), parkingType,
  parkingAreaPing:pingAfter(t,['車位坪數','車位坪','車位','parkingAreaPing']), parkingPrice:moneyAfter(t,['車位價格','車位價','parkingPrice']),
  monthlyRent:moneyAfter(t,['月租金','租金','monthlyRent']), sellerOriginalPrice:moneyAfter(t,['前手取得價','原始取得價','取得價','sellerOriginalPrice']),
  loanToValue:num(after(t,['貸款成數','成數','loanToValue'])), interestRate:num(after(t,['利率','貸款利率','interestRate'])), loanYears:num(after(t,['貸款年期','年期','loanYears'])),
  sellerServiceFeeRate:num(after(t,['賣方服務費','sellerServiceFeeRate'])), buyerServiceFeeRate:num(after(t,['買方服務費','buyerServiceFeeRate'])),
  ownershipRegistrationDate:after(t,['成屋登記日','所有權登記日','ownershipRegistrationDate'])
 });
}
function makeCase(userId,input){const s=load(),id=`case_${Date.now()}`;const c={caseId:id,userId,status:'draft',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),notes:['文字規則擷取結果；截圖 / URL 可由 AI 擷取後再進入同一套試算。'],...input};s.cases[id]=c;s.userCurrentCase[userId]=id;save(s);return c;}
function current(userId){const s=load();return s.cases[s.userCurrentCase[userId]];}
function byId(id){return load().cases[id];}
function update(id,patch){const s=load(),c=s.cases[id];if(!c)return;Object.assign(c,patch,{updatedAt:new Date().toISOString()});s.cases[id]=c;save(s);return c;}
function pay(p,rate,years){const r=rate/12,n=years*12;if(!r)return p/n;return p*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);}
function taxRate(date){if(!date)return .45;const d=new Date(date);if(isNaN(d))return .45;const y=(Date.now()-d.getTime())/(365.25*24*3600*1000);return y<=2?.45:y<=5?.35:y<=10?.20:.15;}
function calc(c){
 const target=c.targetPrice||11500000,total=c.totalAreaPing||1,pa=c.parkingAreaPing||(c.hasParking?8:0),pp=c.parkingPrice||(c.hasParking?1800000:0);
 const hp=target-pp,ha=Math.max(total-pa,.01),surface=(c.listingPrice||target)/total,hunit=hp/ha,munit=c.mainBuildingAreaPing?hp/c.mainBuildingAreaPing:hunit;
 const rent=c.monthlyRent||0,annual=rent*12,gross=annual/target,ltv=c.loanToValue??.6,ir=c.interestRate??.0265,yrs=c.loanYears??30,loan=target*ltv,mp=pay(loan,ir,yrs);
 const vacancy=rent*.05,mgmt=c.managementFee||3000,effective=rent-vacancy-mgmt-(c.repairReserveMonthly||0),oop=mp-effective;
 const tr=taxRate(c.ownershipRegistrationDate),orig=c.sellerOriginalPrice||0,taxable=Math.max(target-orig-500000,0),tax=taxable*tr,fee=target*(c.sellerServiceFeeRate??.02),net=target-tax-fee,profit=net-orig;
 const bestLow=Math.round((annual/.026)/50000)*50000,bestHigh=Math.round((annual/.024)/50000)*50000,accHigh=Math.round((annual/.022)/50000)*50000,hard=Math.max(12000000,accHigh);
 const score=Math.max(0,Math.min(100,Math.round(75-Math.max(0,(target-bestHigh)/100000)-Math.max(0,oop/1000))));
 const risks=[];if((c.listingPrice||0)>hard)risks.push('目前開價高於投資硬上限，投資戶不宜用開價追價。');if(!c.parkingAreaPing||!c.parkingPrice)risks.push('車位坪數或車位價格尚未完全確認，需拆車位後判斷住宅本體單價。');if(!c.ownershipRegistrationDate)risks.push('成屋登記日待確認；預售實登日不可直接作為房地合一稅起算點。');if(oop>10000)risks.push('租後自補偏高，現金流壓力需留意。');
 return {targetPrice:target,unitPrice:{surfaceUnitPrice:surface,housingPrice:hp,housingAreaPing:ha,housingUnitPrice:hunit,mainBuildingUnitPrice:munit},rentYield:{annualRent:annual,grossYield:gross},loan:{loanAmount:loan,monthlyPayment:mp},cashflow:{vacancyReserve:vacancy,managementFee:mgmt,effectiveRent:effective,monthlyOutOfPocket:oop},sellerTax:{taxRate:tr,taxableGain:taxable,tax,sellerFee:fee,sellerNetProceeds:net,sellerNetProfit:profit},decision:{conclusion:score>=75?'可談':score>=55?'可談需壓價':'不建議追價',score,bestPriceRange:[bestLow,bestHigh],acceptablePriceRange:[bestHigh,accHigh],hardCapPrice:hard,notRecommendedAbove:hard,negotiation:{firstOffer:bestLow,seriousOfferRange:[bestLow,bestHigh],finalCap:hard},riskFlags:risks}};
}
function confirm(c){return `📌 已建立物件草稿\n\n建案｜${c.projectName||'待確認'}\n房型｜${c.layout||'待確認'}\n開價｜${c.listingPrice?wan(c.listingPrice):'待確認'}\n權狀｜${c.totalAreaPing||'待確認'}坪\n主建物｜${c.mainBuildingAreaPing||'待確認'}坪\n車位｜${c.parkingType||(c.hasParking?'有，類型待確認':'待確認')}\n月租｜${c.monthlyRent?money(c.monthlyRent)+'元':'待確認'}\n\n🔎 需補確認｜車位坪數、車位價格、成屋登記日\n⚠️ 單價口徑提醒｜含車位物件不能直接採用資料表單價，需扣除車位坪數與車位價格後再判斷住宅本體單價。\n\n可回覆：修正：成交價：1150萬 車位坪數：8坪 車位價格：180萬\n或輸入：重新試算`;}
function result(c,r,full=false){const d=r.decision,u=r.unitPrice,y=r.rentYield,l=r.loan,cf=r.cashflow,st=r.sellerTax,risks=d.riskFlags.length?d.riskFlags.map(x=>'・'+x).join('\n'):'・目前未偵測到重大資料缺口。';return `${full?'房產投資評估報告\n\n':''}📌 投資結論｜${d.conclusion}\n評分｜${d.score}/100\n\n✅ 先看重點\n最佳取得價｜${wan(d.bestPriceRange[0])}～${wan(d.bestPriceRange[1])}\n可接受價｜${wan(d.acceptablePriceRange[0])}～${wan(d.acceptablePriceRange[1])}\n投資硬上限｜${wan(d.hardCapPrice)}\n目前開價｜${c.listingPrice?wan(c.listingPrice):'待確認'}${c.listingPrice&&c.listingPrice>d.hardCapPrice?'（偏高）':''}\n\n🚗 車位與單價拆算\n表面單價｜${(u.surfaceUnitPrice/10000).toFixed(1)}萬/坪\n住宅本體單價｜${(u.housingUnitPrice/10000).toFixed(1)}萬/坪\n主建物單價｜${(u.mainBuildingUnitPrice/10000).toFixed(1)}萬/主建坪\n\n💰 投報與現金流\n取得價｜${wan(r.targetPrice)}\n毛投報｜${pct(y.grossYield)}\n月還款｜${money(l.monthlyPayment)}元\n有效月租｜${money(cf.effectiveRent)}元\n每月自補｜${money(cf.monthlyOutOfPocket)}元\n\n🏦 貸款與稅務\n貸款金額｜${wan(l.loanAmount)}\n屋主房地合一稅率｜${pct(st.taxRate,0)}\n屋主房地合一稅｜${wan(st.tax)}\n屋主稅後獲利｜${wan(st.sellerNetProfit)}\n\n🧭 議價策略\n第一口｜${wan(d.negotiation.firstOffer)}\n認真談｜${wan(d.negotiation.seriousOfferRange[0])}～${wan(d.negotiation.seriousOfferRange[1])}\n最後上限｜${wan(d.negotiation.finalCap)}\n\n⚠️ 主要風險\n${risks}\n\n可輸入：重新試算 / 修正：成交價：1100萬 / 產出報告`;}

async function openaiExtractFromImage(base64,mime='image/jpeg'){
 if(!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY_NOT_SET');
 const prompt='請讀取這張台灣房屋物件截圖，擷取可見欄位。只輸出純文字，每行格式為「欄位：值」。需要欄位：建案、開價、房型、權狀坪數、主建物坪數、車位、車位坪數、車位價格、月租金、前手取得價。看不到就寫「待確認」。不要解釋。';
 const body={model:OPENAI_MODEL,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:`data:${mime};base64,${base64}`}]}]};
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${OPENAI_API_KEY}`},body:JSON.stringify(body)});
 const j=await r.json(); if(!r.ok) throw new Error(j.error?.message||'OpenAI image extraction failed');
 return j.output_text || (j.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('\n');
}
async function openaiExtractFromText(text){
 if(!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY_NOT_SET');
 const prompt=`請從以下台灣房屋物件網頁文字或網址內容擷取物件資料。只輸出純文字，每行格式為「欄位：值」。需要欄位：建案、開價、房型、權狀坪數、主建物坪數、車位、車位坪數、車位價格、月租金、前手取得價。看不到就寫「待確認」。\n\n資料：\n${text.slice(0,12000)}`;
 const body={model:OPENAI_MODEL,input:prompt};
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${OPENAI_API_KEY}`},body:JSON.stringify(body)});
 const j=await r.json(); if(!r.ok) throw new Error(j.error?.message||'OpenAI text extraction failed');
 return j.output_text || (j.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('\n');
}
async function fetchUrlText(url){
 const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 REI-Line-Bot/1.0'}});
 const html=await r.text();
 return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,20000);
}
async function downloadLineContent(messageId){
 const r=await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`,{headers:{Authorization:`Bearer ${LINE_TOKEN}`}});
 if(!r.ok) throw new Error(`LINE image download failed: ${r.status}`);
 const ct=r.headers.get('content-type')||'image/jpeg';
 const buf=Buffer.from(await r.arrayBuffer());
 return {base64:buf.toString('base64'),mime:ct};
}
async function handle(userId,text){
 const t=(text||'').trim();
 if(t==='新增物件')return'請貼上 591 截圖文字、仲介物件資料、實價登錄資料，或直接傳送物件截圖。';
 if(t==='目前案件'){const c=current(userId);return c?confirm(c):'目前沒有案件。請輸入「新增物件」。';}
 if(t.startsWith('修正')){const c=current(userId);if(!c)return'目前沒有案件。請先新增物件。';return'已更新資料。\n\n'+confirm(update(c.caseId,parse(t)));}
 if(t==='重新試算'){const c=current(userId);if(!c)return'目前沒有案件。請先新增物件。';return result(c,calc(c));}
 if(t==='產出報告'){const c=current(userId);if(!c)return'目前沒有案件。請先新增物件。';return result(c,calc(c),true)+'\n\n03｜系統判斷備註\n本報告為投資評估初判，若車位坪數、車位價格、成屋登記日或實際貸款條件異動，應重新修正並試算。';}
 if(hasUrl(t)){
  if(!OPENAI_API_KEY)return'我收到網址了，但目前尚未設定 OPENAI_API_KEY，無法自動讀取網址內容。請先貼物件文字，或到 Render 新增 OPENAI_API_KEY。';
  try{const raw=await fetchUrlText(firstUrl(t));const extracted=await openaiExtractFromText(raw);return '已讀取網址並建立物件草稿。\n\n'+confirm(makeCase(userId,parse(extracted)));}
  catch(e){return `網址讀取失敗：${e.message}\n建議改傳截圖或直接貼物件文字。`;}
 }
 const input=parse(t);if(Object.keys(input).length>=2)return confirm(makeCase(userId,input));return'我看不懂這段指令。可輸入：新增物件、目前案件、修正：...、重新試算、產出報告，或直接傳送物件截圖。';
}
async function handleImage(userId,messageId){
 if(!OPENAI_API_KEY)return'我收到截圖了，但目前尚未設定 OPENAI_API_KEY，無法讀圖。請到 Render 新增 OPENAI_API_KEY，或先貼上文字資料。';
 try{const img=await downloadLineContent(messageId);const extracted=await openaiExtractFromImage(img.base64,img.mime);const c=makeCase(userId,parse(extracted));c.notes.push('由 LINE 圖片訊息透過 OpenAI Vision 擷取。');update(c.caseId,{notes:c.notes,source:'line_image',extractedText:extracted});return '已讀取截圖並建立物件草稿。\n\n'+confirm(c);}
 catch(e){return `截圖讀取失敗：${e.message}\n可改貼截圖文字，或確認 Render 已設定 OPENAI_API_KEY。`;}
}
async function lineReply(token,text){if(!LINE_TOKEN||!token){console.log('[LINE disabled] Reply:',text);return;}await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${LINE_TOKEN}`},body:JSON.stringify({replyToken:token,messages:[{type:'text',text:String(text).slice(0,4900)}]})});}
function verify(req){if(!LINE_SECRET)return true;const sig=req.get('x-line-signature');const body=JSON.stringify(req.body);const hash=crypto.createHmac('sha256',LINE_SECRET).update(body).digest('base64');return sig===hash;}
app.get('/health',(_q,res)=>res.json({ok:true,service:'real-estate-investment-bot',env:{port:PORT,dataDir:DATA_DIR,publicBaseUrl:PUBLIC_BASE_URL||'未設定',lineEnabled:Boolean(LINE_TOKEN&&LINE_SECRET),openaiEnabled:Boolean(OPENAI_API_KEY),openaiModel:OPENAI_API_KEY?OPENAI_MODEL:'未設定',lineStatus:LINE_TOKEN?'LINE Token 已設定':'LINE 未啟用；目前會在 console 顯示回覆'}}));
app.post('/api/message/test',async(req,res)=>{const{userId='test_user',text=''}=req.body||{};res.json({userId,reply:await handle(userId,text)});});
app.post('/api/line/webhook',async(req,res)=>{if(!verify(req))return res.status(401).json({error:'Invalid LINE signature'});for(const e of req.body?.events||[]){if(e.type==='message'&&e.message?.type==='text'){await lineReply(e.replyToken,await handle(e.source?.userId||'line_user',e.message.text));}else if(e.type==='message'&&e.message?.type==='image'){await lineReply(e.replyToken,await handleImage(e.source?.userId||'line_user',e.message.id));}}res.json({ok:true});});
app.post('/api/cases/extract',(req,res)=>{const c=makeCase(req.body?.userId||'api_user',parse(req.body?.text||''));res.json({case:c,message:confirm(c)});});
app.patch('/api/cases/:caseId/revise',(req,res)=>{const c=update(req.params.caseId,parse(req.body?.text||''));if(!c)return res.status(404).json({error:'case not found'});res.json({case:c,message:confirm(c)});});
app.post('/api/cases/:caseId/calculate',(req,res)=>{const c=byId(req.params.caseId);if(!c)return res.status(404).json({error:'case not found'});res.json({result:calc(c)});});
app.post('/api/cases/:caseId/calculate/text',(req,res)=>{const c=byId(req.params.caseId);if(!c)return res.status(404).send('case not found');res.type('text/plain').send(result(c,calc(c)));});
app.get('/api/reports/:caseId/text',(req,res)=>{const c=byId(req.params.caseId);if(!c)return res.status(404).send('case not found');res.type('text/plain').send(result(c,calc(c),true));});
app.listen(PORT,()=>console.log(`REI bot listening on http://localhost:${PORT}`));
