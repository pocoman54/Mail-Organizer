const cancelledSimulations = new Set();
async function emitSimulationProgress(token, processed, total, folder, stage=""){if(!token)return;try{await messenger.runtime.sendMessage({type:"simulationProgress",token,processed,total,folder,stage});}catch(e){}}

const DEFAULTS = {
  rules: [],
  log: [],
  filterStats: {},
  excludedAddressStats: {},
  settings: { enabled: false, incomingTestMode: false, stopAfterFirstMatch: true, maxLog: 25000 }
};

async function getState() {
  return await messenger.storage.local.get(DEFAULTS);
}

function text(v) { return (v ?? "").toString().toLowerCase(); }

function fieldValue(message, field) {
  switch (field) {
    case "from": return message.author || "";
    case "to": return (message.recipients || []).join(", ");
    case "cc": return (message.ccList || []).join(", ");
    case "bcc": return (message.bccList || []).join(", ");
    case "toOrCc": return [...(message.recipients || []), ...(message.ccList || [])].join(", ");
    case "subject": return message.subject || "";
    case "date": return message.date ? new Date(message.date).toISOString().slice(0,10) : "";
    case "priority": return ({highest:"Highest",high:"High",normal:"Normal",low:"Low",lowest:"Lowest",none:"Normal"})[String(message.priority||"none").toLowerCase()] || String(message.priority||"");
    case "junkStatus": return message.junk ? "Junk" : "Not Junk";
    case "junkPercent": return String(Number(message.junkScore||0));
    case "ageDays": return message.date ? String(Math.floor((Date.now()-new Date(message.date).getTime())/86400000)) : "";
    case "size": return String(Math.round(Number(message.size || 0)/1024));
    case "status": return message.flagged ? "Starred" : (message.read ? "Read" : (message.new===false ? "Unread" : "New"));
    case "tag": return (message.tags || []).join(", ");
    case "attachment": return message.hasAttachments ? "Has Attachment" : "No Attachment";
    case "allAddresses":
      return [message.author || "", ...(message.recipients || []), ...(message.ccList || []), ...(message.bccList || [])].join(", ");
    default: return "";
  }
}

