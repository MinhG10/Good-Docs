/* Good Docs v4: Google Identity Services + Google Sheets REST API.
   Two-slot snapshot storage: inactive slot is fully written BEFORE active pointer changes.
   This avoids partially updated snapshots if a request fails, but is NOT a transaction
   across concurrent browsers; the caller must compare revisions and reload conflicts. */
'use strict';
window.GoodDocsCloud = (() => {
  const CFG = window.GOODDOCS_CONFIG;
  const BASE = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const NAMES = ['Settings','Notes_A','Chunks_A','Dictionary_A','Notes_B','Chunks_B','Dictionary_B'];
  const CHUNK = 30000;
  let accessToken = null;
  let tokenExpiry = 0;
  let tokenClient = null;

  function validateConfig() {
    if (!CFG?.clientId || !CFG?.spreadsheetId || CFG.clientId.includes('PASTE_') || CFG.spreadsheetId.includes('PASTE_'))
      throw new Error('Hãy điền clientId và spreadsheetId trong config.js trước.');
  }
  async function waitForGIS() {
    for (let i=0;i<50;i++) {
      if (window.google?.accounts?.oauth2) return;
      await new Promise(r => setTimeout(r,100));
    }
    throw new Error('Không tải được Google Identity Services. Hãy kiểm tra kết nối mạng.');
  }
  async function connect() {
    validateConfig();
    await waitForGIS();
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CFG.clientId, scope: CFG.scope,
        callback: () => {}
      });
    }
    return new Promise((resolve,reject) => {
      tokenClient.callback = (response) => {
        if (response.error) return reject(new Error(response.error_description || response.error));
        accessToken = response.access_token;
        tokenExpiry = Date.now() + (Number(response.expires_in || 3600) - 60) * 1000;
        resolve(true);
      };
      try { 
tokenClient.requestAccessToken({
    prompt: ''
});
 }
      catch(err){reject(err);}
    });
  }
  async function api(path, options={}) {
    if (!accessToken || Date.now()>tokenExpiry) {
      accessToken=null;
      throw new Error('Phiên Google đã hết hạn. Nhấn “Kết nối Google” để cấp quyền lại.');
    }
    const res=await fetch(BASE+encodeURIComponent(CFG.spreadsheetId)+path,{
      ...options,headers:{'Authorization':`Bearer ${accessToken}`,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}
    });
    const raw=await res.text();
    let body={}; try {body=raw?JSON.parse(raw):{};}catch{body={message:raw};}
    if(!res.ok) {
      if(res.status===401) accessToken=null;
      throw new Error(body?.error?.message || body.message || `Google Sheets HTTP ${res.status}`);
    }
    return body;
  }
  const range = s => encodeURIComponent(s);
  const values = (r) => api(`/values/${range(r)}`);
  const batchGet = (ranges) => api('/values:batchGet?'+ranges.map(r=>'ranges='+range(r)).join('&'));
  const batchUpdate = (data) => api('/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});
  const batchClear = (ranges) => api('/values:batchClear',{method:'POST',body:JSON.stringify({ranges})});
  function records(result){return result?.values || [];}
  function encode(text) {
    const bytes=new TextEncoder().encode(String(text || ''));
    const blocks=[];
    for(let i=0;i<bytes.length;i+=8192) blocks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
    return btoa(blocks.join(''));
  }
  function decode(encoded) {
    const str=atob(encoded); const bytes=new Uint8Array(str.length);
    for(let i=0;i<str.length;i++)bytes[i]=str.charCodeAt(i);
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }
  function chunks(str) {const out=[];for(let i=0;i<str.length;i+=CHUNK)out.push(str.slice(i,i+CHUNK));return out;}
  async function ensureSchema() {
    const info=await api('?fields=sheets.properties.title');
    const existing=new Set((info.sheets||[]).map(x=>x.properties?.title));
    const missing=NAMES.filter(x=>!existing.has(x));
    if(missing.length) await api(':batchUpdate',{method:'POST',body:JSON.stringify({requests:missing.map(title=>({addSheet:{properties:{title,gridProperties:{rowCount:20000,columnCount:10}}}}))})});
    const s=records(await values('Settings!A1:B3'));
    if(s[0]?.[0]!=='active') {
      await batchUpdate([{range:'Settings!A1:B3',values:[['active','A'],['revision','0'],['updatedAt','']]}]);
    }
  }
  async function head() {
    const r=records(await values('Settings!A1:B3'));
    if(r[0]?.[0]!=='active') throw new Error('Sheet Settings chưa được khởi tạo.');
    return {slot:r[0]?.[1]==='B'?'B':'A',revision:Number(r[1]?.[1]||0),updatedAt:r[2]?.[1]||''};
  }
  async function readSlot(slot) {
    const ranges=[`Notes_${slot}!A1:D`, `Chunks_${slot}!A1:C`, `Dictionary_${slot}!A1:E`];
    const data=(await batchGet(ranges)).valueRanges||[];
    const noteRows=records(data[0]).slice(1), chunkRows=records(data[1]).slice(1), dictRows=records(data[2]).slice(1);
    const map=new Map();
    for(const [id,seq,part] of chunkRows) {
      if (!id) continue;
      if(!map.has(String(id)))map.set(String(id),[]);
      map.get(String(id)).push([Number(seq),String(part||'')]);
    }
    const notes=noteRows.filter(r=>r[0]).map(([id,title,font,count])=>{
      const parts=(map.get(String(id))||[]).sort((a,b)=>a[0]-b[0]);
      if(parts.length!==Number(count||0))throw new Error(`Ghi chú ${title}: thiếu đoạn dữ liệu (chunk).`);
      parts.forEach((p,i)=>{if(p[0]!==i)throw new Error('Sai thứ tự các đoạn dữ liệu.');});
      return {id:String(id),title:String(title||'Untitled'),fontSize:Number(font)||16,html:decode(parts.map(x=>x[1]).join(''))};
    });
    const dictionary=dictRows.filter(r=>r[0]||r[1]).map(([english,vietnamese,id,englishBold,vietnameseBold])=>({id:String(id||crypto.randomUUID()),english:String(english||''),vietnamese:String(vietnamese||''),englishBold:String(englishBold)==='true',vietnameseBold:String(vietnameseBold)==='true'}));
    return {notes,dictionary};
  }
  async function load() {
    await ensureSchema();
    const h=await head();
    try {return {...await readSlot(h.slot),revision:h.revision};}
    catch(e) {
      if(h.revision===0)throw e;
      throw new Error('Không đọc được bản dữ liệu đang hoạt động: '+e.message+' Hãy kiểm tra Google Sheets, không lưu đè.');
    }
  }
  function validate(data) {
    if(!Array.isArray(data.notes)||!Array.isArray(data.dictionary))throw new Error('Dữ liệu không hợp lệ.');
    if(data.notes.length>250||data.dictionary.length>5000)throw new Error('Vượt giới hạn 250 ghi chú hoặc 5.000 từ.');
  }
  async function save(state, expectedRevision) {
    validate(state);
    const prior=await head();
    if(prior.revision!==expectedRevision) {const e=new Error('Dữ liệu trên Google Sheets đã được thay đổi trên thiết bị khác. Hãy tải lại trước khi lưu.');e.conflict=true;throw e;}
    const next=prior.slot==='A'?'B':'A';
    const noteRows=[['id','title','fontSize','chunkCount']];
    const chunkRows=[['noteId','sequence','base64Content']];
    const dictRows=[['English','Tiếng Việt','id','EnglishBold','VietnameseBold']];
    for(const n of state.notes) {
      const html=String(n.html||'');
      if(html.length>2000000)throw new Error('Mỗi ghi chú tối đa 2 triệu ký tự HTML.');
      const parts=chunks(encode(html));
      noteRows.push([String(n.id),String(n.title||'Untitled'),Number(n.fontSize)||16,parts.length]);
      parts.forEach((part,i)=>chunkRows.push([String(n.id),i,part]));
    }
    if(chunkRows.length>10000)throw new Error('Dữ liệu có quá nhiều chunks.');
    state.dictionary.forEach(w=>dictRows.push([String(w.english||''),String(w.vietnamese||''),String(w.id),Boolean(w.englishBold),Boolean(w.vietnameseBold)]));
    // Never clear active data: update inactive slot, then flip Settings pointer.
    const newRanges=[`Notes_${next}!A:D`,`Chunks_${next}!A:C`,`Dictionary_${next}!A:E`];
    await batchClear(newRanges);
    await batchUpdate([
      {range:`Notes_${next}!A1:D${noteRows.length}`,values:noteRows},
      {range:`Chunks_${next}!A1:C${chunkRows.length}`,values:chunkRows},
      {range:`Dictionary_${next}!A1:E${dictRows.length}`,values:dictRows}
    ]);
    // Verify staging before switching active snapshot.
    const staged=await readSlot(next);
    if(staged.notes.length!==state.notes.length||staged.dictionary.length!==state.dictionary.length)
      throw new Error('Kiểm tra snapshot mới thất bại. Dữ liệu cũ vẫn an toàn.');
    const latest=await head();
    if(latest.revision!==prior.revision||latest.slot!==prior.slot){const e=new Error('Dữ liệu đã thay đổi trong lúc đang lưu. Hãy tải lại.');e.conflict=true;throw e;}
    await batchUpdate([{range:'Settings!A1:B3',values:[['active',next],['revision',String(prior.revision+1)],['updatedAt',new Date().toISOString()]]}]);
    return prior.revision+1;
  }
  return {connect,load,save,hasToken:()=>!!accessToken&&Date.now()<tokenExpiry};
})();