function extractEmail(author="") {
  const m=String(author||"").match(/<([^>]+)>/);
  const raw=(m ? m[1] : String(author||"")).trim().replace(/^mailto:/i,"");
  const em=raw.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);
  return (em?em[0]:raw).trim().toLowerCase();
}
function extractEmails(value){
  const parts=Array.isArray(value)?value:[String(value||"")];
  const out=[];
  for(const part of parts){
    const text=String(part||"");
    const matches=text.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/ig)||[];
    if(matches.length) out.push(...matches.map(x=>x.toLowerCase()));
    else { const e=extractEmail(text); if(e&&e.includes("@")) out.push(e); }
  }
  return [...new Set(out)];
}
function conditionAddresses(message,field){
  switch(field){
    case "from": return extractEmails(message.author||"");
    case "to": return extractEmails(message.recipients||[]);
    case "cc": return extractEmails(message.ccList||[]);
    case "bcc": return extractEmails(message.bccList||[]);
    case "toOrCc": return extractEmails([...(message.recipients||[]),...(message.ccList||[])]);
    case "allAddresses": return extractEmails([message.author||"",...(message.recipients||[]),...(message.ccList||[]),...(message.bccList||[])]);
    default: return extractEmails(fieldValue(message,field));
  }
}
function contactEmails(contact) {
  const p=contact?.properties || {};
  const legacy=[p.PrimaryEmail,p.SecondEmail,p.primaryEmail,p.secondEmail].filter(Boolean);
  const vc=String(contact?.vCard||"");
  const vcardEmails=[];
  for(const line of vc.split(/\r?\n/)) {
    if(/^EMAIL(?:;[^:]*)?:/i.test(line)) vcardEmails.push(line.slice(line.indexOf(":")+1));
  }
  return [...legacy,...vcardEmails].flatMap(x=>extractEmails(x)).filter(Boolean);
}
function senderIdentity(message){
  const author=String(message?.author||"");
  const email=extractEmail(author);
  let name=author.replace(/<[^>]+>/g,"").trim().replace(/^"|"$/g,"");
  if(!name || name===email) name=email;
  return {email,name};
}
async function ensureExcludedBook(){
  const books=await messenger.addressBooks.list(false);
  let book=(books||[]).find(b=>String(b.name||"").toLowerCase()==="excludedbook");
  if(book) return book.id;
  return await messenger.addressBooks.create({name:"ExcludedBook"});
}
function vcardEscape(v){ return String(v||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;"); }
async function addEmailToExcludedBook(email,name=""){
  email=String(email||"").trim().toLowerCase(); if(!email) throw new Error("Missing email address.");
  const bookId=await ensureExcludedBook();
  const contacts=await messenger.addressBooks.contacts.list(bookId);
  if((contacts||[]).some(c=>contactEmails(c).includes(email))) return {bookId,created:false};
  const display=name && name!==email ? name : email;
  const vc=`BEGIN:VCARD\r\nVERSION:4.0\r\nFN:${vcardEscape(display)}\r\nEMAIL:${vcardEscape(email)}\r\nEND:VCARD\r\n`;
  await messenger.addressBooks.contacts.create(bookId,vc);
  return {bookId,created:true};
}
async function ensureContactInBook(bookId,email,name=""){
  email=String(email||"").trim().toLowerCase(); if(!email) throw new Error("Missing email address.");
  const contacts=await messenger.addressBooks.contacts.list(bookId);
  const found=(contacts||[]).find(c=>contactEmails(c).includes(email));
  if(found) return {contactId:found.id,created:false};
  const display=name && name!==email ? name : email;
  const vc=`BEGIN:VCARD\r\nVERSION:4.0\r\nFN:${vcardEscape(display)}\r\nEMAIL:${vcardEscape(email)}\r\nEND:VCARD\r\n`;
  const contactId=await messenger.addressBooks.contacts.create(bookId,vc);
  return {contactId,created:true};
}
async function removeUnmatchedEmails(emails){
  const done=new Set((emails||[]).map(x=>String(x||"").toLowerCase()));
  const st=await messenger.storage.local.get({moUnmatchedSenders:[]});
  const q=(st.moUnmatchedSenders||[]).filter(x=>!done.has(String(x.email||"").toLowerCase()));
  await messenger.storage.local.set({moUnmatchedSenders:q}); return q.length;
}
function unmatchedMessageKey(message,folderName=""){
  // Stable enough to prevent repeated diagnostic scans from inflating the same sender count.
  if(message?.id!==undefined && message?.id!==null) return `id:${message.id}`;
  return `fallback:${String(folderName)}|${String(message?.date||"")}|${String(message?.author||"")}|${String(message?.subject||"")}`;
}
async function captureUnmatched(message,folderName=""){
  const {email,name}=senderIdentity(message); if(!email || !email.includes("@")) return false;
  const st=await messenger.storage.local.get({moUnmatchedSenders:[]});
  const q=Array.isArray(st.moUnmatchedSenders)?st.moUnmatchedSenders:[];
  let rec=q.find(x=>String(x.email||"").toLowerCase()===email);
  const now=new Date().toISOString(), subj=String(message.subject||"").trim(), key=unmatchedMessageKey(message,folderName);
  if(!rec){rec={email,name,count:0,firstSeen:now,lastSeen:now,recentSubjects:[],folders:[],seenKeys:[]};q.push(rec);}
  rec.seenKeys=Array.isArray(rec.seenKeys)?rec.seenKeys:[];
  const alreadySeen=rec.seenKeys.includes(key);
  rec.name=name||rec.name||email; rec.lastSeen=now;
  if(!alreadySeen){rec.count=Number(rec.count||0)+1;rec.seenKeys=[key,...rec.seenKeys].slice(0,250);}
  if(subj){rec.recentSubjects=[subj,...(rec.recentSubjects||[]).filter(x=>x!==subj)].slice(0,5);}
  if(folderName) rec.folders=[folderName,...(rec.folders||[]).filter(x=>x!==folderName)].slice(0,5);
  await messenger.storage.local.set({moUnmatchedSenders:q}); return !alreadySeen;
}
let membershipCache=null;
function resetMembershipCache(){ membershipCache={books:null,bookEmails:new Map(),listEmails:new Map(),excludedBookId:null,excludedEmails:null}; }
async function cachedExcludedEmails(){
  if(!membershipCache) resetMembershipCache();
  if(membershipCache.excludedEmails) return membershipCache.excludedEmails;
  // Fast path: do not enumerate every address book/contact just to test ExcludedBook.
  const books=await messenger.addressBooks.list(false);
  const book=(books||[]).find(b=>String(b.name||"").toLowerCase()==="excludedbook");
  const set=new Set();
  if(book){
    membershipCache.excludedBookId=book.id;
    const contacts=await messenger.addressBooks.contacts.list(book.id);
    for(const contact of contacts||[]) for(const email of contactEmails(contact)) set.add(String(email).trim().toLowerCase());
    membershipCache.bookEmails.set(String(book.id),set);
  }
  membershipCache.excludedEmails=set;
  return set;
}
async function prewarmMembershipCacheForRules(rules=[]){
  // Excluded Senders is by far the hottest address-book test. Load it exactly once
  // before a batch/manual run so every message is an O(1) Set lookup.
  const needsExcluded=(rules||[]).some(r=>(r.conditions||[]).some(c=>{
    const n=String(c.addressBookName||c.value||"").trim().toLowerCase();
    return n==="excludedbook" && ["inAddressBook","notInAddressBook"].includes(c.operator);
  }));
  if(needsExcluded) await cachedExcludedEmails();
}
async function cachedBooks(){
  if(!membershipCache) resetMembershipCache();
  if(!membershipCache.books) membershipCache.books=await messenger.addressBooks.list(true);
  return membershipCache.books||[];
}
async function cachedBookEmails(book){
  if(!membershipCache) resetMembershipCache();
  const key=String(book.id);
  if(membershipCache.bookEmails.has(key)) return membershipCache.bookEmails.get(key);
  const contacts=book.contacts || await messenger.addressBooks.contacts.list(book.id);
  const set=new Set(); for(const contact of contacts||[]) for(const email of contactEmails(contact)) set.add(String(email).toLowerCase());
  membershipCache.bookEmails.set(key,set); return set;
}
async function cachedListEmails(list){
  if(!membershipCache) resetMembershipCache();
  const key=String(list.id);
  if(membershipCache.listEmails.has(key)) return membershipCache.listEmails.get(key);
  const members=await messenger.addressBooks.mailingLists.listMembers(list.id);
  const set=new Set(); for(const contact of members||[]) for(const email of contactEmails(contact)) set.add(String(email).toLowerCase());
  membershipCache.listEmails.set(key,set); return set;
}
async function addressBookMembership(email, c) {
  try {
    email=String(email||"").trim().toLowerCase(); if(!email) return false;
    const wantedBook=String(c.addressBookName || ((c.operator==="inAddressBook"||c.operator==="notInAddressBook"||c.field==="addressBook"||c.field==="notAddressBook") ? c.value : "") || "").trim();
    if(!c.addressBookId && wantedBook.toLowerCase()==="excludedbook") return (await cachedExcludedEmails()).has(email);
    const books=await cachedBooks();
    for(const book of books) {
      if(c.addressBookId && book.id!==c.addressBookId) continue;
      if(wantedBook && String(book.name||"").toLowerCase()!==String(wantedBook).toLowerCase()) continue;
      if((await cachedBookEmails(book)).has(email)) return true;
    }
  } catch(e) { console.error("Address book membership error",e); }
  return false;
}
async function mailingListMembership(email, c) {
  try {
    email=String(email||"").trim().toLowerCase(); if(!email) return false;
    const wantedBook=String(c.addressBookName || ((c.operator==="inAddressBook"||c.operator==="notInAddressBook"||c.field==="addressBook"||c.field==="notAddressBook") ? c.value : "") || "").trim();
    if(!c.addressBookId && wantedBook.toLowerCase()==="excludedbook") return (await cachedExcludedEmails()).has(email);
    const books=await cachedBooks();
    for(const book of books) {
      for(const list of book.mailingLists || []) {
        if(c.mailingListId && list.id!==c.mailingListId) continue;
        const wantedList=c.mailingListName || ((c.operator==="inMailingList"||c.operator==="notInMailingList"||c.field==="mailingList"||c.field==="notMailingList") ? c.value : "");
        if(wantedList && String(list.name||"").toLowerCase()!==String(wantedList).toLowerCase()) continue;
        if((await cachedListEmails(list)).has(email)) return true;
      }
    }
  } catch(e) { console.error("Mailing list membership error",e); }
  return false;
}
async function extendedFieldValue(message, field) {
  if(field==="body") {
    try {
      const full=await messenger.messages.getFull(message.id,{decodeContent:true,decodeHeaders:true});
      const bodies=[]; const walk=p=>{if(!p)return;if(typeof p.body==="string")bodies.push(p.body);for(const x of (p.parts||[]))walk(x);}; walk(full);
      return bodies.join("\n");
    } catch(e) { return ""; }
  }
  if(field==="attachment") {
    try { const a=await messenger.messages.listAttachments(message.id); return (a||[]).length ? "Has Attachment" : "No Attachment"; } catch(e) { return "No Attachment"; }
  }
  if(String(field||"").startsWith("hdr:")) {
    const name=String(field).slice(4).toLowerCase();
    try {
      if(messenger.messages.getHeaders){const hs=await messenger.messages.getHeaders(message.id,{decodeHeaders:true});return (hs?.[name]||hs?.[String(field).slice(4)]||[]).join("\n");}
      const full=await messenger.messages.getFull(message.id,{decodeContent:false,decodeHeaders:true});
      const hs=full?.headers||full?.rawHeaders||{}; return (hs?.[name]||hs?.[String(field).slice(4)]||[]).join("\n");
    } catch(e) { return ""; }
  }
  return fieldValue(message,field);
}
async function conditionMatches(message, c) {
  if(c.field==="all" || c.operator==="matchAll") return true;
  const rawActual=await extendedFieldValue(message,c.field);
  const actual=text(rawActual), wanted=text(c.value);
  if(c.operator==="oneOf") {
    const values=(c.value||"").split(/[\n,;]+/).map(v=>text(v.trim())).filter(Boolean);
    return values.some(v=>actual.includes(v));
  }
  if(c.field==="priority") {
    const rank={lowest:1,low:2,normal:3,none:3,high:4,highest:5};
    const a=rank[actual]||3,w=rank[wanted]||3;
    if(c.operator==="greaterThan") return a>w;
    if(c.operator==="lessThan") return a<w;
  }
  if(c.field==="addressBook" || c.field==="notAddressBook") {
    const hit=await addressBookMembership(extractEmail(message.author||""),c);
    return c.field==="addressBook" ? hit : !hit;
  }
  if(c.field==="mailingList" || c.field==="notMailingList") {
    const hit=await mailingListMembership(extractEmail(message.author||""),c);
    return c.field==="mailingList" ? hit : !hit;
  }
  if(c.operator==="inAddressBook" || c.operator==="notInAddressBook") {
    const addresses=conditionAddresses(message,c.field||"from");
    let hit=false; for(const email of addresses){if(await addressBookMembership(email,c)){hit=true;break;}}
    return c.operator==="inAddressBook" ? hit : !hit;
  }
  if(c.operator==="inMailingList" || c.operator==="notInMailingList") {
    const addresses=conditionAddresses(message,c.field||"from");
    let hit=false; for(const email of addresses){if(await mailingListMembership(email,c)){hit=true;break;}}
    return c.operator==="inMailingList" ? hit : !hit;
  }
  switch(c.operator) {
    case "contains": return actual.includes(wanted);
    case "notContains":
    case "doesNotContain": return !actual.includes(wanted);
    case "is":
    case "equals": return actual===wanted;
    case "isNot":
    case "notEquals": return actual!==wanted;
    case "startsWith":
    case "beginsWith": return actual.startsWith(wanted);
    case "endsWith": return actual.endsWith(wanted);
    case "greaterThan": return Number(rawActual) > Number(c.value);
    case "lessThan": return Number(rawActual) < Number(c.value);
    case "before": return new Date(rawActual).getTime() < new Date(c.value).getTime();
    case "after": return new Date(rawActual).getTime() > new Date(c.value).getTime();
    case "regex":
      try { return new RegExp(c.value,c.caseSensitive?"":"i").test(rawActual); } catch { return false; }
    default: return false;
  }
}
async function ruleMatches(message,rule) {
  if(rule.finalCatchAll || rule.matchMode==="finalCatchAll" || rule.matchAll || rule.matchMode==="matchAll") return true;
  const conditions=rule.conditions||[];
  if(!conditions.length) return false;
  // Short-circuit as soon as the result is determined. Avoid expensive
  // address-book/API checks for conditions that cannot change the outcome.
  if(rule.matchMode==="any"){
    for(const c of conditions) if(await conditionMatches(message,c)) return true;
    return false;
  }
  for(const c of conditions) if(!(await conditionMatches(message,c))) return false;
  return true;
}

async function diagnosticRuleMatch(message, rule) {
  if (rule.finalCatchAll || rule.matchMode==="finalCatchAll") {
    return {matched:true, finalCatchAll:true, conditions:[{field:"all",operator:"finalCatchAll",wanted:"",actual:"(final catch-all; only executes when no earlier rule matched)",matched:true}]};
  }
  if (rule.matchAll || rule.matchMode==="matchAll") {
    return {matched:true, conditions:[{field:"all",operator:"matchAll",wanted:"",actual:"(all messages)",matched:true}]};
  }
  const conditions=rule.conditions||[];
  const details=[];
  for (const c of conditions) {
    const rawActual=await extendedFieldValue(message,c.field);
    let hit=false, error="";
    try { hit=await conditionMatches(message,c); } catch(e) { error=String(e?.message||e); }
    details.push({
      field:c.field||"",
      operator:c.operator||"",
      wanted:String(c.value??""),
      actual:String(rawActual??""),
      matched:!!hit,
      error
    });
  }
  const hits=details.map(d=>d.matched);
  const matched=conditions.length>0 && (rule.matchMode==="any" ? hits.some(Boolean) : hits.every(Boolean));
  return {matched,conditions:details};
}

async function addLog(entry) {
  const state = await getState();
  const log = state.log || [];
  log.unshift({ time: new Date().toISOString(), ...entry });
  const allowed = [1000, 5000, 10000, 25000, 50000];
  const limit = allowed.includes(Number(state.settings?.maxLog)) ? Number(state.settings.maxLog) : 25000;
  if (log.length > limit) log.length = limit;
  await messenger.storage.local.set({ log });
}


async function mo46FolderLabel(folderId) {
  try {
    const accounts=await messenger.accounts.list();
    async function kids(folder){
      try { if(messenger.folders?.getSubFolders && folder?.id) return await messenger.folders.getSubFolders(folder.id,false); } catch {}
      return folder?.subFolders || folder?.folders || [];
    }
    async function walk(accountName,folder,prefix=""){
      if(!folder)return null;
      const name=folder.name||"(unnamed)";
      if(String(folder.id)===String(folderId)) return `${accountName}: ${prefix}${name}`;
      for(const c of await kids(folder)||[]){ const x=await walk(accountName,c,`${prefix}${name}/`); if(x)return x; }
      return null;
    }
    for(const a of accounts||[]){
      if(a.rootFolder){ for(const c of await kids(a.rootFolder)||[]){ const x=await walk(a.name||a.id,c,""); if(x)return x; } }
      else for(const f of a.folders||[]){ const x=await walk(a.name||a.id,f,""); if(x)return x; }
    }
  }catch{}
  return String(folderId||"(unknown folder)");
}

// Move confirmation is deliberately conservative: a successful API call is not
// proof that Thunderbird/IMAP finished moving the message.
const mo19Sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function mo19SameMessage(a,b){
  return String(a?.subject||"")===String(b?.subject||"") &&
    String(a?.author||"")===String(b?.author||"") &&
    Number(a?.size||0)===Number(b?.size||0) &&
    Math.abs(new Date(a?.date||0).getTime()-new Date(b?.date||0).getTime())<2000;
}
async function mo19CheckDestination(message,folderId){
  // A bounded scan avoids hanging on very large destination folders.
  let page=await messenger.messages.list(folderId), count=0, matches=0;
  while(page && count<2000){
    for(const candidate of page.messages||[]){
      count++;
      if(mo19SameMessage(message,candidate)) matches++;
    }
    if(matches>0 || !page.id || count>=2000) break;
    page=await messenger.messages.continueList(page.id);
  }
  return matches>0 ? "FOUND" : (count>=2000 ? "UNKNOWN" : "NOT_FOUND");
}
async function mo20CheckSource(message, sourceFolderId){
  try {
    const current=await messenger.messages.get(message.id);
    if(!current) return "ABSENT";
    const original=sourceFolderId || message.folder?.id;
    if(!original || !current.folder?.id) return "UNKNOWN";
    return String(current.folder.id)===String(original) ? "PRESENT" : "ABSENT";
  }catch(e){ return "UNKNOWN"; }
}
async function mo20VerifyMove(message,destinationId,sourceFolderId){
  let destination="UNKNOWN",source="UNKNOWN";
  for(let i=0;i<3;i++){
    await mo19Sleep(2000);
    try { destination=await mo19CheckDestination(message,destinationId); }
    catch(e){ destination="UNKNOWN"; }
    source=await mo20CheckSource(message,sourceFolderId);
    if(destination==="FOUND" && source==="ABSENT") return {status:"VERIFIED",source,destination};
  }
  const status=source==="PRESENT" && destination==="NOT_FOUND" ? "STILL IN SOURCE" : "UNVERIFIED";
  return {status,source,destination};
}
async function mo20VerifyAndLogMove(message, action, rule, logContext, requested){
  const base={kind:"ACTION",mode:logContext.mode||"Manual Run",rule:rule.name||"",action:"Move",destination:requested,subject:message.subject||"",author:message.author||"",messageId:message.id,folder:logContext.folder||""};
  const originalFolderId=logContext.folderId || message.folder?.id;
  try {
    let verification=await mo20VerifyMove(message,action.folderId,originalFolderId);
    if(verification.source==="PRESENT" && verification.destination==="NOT_FOUND"){
      await addLog({...base,status:"RETRY",detail:"Original message ID still in source; destination not found. Retrying move once."});
      try {
        await messenger.messages.move([message.id],action.folderId);
        verification=await mo20VerifyMove(message,action.folderId,originalFolderId);
      }catch(e){
        await addLog({...base,status:"FAILED",detail:`Move retry failed: ${e?.message||String(e)}`});
        return;
      }
    }
    const detail=`Move → ${requested} [${action.folderId}] · source=${verification.source}; destination=${verification.destination}; originalId=${message.id}`;
    await addLog({...base,status:verification.status,detail});
  }catch(e){
    await addLog({...base,status:"UNVERIFIED",detail:`Verification unavailable: ${e?.message||String(e)}; originalId=${message.id}`});
  }
}

async function executeActions(message, rule, simulate = false, logContext = {}) {
  const results = [];
  const actionLabel = a => ({move:"Move",copy:"Copy",markRead:"Mark Read",markUnread:"Mark Unread",star:"Add Star",unstar:"Remove Star",tag:"Tag",junk:"Set Junk Status",archive:"Archive",priority:"Set Priority",stop:"Stop Filter Execution",delete:"Delete"}[a?.type] || String(a?.type||"Unknown"));
  for (const action of (rule.actions || [])) {
    try {
      if (simulate) {
        results.push(`SIMULATE ${action.type}`);
        if (action.type === "stop" || action.type === "move" || action.type === "delete" || action.type === "archive") results.stopProcessing = true;
        continue;
      }
      if (action.type === "move") {
        const requested=await mo46FolderLabel(action.folderId);
        await addLog({kind:"ACTION",mode:logContext.mode||"Manual Run",status:"MOVE REQUESTED",rule:rule.name||"",action:"Move",destination:requested,subject:message.subject||"",author:message.author||"",messageId:message.id,folder:logContext.folder||"",detail:"Thunderbird move requested; verifying destination."});
        await messenger.messages.move([message.id], action.folderId);
        // Verify independently so the incoming queue and Manual Run can continue.
        void mo20VerifyAndLogMove(message,action,rule,logContext,requested);
        results.push(`Move requested → ${requested} [${action.folderId}]; verification pending`);
        results.stopProcessing=true;
        const remaining=(rule.actions||[]).slice((rule.actions||[]).indexOf(action)+1);
        if(remaining[0]?.type==="stop"){
          await addLog({kind:"ACTION",mode:logContext.mode||"Manual Run",status:"SUCCESS",rule:rule.name||"",action:"Stop Filter Execution",destination:"",subject:message.subject||"",author:message.author||"",messageId:message.id,folder:logContext.folder||"",detail:"Stop after move"});
        }
        break;
      } else if (action.type === "copy") {
        const requested=await mo46FolderLabel(action.folderId);
        const copied=await messenger.messages.copy([message.id], action.folderId);
        const returned=Array.isArray(copied) ? copied[0] : null;
        const returnedFolderId=returned?.folder?.id || returned?.folderId || "";
        const returnedLabel=returnedFolderId ? await mo46FolderLabel(returnedFolderId) : "";
        if(returnedFolderId && String(returnedFolderId)!==String(action.folderId)){
          throw new Error(`COPY DESTINATION MISMATCH — requested ${requested} [${action.folderId}], Thunderbird returned ${returnedLabel} [${returnedFolderId}]`);
        }
        results.push(`Copied → ${requested} [${action.folderId}]${returnedFolderId?` · verified return: ${returnedLabel} [${returnedFolderId}]`:" · Thunderbird returned no destination metadata"}`);
      } else if (action.type === "markRead") {
        await messenger.messages.update(message.id, { read: true });
        results.push("Marked read");
      } else if (action.type === "markUnread") {
        await messenger.messages.update(message.id, { read: false });
        results.push("Marked unread");
      } else if (action.type === "star") {
        await messenger.messages.update(message.id, { flagged: true });
        results.push("Starred");
      } else if (action.type === "unstar") {
        await messenger.messages.update(message.id, { flagged: false });
        results.push("Unstarred");
      } else if (action.type === "tag") {
        const tags = Array.from(new Set([...(message.tags || []), action.tagKey].filter(Boolean)));
        await messenger.messages.update(message.id, { tags });
        results.push(`Tagged ${action.tagKey}`);
      } else if (action.type === "junk") {
        const isJunk=String(action.value||"").toLowerCase()==="junk";
        await messenger.messages.update(message.id,{junk:isJunk});
        results.push(isJunk?"Marked junk":"Marked not junk");
      } else if (action.type === "archive") {
        await messenger.messages.archive([message.id]);
        results.push("Archived");
        results.stopProcessing=true;
      } else if (action.type === "priority") {
        throw new Error("Thunderbird MailExtension API does not permit changing priority on an existing message.");
      } else if (action.type === "stop") {
        results.push("Stopped filter execution");
        // Do not break here: write the STOP action to the Activity Log first.
        results.stopProcessing = true;
      } else if (action.type === "delete") {
        await messenger.messages.delete([message.id], {deletePermanently:false, isUserAction:true});
        results.push("Deleted");
        results.stopProcessing = true;
      }
      const destination=(action.type==="move"||action.type==="copy") ? await mo46FolderLabel(action.folderId) : (action.type==="tag" ? String(action.tagKey||"") : "");
      await addLog({kind:"ACTION",mode:logContext.mode||"Manual Run",status:"SUCCESS",rule:rule.name||"",action:actionLabel(action),destination,subject:message.subject||"",author:message.author||"",messageId:message.id,folder:logContext.folder||"",detail:results[results.length-1]||"Completed"});
      if (action.type === "stop" || action.type === "delete" || action.type === "archive") break;
      if (action.type === "move") {
        const remaining=(rule.actions||[]).slice((rule.actions||[]).indexOf(action)+1);
        const next=remaining[0];
        if(next?.type!=="stop") break;
      }
    } catch (e) {
      results.push(`ERROR: ${e.message || e}`);
      let destination=""; try { if(action.type==="move"||action.type==="copy") destination=await mo46FolderLabel(action.folderId); else if(action.type==="tag") destination=String(action.tagKey||""); } catch {}
      await addLog({kind:"ACTION",mode:logContext.mode||"Manual Run",status:"FAILED",rule:rule.name||"",action:actionLabel(action),destination,subject:message.subject||"",author:message.author||"",messageId:message.id,folder:logContext.folder||"",detail:e.message||String(e)});
      throw e;
    }
  }
  return results;
}


async function recordFilterMatch(rule, message, sourceFolder){
  const now=new Date().toISOString();
  const key=String(rule?.id || rule?.name || "(unknown)");
  const st=await messenger.storage.local.get({filterStats:{},excludedAddressStats:{}});
  const stats=st.filterStats||{};
  const cur=stats[key]||{ruleId:key,ruleName:rule?.name||key,totalMatches:0,firstMatched:null,lastMatched:null};
  cur.ruleName=rule?.name||cur.ruleName||key; cur.totalMatches=Number(cur.totalMatches||0)+1; cur.firstMatched=cur.firstMatched||now; cur.lastMatched=now; const day=now.slice(0,10); cur.dailyCounts=cur.dailyCounts||{}; cur.dailyCounts[day]=Number(cur.dailyCounts[day]||0)+1; cur.lastFolder=sourceFolder?.name||""; cur.lastSubject=message?.subject||"";
  stats[key]=cur;
  const patch={filterStats:stats};
  if(rule?.systemRole==="excluded" || rule?.name==="Excluded Senders"){
    const email=extractEmail(message?.author||"");
    if(email){const es=st.excludedAddressStats||{};const e=es[email]||{email,totalMatches:0,firstMatched:null,lastMatched:null};e.totalMatches=Number(e.totalMatches||0)+1;e.firstMatched=e.firstMatched||now;e.lastMatched=now;const day=now.slice(0,10);e.dailyCounts=e.dailyCounts||{};e.dailyCounts[day]=Number(e.dailyCounts[day]||0)+1;e.lastSubject=message?.subject||"";es[email]=e;patch.excludedAddressStats=es;}
  }
  await messenger.storage.local.set(patch);
}

async function recordExcludedGate(message, sourceFolder){
  const state=await getState();
  const rule=(state.rules||[]).find(r=>r?.systemRole==="excluded") || {id:"mo-system-excluded",name:"Excluded Senders",systemRole:"excluded"};
  await recordFilterMatch(rule,message,sourceFolder);
}

function isOrganizationalRule(rule) {
  if (!rule) return false;
  if (rule.finalCatchAll || rule.matchMode === "finalCatchAll" || rule.matchAll || rule.matchMode === "matchAll") return false;
  const role=String(rule.systemRole||"").toLowerCase();
  const name=String(rule.name||"").trim().toLowerCase();
  // Diagnostic/counter rules must never suppress Unmatched capture.
  if (role === "diagnostic" || role === "counter" || role === "newmail" || name === "newmail") return false;
  return true;
}

async function processMessage(message, sourceFolder, simulate = false, selectedRuleIds = null, logNoMatch = false, mode = "Manual Run", runContext = null) {
  const state = runContext?.state || await getState();
  if (!state.settings.enabled && !simulate && selectedRuleIds === null) return [];
  // ExcludedBook is handled by the visible "Excluded Senders" rule.
  // Do NOT short-circuit here: doing so bypasses that rule's configured actions
  // (for example Move to NonFilter, then Stop Filter Execution).
  let rules = runContext?.rules || [...(state.rules || [])]
    .sort((a,b) => (a.order ?? 9999) - (b.order ?? 9999));
  if (selectedRuleIds && !runContext?.rules) {
    // Safety rule: disabled filters never run, even when explicitly selected manually.
    const wanted = new Set(selectedRuleIds.map(String));
    rules = rules.filter(r => wanted.has(String(r.id)) && r.enabled !== false);
  } else if (!runContext?.rules) {
    // Normal incoming processing only uses enabled rules.
    rules = rules.filter(r => r.enabled !== false);
  }

  const matches = [];
  let organizationalMatched = false;
  for (const rule of rules) {
    const isFinalCatchAll = !!(rule.finalCatchAll || rule.matchMode==="finalCatchAll");
    // A final catch-all is special: it is eligible only when no earlier rule matched.
    if (isFinalCatchAll && matches.length) continue;
    if (!(await ruleMatches(message, rule))) continue;
    matches.push(rule.name);
    if (isOrganizationalRule(rule)) organizationalMatched = true;
    if(!simulate) await recordFilterMatch(rule,message,sourceFolder);
    let terminalAction = false;
    try {
      const result = await executeActions(message, rule, simulate, {mode,folder:sourceFolder?.name||"",folderId:sourceFolder?.id||message.folder?.id||""});
      terminalAction = !!result.stopProcessing;
      // Real runs are logged action-by-action inside executeActions(), including
      // action and destination. Keep only a clearly labelled summary for simulation.
      if (simulate) {
        await addLog({
          kind: "SIMULATION", mode, status: "SIMULATE-MATCH",
          rule: rule.name, action: "Simulation", destination: "",
          subject: message.subject || "", author: message.author || "",
          folder: sourceFolder?.name || "", detail: result.join("; ")
        });
      }
    } catch (e) {
      await addLog({
        status: "FAILED", rule: rule.name, subject: message.subject || "",
        author: message.author || "", folder: sourceFolder?.name || "",
        detail: e.message || String(e)
      });
    }
    // Explicit Stop, Move, or Delete is terminal. This prevents a moved/deleted message from being processed again.
    if (terminalAction || isFinalCatchAll || state.settings.stopAfterFirstMatch) break;
  }
  if (!matches.length && logNoMatch) {
    await addLog({
      status: simulate ? "SIMULATE-NO-MATCH" : "NO MATCH",
      rule: "", subject: message.subject || "", author: message.author || "",
      folder: sourceFolder?.name || "", detail: ""
    });
  }
  // LIVE incoming mail that reaches the end of the full enabled rule chain without
  // a real organizational match becomes an Unmatched / Exclusion Candidate.
  // NEWMAIL, all-messages and final catch-all rules do not suppress this capture.
  if (!simulate && mode === "Incoming Live" && !organizationalMatched) {
    const added = await captureUnmatched(message, sourceFolder?.name || "");
    if (added) {
      await addLog({kind:"UNMATCHED",mode,status:"UNMATCHED",rule:"",action:"Capture Unmatched",destination:"Unmatched Senders",subject:message.subject||"",author:message.author||"",messageId:message.id,folder:sourceFolder?.name||"",detail:"No enabled organizational filter matched; sender added to Unmatched Senders."});
    }
  }
  return matches;
}

// Incoming mail can be announced before an IMAP message has completely settled.
// Queue new messages, allow Thunderbird a short settling interval, then re-fetch
// the message before matching. A single worker prevents overlapping live runs.
const INCOMING_SETTLE_MS = 1500;
const INCOMING_RETRY_MS = 2000;
const INCOMING_MAX_FETCH_ATTEMPTS = 3;
const incomingQueue = [];
const incomingQueuedIds = new Set();
let incomingWorkerRunning = false;
let activeManualRuns = 0;

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchIncomingMessageWithRetry(messageId, folderName){
  let lastError = null;
  for(let attempt=1; attempt<=INCOMING_MAX_FETCH_ATTEMPTS; attempt++){
    try{
      const message = await messenger.messages.get(messageId);
      if(message) return message;
      lastError = new Error("Message unavailable");
    }catch(e){ lastError=e; }
    if(attempt < INCOMING_MAX_FETCH_ATTEMPTS){
      await addLog({kind:"INCOMING",mode:"Incoming Live",status:"RETRY",rule:"",action:"Re-fetch",destination:"",subject:"",author:"",messageId,folder:folderName||"",detail:`Message unavailable after settle; retry ${attempt}/${INCOMING_MAX_FETCH_ATTEMPTS-1} in ${INCOMING_RETRY_MS} ms.`});
      await sleep(INCOMING_RETRY_MS);
    }
  }
  throw lastError || new Error("Message unavailable after retries");
}

async function runIncomingWorker(){
  if(incomingWorkerRunning) return;
  incomingWorkerRunning=true;
  try{
    while(incomingQueue.length){
      const item=incomingQueue.shift();
      try{
        // Manual Run gets exclusive use of message actions. Incoming mail waits
        // rather than racing a user-initiated batch over the same folders.
        while(activeManualRuns>0) await sleep(250);
        const state=await getState();
        const realIncoming=!!state.settings?.enabled;
        const testIncoming=!!state.settings?.incomingTestMode && !realIncoming;
        if(!realIncoming && !testIncoming) continue;
        const remaining=Math.max(0, item.readyAt-Date.now());
        if(remaining) await sleep(remaining);
        const message=await fetchIncomingMessageWithRetry(item.messageId,item.folder?.name||"");
        await addLog({kind:"INCOMING",mode:realIncoming?"Incoming Live":"Incoming Test",status:"PROCESSING",rule:"",action:"Evaluate",destination:"",subject:message.subject||"",author:message.author||"",messageId:message.id,folder:item.folder?.name||"",detail:"Settling delay complete; message re-fetched from Thunderbird."});
        resetMembershipCache();
        await prewarmMembershipCacheForRules(state.rules||[]);
        if(testIncoming){
          const excluded=await addressBookMembership(extractEmail(message.author||""),{addressBookName:"ExcludedBook"});
          if(excluded){
            await addLog({kind:"INCOMING",mode:"Incoming Test",status:"INCOMING-TEST-EXCLUDED",rule:"Excluded Senders",subject:message.subject||"",author:message.author||"",messageId:message.id,folder:item.folder?.name||"",detail:"No changes made"});
          }else{
            await processMessage(message,item.folder,true,null,true,"Incoming Test");
          }
        }else{
          const names=await processMessage(message,item.folder,false,null,true,"Incoming Live");
          if(!names.length) await addLog({kind:"INCOMING",mode:"Incoming Live",status:"NO MATCH",rule:"",action:"Evaluate",destination:"",subject:message.subject||"",author:message.author||"",messageId:message.id,folder:item.folder?.name||"",detail:"Message processed successfully; no enabled filter matched."});
        }
      }catch(e){
        await addLog({kind:"INCOMING",mode:"Incoming Live",status:"FAILED",rule:"",action:"Incoming queue",destination:"",subject:item.subject||"",author:item.author||"",messageId:item.messageId,folder:item.folder?.name||"",detail:e?.message||String(e)});
      }finally{
        incomingQueuedIds.delete(String(item.messageId));
      }
    }
  }finally{
    incomingWorkerRunning=false;
    if(incomingQueue.length) void runIncomingWorker();
  }
}

messenger.messages.onNewMailReceived.addListener(async (folder, messageList) => {
  const state=await getState();
  const realIncoming=!!state.settings?.enabled;
  const testIncoming=!!state.settings?.incomingTestMode && !realIncoming;
  if(!realIncoming && !testIncoming) return;
  let page=messageList;
  while(page){
    for(const message of page.messages||[]){
      const key=String(message.id);
      if(incomingQueuedIds.has(key)) continue;
      incomingQueuedIds.add(key);
      incomingQueue.push({messageId:message.id,folder,subject:message.subject||"",author:message.author||"",readyAt:Date.now()+INCOMING_SETTLE_MS});
      await addLog({kind:"INCOMING",mode:realIncoming?"Incoming Live":"Incoming Test",status:"QUEUED",rule:"",action:"Queue",destination:"",subject:message.subject||"",author:message.author||"",messageId:message.id,folder:folder?.name||"",detail:`Waiting ${INCOMING_SETTLE_MS} ms before re-fetch and filter evaluation.`});
    }
    if(!page.id) break;
    page=await messenger.messages.continueList(page.id);
  }
  void runIncomingWorker();
});


async function mo30CollectFolderMessages(folderId){
  let page=await messenger.messages.list(folderId), out=[], safety=0;
  while(page){
    out.push(...(page.messages||[]));
    if(!page.id) break;
    page=await messenger.messages.continueList(page.id);
    if(++safety>10000) throw new Error("Message pagination safety limit reached.");
  }
  out.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
  return out;
}

messenger.runtime.onMessage.addListener(async request => {
  if(request?.type==="exportFolderSenders"){
    const folderId=String(request.folderId||"");
    if(!folderId || folderId.startsWith("__ACCOUNT__:")) return {ok:false,error:"Choose one specific Thunderbird folder."};
    const messages=await mo30CollectFolderMessages(folderId);
    const byEmail=new Map();
    for(const message of messages){
      const email=extractEmail(message.author||"");
      if(!email || !email.includes("@")) continue;
      const ident=senderIdentity(message);
      const cur=byEmail.get(email)||{email,name:ident.name||"",count:0,lastDate:null};
      cur.count++;
      if(!cur.name && ident.name) cur.name=ident.name;
      const d=message.date ? new Date(message.date) : null;
      if(d && !Number.isNaN(d.getTime()) && (!cur.lastDate || d>new Date(cur.lastDate))) cur.lastDate=d.toISOString();
      byEmail.set(email,cur);
    }
    let excludedSet=new Set();
    try{
      const books=await messenger.addressBooks.list(false);
      const book=(books||[]).find(b=>String(b.name||"").toLowerCase()==="excludedbook");
      if(book){
        const contacts=await messenger.addressBooks.contacts.list(book.id);
        excludedSet=new Set((contacts||[]).flatMap(contactEmails).map(e=>String(e).toLowerCase()));
      }
    }catch(e){}
    const senders=[...byEmail.values()].map(x=>({...x,inExcludedBook:excludedSet.has(x.email)})).sort((a,b)=>a.email.localeCompare(b.email));
    return {ok:true,messageCount:messages.length,uniqueCount:senders.length,excludedCount:senders.filter(x=>x.inExcludedBook).length,senders};
  }
  if(request?.type==="getActivityLog"){
    const st=await messenger.storage.local.get({log:[]});
    return {ok:true,log:Array.isArray(st.log)?st.log:[]};
  }
  if(request?.type==="clearActivityLog"){
    await messenger.storage.local.set({log:[]});
    return {ok:true};
  }
  if(request?.type==="getFilterActivity"){
    const st=await messenger.storage.local.get({filterStats:{},excludedAddressStats:{},rules:[]});
    return {ok:true,filterStats:st.filterStats||{},excludedAddressStats:st.excludedAddressStats||{},rules:st.rules||[]};
  }
  if(request?.type==="resetFilterActivity"){
    await messenger.storage.local.set({filterStats:{},excludedAddressStats:{}});
    return {ok:true};
  }
  if(request?.type==="setIncomingLiveMode"){
    const st=await getState();
    const enabled=!!request.enabled;
    if(enabled){
      // Refuse to arm live processing unless the same readiness checks used by the UI pass.
      const enabledRules=(st.rules||[]).filter(r=>r.enabled!==false).sort((a,b)=>(a.order??9999)-(b.order??9999));
      const folderIds=new Set();
      try{
        const accounts=await messenger.accounts.list();
        async function kids(f){try{if(messenger.folders?.getSubFolders&&f?.id)return await messenger.folders.getSubFolders(f.id,false);}catch{} return f?.subFolders||f?.folders||[];}
        async function walk(f){if(!f)return;if(f.id)folderIds.add(String(f.id));for(const c of await kids(f)||[])await walk(c);}
        for(const a of accounts||[]){if(a.rootFolder)await walk(a.rootFolder);else for(const f of a.folders||[])await walk(f);}
      }catch(e){ return {ok:false,enabled:false,error:"Could not verify Thunderbird folders: "+(e.message||e)}; }
      const supported=new Set(["move","copy","markRead","markUnread","star","unstar","tag","junk","archive","stop","delete"]);
      const errors=[];
      for(const r of enabledRules) for(const a of r.actions||[]){
        if(!supported.has(a.type)) errors.push(`${r.name}: unsupported action ${a.type}`);
        if((a.type==="move"||a.type==="copy") && (!a.folderId||!folderIds.has(String(a.folderId)))) errors.push(`${r.name}: ${a.type} destination is missing or no longer exists`);
      }
      if(errors.length) return {ok:false,enabled:false,errors};
    }
    st.settings={...(st.settings||{}),enabled,incomingTestMode:false};
    await messenger.storage.local.set({settings:st.settings});
    await addLog({status:enabled?"INCOMING-LIVE-ON":"INCOMING-LIVE-OFF",rule:"",subject:"",author:"",folder:"",detail:enabled?"Live incoming processing enabled by user":"Live incoming processing stopped by user"});
    return {ok:true,enabled,realIncoming:enabled};
  }
  if(request?.type==="setIncomingTestMode"){
    const st=await getState();
    const enabled=!!request.enabled;
    // Test mode and live mode are mutually exclusive.
    st.settings={...(st.settings||{}),enabled:false,incomingTestMode:enabled};
    await messenger.storage.local.set({settings:st.settings});
    return {ok:true,enabled,realIncoming:false};
  }
  if(request?.type==="getLiveReadiness"){
    const st=await getState();
    const enabledRules=(st.rules||[]).filter(r=>r.enabled!==false).sort((a,b)=>(a.order??9999)-(b.order??9999));
    const folderIds=new Set();
    try{
      const accounts=await messenger.accounts.list();
      async function kids(f){try{if(messenger.folders?.getSubFolders&&f?.id)return await messenger.folders.getSubFolders(f.id,false);}catch{} return f?.subFolders||f?.folders||[];}
      async function walk(f){if(!f)return;if(f.id)folderIds.add(String(f.id));for(const c of await kids(f)||[])await walk(c);}
      for(const a of accounts||[]){if(a.rootFolder)await walk(a.rootFolder);else for(const f of a.folders||[])await walk(f);}
    }catch{}
    const errors=[],warnings=[];
    const supported=new Set(["move","copy","markRead","markUnread","star","unstar","tag","junk","archive","stop","delete"]);
    for(const r of enabledRules){
      for(const a of r.actions||[]){
        if(!supported.has(a.type)) errors.push(`${r.name}: unsupported action ${a.type}`);
        if((a.type==="move"||a.type==="copy") && (!a.folderId||!folderIds.has(String(a.folderId)))) errors.push(`${r.name}: ${a.type} destination is missing or no longer exists`);
      }
      if((r.matchMode==="matchAll"||r.matchAll) && !(r.finalCatchAll||r.matchMode==="finalCatchAll")) warnings.push(`${r.name}: matches all messages`);
      if(!(r.actions||[]).length) warnings.push(`${r.name}: has no actions`);
    }
    const catchalls=enabledRules.filter(r=>r.finalCatchAll||r.matchMode==="finalCatchAll");
    if(catchalls.length>1) warnings.push(`More than one final catch-all is enabled (${catchalls.map(r=>r.name).join(", ")})`);
    return {ok:errors.length===0,errors,warnings,enabledRules:enabledRules.length,realIncoming:!!st.settings?.enabled,incomingTestMode:!!st.settings?.incomingTestMode,folderCount:folderIds.size};
  }
  if(request?.type==="cancelSimulation"){if(request.token)cancelledSimulations.add(String(request.token));return {ok:true};}
  if (request?.type === "getFolders") {
    const out = [];
    const diagnostics = [];
    try {
      const accounts = await messenger.accounts.list();
      diagnostics.push(`accounts.list(): ${accounts.length} account(s)`);
      async function childrenOf(folder) {
        try {
          if (messenger.folders?.getSubFolders && folder?.id) return await messenger.folders.getSubFolders(folder.id, false);
        } catch (e) { diagnostics.push(`getSubFolders failed for ${folder?.name || "?"}: ${e.message || e}`); }
        return folder?.subFolders || folder?.folders || [];
      }
      async function walk(accountName, accountId, folder, prefix="") {
        if (!folder) return;
        const name = folder.name || "(unnamed)";
        if (folder.id) out.push({ id: folder.id, name: `${accountName}: ${prefix}${name}`, accountId, isAccount:false });
        const kids = await childrenOf(folder);
        for (const child of kids || []) await walk(accountName, accountId, child, `${prefix}${name}/`);
      }
      for (const account of accounts) {
        const accountName=account.name || account.id;
        out.push({id:`__ACCOUNT__:${account.id}`, name:`${accountName} — All folders (simulation only)`, accountId:account.id, isAccount:true});
        diagnostics.push(`${accountName}: root=${account.rootFolder?.name || "none"}, folders=${account.folders?.length || 0}`);
        if (account.rootFolder) {
          const kids = await childrenOf(account.rootFolder);
          for (const child of kids || []) await walk(accountName, account.id, child, "");
        } else {
          for (const folder of account.folders || []) await walk(accountName, account.id, folder, "");
        }
      }
    } catch (e) { diagnostics.push(`FOLDER ENUMERATION ERROR: ${e.message || e}`); }
    diagnostics.push(`usable choices: ${out.length}`);
    return { folders: out, diagnostics };
  }
  if (request?.type === "getTags") {
    if (messenger.messages?.tags?.list) return await messenger.messages.tags.list();
    if (messenger.messages?.listTags) return await messenger.messages.listTags();
    return [];
  }
  if (request?.type === "diagnoseMatch") {
    const state=await getState(), rules=state.rules||[];
    const selected=request.ruleIds||[];
    const requested=request.maxMessages==null ? null : Math.max(1,Number(request.maxMessages)||50);
    const allFolderMessages=await mo30CollectFolderMessages(request.folderId);
    const folderCount=allFolderMessages.length;
    let msgs=requested===null ? allFolderMessages : allFolderMessages.slice(0,requested);
    const counts=new Map(selected.map(id=>[String(id),0]));
    const matchingMessages=[];
    const nonmatchingSamples=[];
    for(const message of msgs){
      let anyMatch=false, details=[];
      for(const id of selected){
        const rule=rules.find(x=>String(x.id)===String(id)); if(!rule || rule.enabled === false) continue;
        const checks=[];
        for(const c of (rule.conditions||[])){
          const actual=fieldValue(message,c.field), ok=await conditionMatches(message,c);
          checks.push({field:c.field,operator:c.operator,expected:c.value,actual,ok});
        }
        const matched=await ruleMatches(message,rule);
        if(matched){ counts.set(String(id),(counts.get(String(id))||0)+1); anyMatch=true; }
        details.push({rule:rule.name,matched,checks});
      }
      const item={subject:message.subject||"",author:message.author||"",date:message.date||"",details};
      if(anyMatch) matchingMessages.push(item);
      else if(nonmatchingSamples.length<5) nonmatchingSamples.push(item);
    }
    const summaries=selected.map(id=>{
      const rule=rules.find(x=>String(x.id)===String(id));
      return {rule:rule?.name||String(id),matches:rule?.enabled === false ? 0 : (counts.get(String(id))||0)};
    });
    return {folderCount,scanned:msgs.length,summaries,matchingMessages,nonmatchingSamples};
  }

  if (request?.type === "simulateAccount") {
    resetMembershipCache();
    const selected=request.ruleIds||[];
    const maxMessages=request.maxMessages != null && Number.isFinite(Number(request.maxMessages))
      ? Math.max(1,Number(request.maxMessages)) : null;
    const state=await getState(), rules=state.rules||[];
    const chosen=selected.map(id=>rules.find(r=>String(r.id)===String(id))).filter(r=>r && r.enabled !== false);
    const accounts=await messenger.accounts.list();
    const account=accounts.find(a=>String(a.id)===String(request.accountId));
    if(!account) throw new Error("Account not found.");

    async function childrenOf(folder) {
      try { if(messenger.folders?.getSubFolders && folder?.id) return await messenger.folders.getSubFolders(folder.id,false); } catch(e){}
      return folder?.subFolders||folder?.folders||[];
    }
    const folderEntries=[];
    async function walk(folder,prefix=""){
      if(!folder)return;
      const name=folder.name||"(unnamed)";
      if(folder.id) folderEntries.push({id:folder.id,name:prefix+name});
      for(const child of await childrenOf(folder)||[]) await walk(child,`${prefix}${name}/`);
    }
    if(account.rootFolder){
      for(const child of await childrenOf(account.rootFolder)||[]) await walk(child,"");
    } else {
      for(const f of account.folders||[]) await walk(f,"");
    }

    let count=0,matchedMessages=0,noMatch=0,errors=0,totalMessages=0;
    const progressToken=String(request.progressToken||"");
    const progressTotal=maxMessages||0;
    let cancelled=false;
    const matches={}, diagnostic=[], byFolder={};
    // Limit applies across the account, newest ordering is not guaranteed across folders.
    for(const f of folderEntries){
      if(maxMessages!==null && count>=maxMessages) break;
      let msgs=[];
      try { msgs=await mo30CollectFolderMessages(f.id); } catch(e){ errors++; continue; }
      totalMessages+=msgs.length;
      const remaining=maxMessages===null ? msgs.length : Math.max(0,maxMessages-count);
      const test=msgs.slice(0,remaining);
      let folderScanned=0,folderMatched=0;
      for(const message of test){
        if(progressToken && cancelledSimulations.has(progressToken)){cancelled=true;break;}
        let any=false; count++; folderScanned++;
        for(const rule of chosen){
          try{
            const d=await diagnosticRuleMatch(message,rule), name=rule.name||String(rule.id);
            if(d.matched){
              const organizational=!(rule.finalCatchAll || rule.matchMode==="finalCatchAll" || rule.matchAll || rule.matchMode==="matchAll");
              if(organizational) any=true;
              matches[name]=(matches[name]||0)+1;
            }
            const nonMatchSamples=diagnostic.filter(x=>x.rule===name && !x.matched).length;
            if(d.matched || nonMatchSamples<5) diagnostic.push({
              rule:name,folder:f.name,messageId:message.id,subject:String(message.subject||""),
              author:String(message.author||""),date:message.date||null,matched:d.matched,conditions:d.conditions
            });
          }catch(e){errors++;}
        }
        if(any){matchedMessages++;folderMatched++;}else { noMatch++; await captureUnmatched(message,f.name); }
        if(count===1 || count%5===0 || (progressTotal && count===progressTotal)) await emitSimulationProgress(progressToken,count,progressTotal,f.name);
      }
      if(folderScanned) byFolder[f.name]={scanned:folderScanned,matched:folderMatched};
      if(cancelled) break;
    }
    if(progressToken)cancelledSimulations.delete(progressToken);
    return {folderCount:totalMessages,count,matchedMessages,noMatch,matches,errors,diagnostic,byFolder,modified:0,simulate:true,accountSimulation:true,diagnosticAllMatches:true,cancelled};
  }

  if (request?.type === "simulateFolder") {
    resetMembershipCache();
    const selected = request.ruleIds || [];
    const maxMessages = request.maxMessages != null && Number.isFinite(Number(request.maxMessages))
      ? Math.max(1,Number(request.maxMessages))
      : null;
    const allFolderMessages=await mo30CollectFolderMessages(request.folderId);
    const folderCount=allFolderMessages.length;
    const testMessages=maxMessages===null ? allFolderMessages : allFolderMessages.slice(0,maxMessages);
    const state=await getState();
    const rules=state.rules||[];
    const chosen=selected.map(id=>rules.find(r=>String(r.id)===String(id))).filter(r=>r && r.enabled !== false);
    let count=0, matchedMessages=0, noMatch=0, errors=0;
    const progressToken=String(request.progressToken||"");
    const progressTotal=testMessages.length;
    let cancelled=false;
    const matches={}, diagnostic=[];
    for (const message of testMessages) {
      if(progressToken && cancelledSimulations.has(progressToken)){cancelled=true;break;}
      let any=false;
      count++;
      for (const rule of chosen) {
        try {
          const d=await diagnosticRuleMatch(message,rule);
          const name=rule.name||String(rule.id);
          if (d.matched) {
            const organizational=!(rule.finalCatchAll || rule.matchMode==="finalCatchAll" || rule.matchAll || rule.matchMode==="matchAll");
            if(organizational) any=true;
            matches[name]=(matches[name]||0)+1;
          }
          // Keep every match plus up to 5 NON-match samples per rule.
          // Match entries must not consume the non-match sample allowance.
          const nonMatchSamples=diagnostic.filter(x=>x.rule===name && !x.matched).length;
          if (d.matched || nonMatchSamples < 5) {
            diagnostic.push({
              rule:name,
              messageId:message.id,
              subject:String(message.subject||""),
              author:String(message.author||""),
              date:message.date||null,
              matched:d.matched,
              conditions:d.conditions
            });
          }
        } catch(e) {
          errors++;
        }
      }
      if(any) matchedMessages++; else { noMatch++; await captureUnmatched(message, request.folderName||""); }
      if(count===1 || count%5===0 || count===progressTotal) await emitSimulationProgress(progressToken,count,progressTotal,request.folderName||"");
    }
    if(progressToken)cancelledSimulations.delete(progressToken);
    return {folderCount,count,matchedMessages,noMatch,matches,errors,diagnostic,modified:0,simulate:true,diagnosticAllMatches:true,unmatchedCaptured:noMatch,cancelled};
  }

  if (request?.type === "runFolder") {
    activeManualRuns++;
    try {
    resetMembershipCache();
    const selected = request.ruleIds || null;
    const runState=await getState();
    const wantedIds=selected ? new Set(selected.map(String)) : null;
    const runRules=(runState.rules||[]).filter(r=>r.enabled!==false && (!wantedIds || wantedIds.has(String(r.id)))).sort((a,b)=>(a.order??9999)-(b.order??9999));
    const runContext={state:runState,rules:runRules};
    const progressToken=String(request.progressToken||"");
    if(progressToken) await emitSimulationProgress(progressToken,0,0,request.folderName||"","Loading ExcludedBook cache");
    const cacheStart=Date.now();
    await prewarmMembershipCacheForRules(runRules);
    const cacheMs=Date.now()-cacheStart;
    const allFolderMessages=await mo30CollectFolderMessages(request.folderId);
    const folderCount=allFolderMessages.length;
    let count=0, matchedMessages=0, noMatch=0, matches={}, errors=0;
    let cancelled=false;
    const runStart=Date.now();
    for (const message of allFolderMessages) {
      if(progressToken && cancelledSimulations.has(progressToken)){cancelled=true;break;}
      try {
        const names=await processMessage(message,{name:request.folderName||"Manual run",id:request.folderId},false,selected,false,"Manual Run",runContext);
        count++;
        if(names.length){
          matchedMessages++;
          for(const n of names) matches[n]=(matches[n]||0)+1;
        } else noMatch++;
      } catch(e){ errors++; }
      if(count===1 || count%5===0 || count===folderCount) await emitSimulationProgress(progressToken,count,folderCount,request.folderName||"","Matching / actions");
    }
    if(progressToken)cancelledSimulations.delete(progressToken);
    return {folderCount,count,matchedMessages,noMatch,matches,errors,simulate:false,cancelled,performance:{excludedCacheMs:cacheMs,totalMs:Date.now()-runStart}};
    } finally {
      activeManualRuns=Math.max(0,activeManualRuns-1);
    }
  }

  if (request?.type === "getUnmatchedSenders") {
    const st=await messenger.storage.local.get({moUnmatchedSenders:[]});
    return {senders:Array.isArray(st.moUnmatchedSenders)?st.moUnmatchedSenders:[]};
  }
  if (request?.type === "addToExcludedBook") {
    const items=Array.isArray(request.senders)?request.senders:[]; let created=0;
    for(const x of items){const r=await addEmailToExcludedBook(x.email,x.name); if(r.created) created++;}
    const st=await messenger.storage.local.get({moUnmatchedSenders:[]});
    const done=new Set(items.map(x=>String(x.email||"").toLowerCase()));
    const q=(st.moUnmatchedSenders||[]).filter(x=>!done.has(String(x.email||"").toLowerCase()));
    await messenger.storage.local.set({moUnmatchedSenders:q});
    return {ok:true,created,bookId:await ensureExcludedBook(),remaining:q.length};
  }
  if (request?.type === "removeUnmatchedSenders") {
    const emails=new Set((request.emails||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean));
    const st=await messenger.storage.local.get({moUnmatchedSenders:[]});
    const q=(st.moUnmatchedSenders||[]).filter(x=>!emails.has(String(x.email||"").toLowerCase()));
    await messenger.storage.local.set({moUnmatchedSenders:q});
    return {ok:true,removed:emails.size,remaining:q.length};
  }
  if (request?.type === "assignUnmatchedToRule") {
    const emails=[...new Set((request.emails||[]).map(x=>String(x).trim().toLowerCase()).filter(Boolean))];
    const requested=emails.length;
    const st=await getState(); const rules=st.rules||[];
    const rule=rules.find(r=>String(r.id)===String(request.ruleId)); if(!rule) throw new Error("Filter not found.");
    const existing=(rule.conditions||[]).find(c=>c.field==="from" && c.operator==="oneOf");
    let alreadyPresent=0, added=0;
    if(existing){
      const vals=new Set(String(existing.value||"").split(/[\n,;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean));
      for(const x of emails){if(vals.has(x)) alreadyPresent++; else {vals.add(x);added++;}} existing.value=[...vals].join("\n");
    } else {
      // Never silently change an ALL rule to ANY: that changes the meaning of the entire filter.
      if(rule.matchMode!=="any" && request.allowModeChange!==true) return {ok:false,needsModeChange:true,ruleName:rule.name,matchMode:rule.matchMode||"all",added:0};
      rule.conditions=rule.conditions||[]; rule.conditions.push({field:"from",operator:"oneOf",value:emails.join("\n")}); added=emails.length;
      if(rule.matchMode!=="any") rule.matchMode="any";
    }
    await messenger.storage.local.set({rules});
    const uq=await messenger.storage.local.get({moUnmatchedSenders:[]}); const done=new Set(emails);
    const q=(uq.moUnmatchedSenders||[]).filter(x=>!done.has(String(x.email||"").toLowerCase()));
    await messenger.storage.local.set({moUnmatchedSenders:q});
    return {ok:true,ruleName:rule.name,requested,added,alreadyPresent,remaining:q.length};
  }
  if (request?.type === "processCapturedMessagesForRule") {
    const ids=[...new Set((request.messageIds||[]).map(Number).filter(Number.isFinite))]; let processed=0,matched=0,failed=0;
    resetMembershipCache();
    for(const id of ids){try{const m=await messenger.messages.get(id);if(!m)continue;const names=await processMessage(m,{name:"Unmatched captured mail"},false,[request.ruleId],false,"Unmatched Reprocess");processed++;if(names.length)matched++;}catch(e){failed++;}}
    return {ok:true,requested:ids.length,processed,matched,failed};
  }
  if (request?.type === "addSendersToAddressBook") {
    const items=Array.isArray(request.senders)?request.senders:[]; let created=0,existing=0,failed=0; const done=[];
    for(const x of items){try{const r=await ensureContactInBook(request.bookId,x.email,x.name);r.created?created++:existing++;done.push(x.email);}catch(e){failed++;}}
    const remaining=await removeUnmatchedEmails(done); resetMembershipCache();
    return {ok:true,processed:items.length,created,existing,failed,remaining};
  }
  if (request?.type === "createAddressBookWithSenders") {
    const bookId=await messenger.addressBooks.create({name:String(request.name||"").trim()}); let created=0,failed=0; const done=[];
    for(const x of request.senders||[]){try{await ensureContactInBook(bookId,x.email,x.name);created++;done.push(x.email);}catch(e){failed++;}}
    const remaining=await removeUnmatchedEmails(done); resetMembershipCache();
    return {ok:true,bookId,bookName:String(request.name||"").trim(),created,failed,remaining};
  }
  if (request?.type === "createMailingListWithSenders") {
    const listName=String(request.name||"").trim(); const listId=await messenger.addressBooks.mailingLists.create(request.bookId,{name:listName}); let membersAdded=0,failed=0; const done=[];
    for(const x of request.senders||[]){try{const c=await ensureContactInBook(request.bookId,x.email,x.name);await messenger.addressBooks.mailingLists.addMember(listId,c.contactId);membersAdded++;done.push(x.email);}catch(e){failed++;}}
    const remaining=await removeUnmatchedEmails(done); resetMembershipCache();
    return {ok:true,listId,listName,membersAdded,failed,remaining};
  }
    if (request?.type === "getAddressBooks") {
    const books=await messenger.addressBooks.list(true);
    return (books||[]).map(b=>({
      id:b.id,name:b.name,readOnly:!!b.readOnly,
      contacts:(b.contacts||[]).length,
      mailingLists:(b.mailingLists||[]).map(l=>({id:l.id,name:l.name}))
    }));
  }
  return null;
});
