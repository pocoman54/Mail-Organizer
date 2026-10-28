let folders = [], tags = [], rules = [];

const $ = s => document.querySelector(s);
function setStatus(target,kind,text){
  const el=typeof target==="string"?$(target):target;
  if(!el)return;
  el.classList.remove("statusError","statusWarning","statusSuccess","statusInfo");
  el.classList.add("statusBox",kind==="error"?"statusError":kind==="warning"?"statusWarning":kind==="success"?"statusSuccess":"statusInfo");
  el.textContent=text;
}
function diagnosticKind(text){
  const t=String(text||"");
  if(/\b(ERROR|CONFLICT)\b/i.test(t))return "error";
  if(/\b(WARNING|WARN|OVERLAP|DUPLICATE)\b/i.test(t))return "warning";
  if(/no (conflicts|duplicates|issues)|0 conflict/i.test(t))return "success";
  return "info";
}
let diagScope="mo";
let lastMoDiag="No diagnostic run yet.";
let lastTbDiag="No diagnostic run yet.";

function updateDiagIndicator(text, scope=diagScope){
  const t=String(text||"");
  const conflicts=(t.match(/\bCONFLICT:/gi)||[]).length;
  const overlaps=(t.match(/\bOVERLAP:/gi)||[]).length;
  const duplicates=(t.match(/\bDUPLICATE:/gi)||[]).length;
  const warnings=overlaps+duplicates;
  const label=scope==="tb"?"Thunderbird Source":"Mail Organizer";
  const el=$("#diagIndicator");
  el.classList.remove("diagBad","diagWarn","diagGood");
  if(conflicts){
    el.classList.add("diagBad");
    el.textContent=`${label}: 🔴 ${conflicts} conflict${conflicts===1?"":"s"} · 🟡 ${warnings} warning${warnings===1?"":"s"} — View Diagnostics`;
  } else if(warnings){
    el.classList.add("diagWarn");
    el.textContent=`${label}: 🟡 ${warnings} warning${warnings===1?"":"s"} — View Diagnostics`;
  } else if(/No diagnostic|not run/i.test(t)){
    el.textContent=`${label}: rule diagnostics have not been run this session`;
  } else {
    el.classList.add("diagGood");
    el.textContent=`${label}: 🟢 No diagnostic conflicts or warnings`;
  }
}
function renderDiagnostic(text, scope=diagScope){
  diagScope=scope;
  if(scope==="tb") lastTbDiag=text; else lastMoDiag=text;
  if($("#diagScopeLabel")) $("#diagScopeLabel").textContent=scope==="tb"?"Thunderbird Source Filters":"Mail Organizer Rules";
  setStatus("#diagReport",diagnosticKind(text),text);
  updateDiagIndicator(text,scope);
  const mo16d=document.getElementById("mo16DiagSection");
  if(mo16d && /\b(CONFLICT|OVERLAP|DUPLICATE|ERROR|WARNING):/i.test(String(text||""))) mo16d.open=true;
}
if($("#diagIndicator")) $("#diagIndicator").onclick=()=>{
  const d=document.getElementById("mo16DiagSection"); if(d)d.open=true;
  (d||$("#diagnosticsSection"))?.scrollIntoView({behavior:"smooth",block:"start"});
};
if($("#showMoDiag")) $("#showMoDiag").onclick=()=>showDiagScope("mo");
if($("#showTbDiag")) $("#showTbDiag").onclick=()=>showDiagScope("tb");

function diagnoseOneSet(inputRules, label){
  const rs=(inputRules||[]).map((r,i)=>({
    ...r,
    name:r.name||`${label} ${i+1}`,
    source:label,
    conditions:Array.isArray(r.conditions)?r.conditions:[],
    actions:Array.isArray(r.actions)?r.actions:[]
  }));
  try {
    return diagnose(rs,[]);
  } catch(e) {
    return `ERROR: ${label} diagnostic failed: ${e.message||e}`;
  }
}

function tbFiltersForDiagnostics(){
  return (parsedTbFilters||[]).map((f,i)=>{
    let actions=[];
    try {
      const resolved=resolveImportedActions(f);
      actions=resolved?.out||[];
    } catch(e) {
      actions=[];
    }
    return {
      id:`tbdiag-${i}`,
      name:f.name||`Thunderbird ${i+1}`,
      enabled:f.enabled!==false,
      matchMode:f.matchMode,
      matchAll:!!f.matchAll,
      conditions:Array.isArray(f.conditions)?structuredClone(f.conditions):[],
      actions
    };
  });
}

function showDiagScope(scope){
  if(scope==="tb") renderDiagnostic(lastTbDiag,"tb");
  else renderDiagnostic(lastMoDiag,"mo");
}
// 0.1.40: Thunderbird-source diagnostics are maintained separately from
// Mail Organizer diagnostics. They are never folded into the main conflict banner.
function mo40RefreshThunderbirdSourceDiagnostics(){
  lastTbDiag=diagnoseOneSet(tbFiltersForDiagnostics(),"Thunderbird source");
  return lastTbDiag;
}
async function rememberTbAnalysis(){
  try{
    // The Thunderbird import picker is tbFilterFile. Browsers/extensions cannot
    // retain the File object itself across restarts, but we can safely remember
    // its name plus the results of the last successful analysis.
    const input=document.getElementById("tbFilterFile");
    const file=input?.files?.[0] || null;
    const previous=(await messenger.storage.local.get({lastTbAnalysis:null})).lastTbAnalysis;
    const fileName=file?.name || previous?.fileName || previous?.filename || "msgFilterRules.dat";
    const info={
      fileName,
      filterCount:Array.isArray(parsedTbFilters)?parsedTbFilters.length:0,
      analyzedAt:new Date().toISOString()
    };
    await messenger.storage.local.set({
      lastTbAnalysis:info,
      lastTbFilterFileName:info.fileName,
      lastTbFilterCount:info.filterCount,
      lastTbAnalyzedAt:info.analyzedAt,
      mo34TbAnalysis:{...info,filters:Array.isArray(parsedTbFilters)?parsedTbFilters:[]}
    });
    showRememberedTb(info);
    return info;
  }catch(e){
    console.warn("Could not remember Thunderbird filter analysis",e);
    return null;
  }
}
function showRememberedTb(info){
  const el=document.getElementById("lastTbFile");
  if(!el) return;
  if(!info){
    el.textContent="No previously analyzed Thunderbird filter file remembered yet.";
    return;
  }
  const fileName=info.fileName || info.filename || "msgFilterRules.dat";
  const filterCount=Number.isFinite(Number(info.filterCount)) ? Number(info.filterCount) :
                    (Number.isFinite(Number(info.count)) ? Number(info.count) : 0);
  let when="";
  try {
    if(info.analyzedAt) when=new Date(info.analyzedAt).toLocaleString();
  } catch {}
  el.textContent=`Last analyzed Thunderbird filter file: ${fileName} — ${filterCount} filter(s)`+
    (when?` — analyzed ${when}`:"")+
    ". Browse again when you want to reread the current file.";
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function folderOptions(selected="") {
  return folders.map(f => `<option value="${esc(f.id)}" ${f.id===selected?"selected":""}>${esc(f.name)}</option>`).join("");
}
function tagOptions(selected="") {
  return tags.map(t => `<option value="${esc(t.key)}" ${t.key===selected?"selected":""}>${esc(t.tag)}</option>`).join("");
}
function newRule() {
  return { id: crypto.randomUUID(), name:"New Rule", enabled:true, matchMode:"all",
    conditions:[{field:"from",operator:"contains",value:""}],
    actions:[{type:"move",folderId:folders[0]?.id || ""}] };
}
function renderRules() {
  $("#rules").innerHTML = rules.map((r,ri) => `
  <div class="rule" data-ri="${ri}">
    <div class="row">
      <input class="rEnabled" type="checkbox" ${r.enabled!==false?"checked":""}>
      <input class="rName" value="${esc(r.name)}" style="min-width:260px">
      <span>Match</span>
      <select class="rMode"><option value="all" ${r.matchMode!=="any"?"selected":""}>ALL conditions</option><option value="any" ${r.matchMode==="any"?"selected":""}>ANY condition</option></select>
      <button class="up">↑</button><button class="down">↓</button><button class="clone">Clone</button><button class="delete">Delete</button>
    </div>
    <div><b>Conditions</b><div class="conditions">${(r.conditions||[]).map((c,ci)=>`
      <div class="cond" data-ci="${ci}">
       <select class="cField">
        ${["from","to","cc","subject","allAddresses"].map(x=>`<option value="${x}" ${c.field===x?"selected":""}>${x.toUpperCase()}</option>`).join("")}
       </select>
       <select class="cOp">
        ${[["contains","contains"],["notContains","does not contain"],["is","is exactly"],["isNot","is not"],["startsWith","starts with"],["endsWith","ends with"],["oneOf","is one of / vendor list"],["inAddressBook","sender is in any address book"],["notInAddressBook","sender is NOT in any address book"],["inMailingList","sender is in mailing list"],["notInMailingList","sender is NOT in mailing list"],["matchAll","MATCH ALL MESSAGES"],["regex","regex"]].map(([v,n])=>`<option value="${v}" ${c.operator===v?"selected":""}>${n}</option>`).join("")}
       </select>
       <input class="cValue" value="${esc(c.value)}">
       <button class="delCond">×</button>
      </div>`).join("")}</div>
      <button class="addCond">+ Condition</button>
    </div>
    <div style="margin-top:10px"><b>Actions</b><div class="actions">${(r.actions||[]).map((a,ai)=>`
      <div class="act" data-ai="${ai}">
       <select class="aType">
        ${[["move","Move to folder"],["copy","Copy to folder"],["markRead","Mark read"],["markUnread","Mark unread"],["star","Star"],["unstar","Remove star"],["tag","Add tag"],["delete","Delete message"]].map(([v,n])=>`<option value="${v}" ${a.type===v?"selected":""}>${n}</option>`).join("")}
       </select>
       <span class="aParam">${["move","copy"].includes(a.type) ? `<select class="aFolder">${folderOptions(a.folderId)}</select>` : a.type==="tag" ? `<select class="aTag">${tagOptions(a.tagKey)}</select>` : ""}</span>
       <button class="delAct">×</button>
      </div>`).join("")}</div>
      <button class="addAct">+ Action</button>
    </div>
  </div>`).join("");
  renderManualRules();
}
function readRulesFromUI() {
  const cards=[...document.querySelectorAll("#rules > .rule[data-ri]")];
  return cards.map((el,pos) => {
    const ri=Number(el.dataset.ri);
    const base=rules[Number.isFinite(ri) ? ri : pos] || {};
    const nameEl=el.querySelector(".rName");
    const modeEl=el.querySelector(".rMode");
    const conditions=[...el.querySelectorAll(".cond")].map(c=>{
      const field=c.querySelector(".cField")?.value;
      const operator=c.querySelector(".cOp")?.value;
      const value=c.querySelector(".cValue")?.value ?? "";
      return (field && operator) ? {field,operator,value} : null;
    }).filter(Boolean);
    const actions=[...el.querySelectorAll(".act")].map(a=>{
      const type=a.querySelector(".aType")?.value;
      if(!type) return null;
      const obj={type};
      const folder=a.querySelector(".aFolder");
      const tag=a.querySelector(".aTag");
      if(folder) obj.folderId=folder.value;
      if(tag) obj.tagKey=tag.value;
      return obj;
    }).filter(Boolean);
    return {
      ...base,
      order:pos,
      enabled:el.querySelector(".rEnabled")?.checked === true,
      name:(nameEl?.value || base.name || `Rule ${pos+1}`).trim(),
      matchMode:modeEl?.value || base.matchMode || "all",
      conditions,
      actions
    };
  });
}
function renderManualRules() {
  const enabledCount=rules.filter(r=>r.enabled!==false).length;
  const disabledCount=rules.length-enabledCount;
  $("#manualRuleStatus").textContent=`${rules.length} rule(s): ${enabledCount} enabled, ${disabledCount} disabled. Disabled rules can be selected for simulation.`;
  $("#manualRules").innerHTML = rules.length
    ? rules.map(r => `<label style="display:inline-block;min-width:260px;margin:4px 10px 4px 0">
        <input type="checkbox" class="manualRule" value="${esc(r.id)}" checked>
        ${esc(r.name)} ${r.enabled===false?'<b>[DISABLED]</b>':'<span>[enabled]</span>'}
      </label>`).join("")
    : '<span class="muted">No Mail Organizer rules have been imported or created yet.</span>';
  setTimeout(()=>{mo27ApplyCatchAllUI();mo29ApplyPicker();},0);
}

function mo29DisplayName(name){ return String(name||"").replace(/^TB:\s*/i,""); }
function mo29ApplyPicker(){
  const q=($("#filterSearch")?.value||"").trim().toLocaleLowerCase();
  const order=$("#filterOrder")?.value||"original";
  const box=$("#manualRules");
  if(!box) return;
  box.style.fontSize=($("#filterFont")?.value||"12")+"px";
  const rows=[...box.querySelectorAll("label")];
  rows.forEach((row,i)=>{
    if(row.dataset.originalIndex==null) row.dataset.originalIndex=String(i);
    const cb=row.querySelector(".manualRule");
    const rule=cb ? rules.find(x=>String(x.id)===String(cb.value)) : null;
    const nm=mo29DisplayName(rule?.name||row.textContent);
    row.dataset.sortName=nm.toLocaleLowerCase();
    row.style.display=(!q || nm.toLocaleLowerCase().includes(q)) ? "" : "none";
    const textNodes=[...row.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE);
    textNodes.forEach(n=>{ if(/^(\s*)TB:\s*/i.test(n.textContent)) n.textContent=n.textContent.replace(/^(\s*)TB:\s*/i,"$1"); });
  });
  rows.sort((a,b)=>order==="name" ? a.dataset.sortName.localeCompare(b.dataset.sortName) : Number(a.dataset.originalIndex)-Number(b.dataset.originalIndex));
  rows.forEach(r=>box.appendChild(r));
  localStorage.setItem("mo29FilterOrder",order);
  localStorage.setItem("mo29FilterFont",$("#filterFont")?.value||"12");
}
function mo29InitPicker(){
  if($("#filterOrder")) $("#filterOrder").value=localStorage.getItem("mo29FilterOrder")||"original";
  if($("#filterFont")) $("#filterFont").value=localStorage.getItem("mo29FilterFont")||"12";
  $("#filterSearch")?.addEventListener("input",mo29ApplyPicker);
  $("#filterOrder")?.addEventListener("change",mo29ApplyPicker);
  $("#filterFont")?.addEventListener("change",mo29ApplyPicker);
  $("#selectVisibleRules")?.addEventListener("click",()=>{
    document.querySelectorAll(".manualRule").forEach(cb=>{
      const row=cb.closest("label");
      if(row && row.style.display!=="none" && cb.dataset.catchAll!=="1") cb.checked=true;
    });
  });
  mo29ApplyPicker();
}

function mo27IsCatchAllRule(r){
  return !!r && (r.matchAll===true || (((r.conditions||[]).length===0) && String(r.matchMode||"all").toLowerCase()==="all"));
}
function mo27ApplyCatchAllUI(){
  document.querySelectorAll(".manualRule").forEach(cb=>{
    const r=rules.find(x=>String(x.id)===String(cb.value));
    if(!mo27IsCatchAllRule(r)) return;
    cb.checked=false; cb.dataset.catchAll="1";
    const label=cb.closest("label")||cb.parentElement;
    if(label && !label.querySelector(".catchAllTag")){
      const tag=document.createElement("strong"); tag.className="catchAllTag";
      tag.textContent=" ⚠ CATCH-ALL"; tag.title="Matches every message; excluded from normal simulation by default.";
      label.appendChild(tag);
    }
  });
}
function mo27Limit(){
  const v=$("#simLimit")?.value||"50";
  return v==="all"?null:Math.max(1,Number(v)||50);
}

function selectedManualRuleIds() {
  return [...document.querySelectorAll(".manualRule:checked")].map(x => x.value);
}
function summaryText(result, heading) {
  const lines = [
    heading,
    `Scanned: ${result.count}`,
    `Matched messages: ${result.matchedMessages}`,
    `No match: ${result.noMatch}`,
    `Errors: ${result.errors}`
  ];
  const entries = Object.entries(result.matches || {});
  if (entries.length) {
    lines.push("", "Matches by filter:");
    for (const [name,count] of entries) lines.push(`${name}: ${count}`);
  }
  return lines.join("\n");
}


function renderRunSummary(result, heading, isSimulation=true) {
  const el=$("#simResult");
  if(!el) return;
  const count=Number(result?.count||0);
  const matched=Number(result?.matchedMessages||0);
  const noMatch=Number(result?.noMatch||0);
  const errors=Number(result?.errors||0);
  const entries=Object.entries(result?.matches||{}).sort((a,b)=>b[1]-a[1]);

  const high=entries.filter(([,n])=>count>0 && (Number(n)/count)>=0.80);
  const kind=errors>0 ? "error" : high.length ? "warning" : "success";
  el.className="simSummary statusBox "+(kind==="error"?"statusError":kind==="warning"?"statusWarning":"statusSuccess");

  const warningHtml=high.length ? `
    <div class="simHighWarning"><b>⚠ High-match rule${high.length===1?"":"s"} — review before running for real.</b>
      ${high.map(([name,n])=>{
        const pct=count ? (100*Number(n)/count).toFixed(1) : "0.0";
        return `<div><b>${esc(name)}</b>: ${Number(n).toLocaleString()} / ${count.toLocaleString()} messages (${pct}%)</div>`;
      }).join("")}
    </div>` : "";

  const rows=entries.length ? entries.map(([name,n])=>{
    const pct=count ? (100*Number(n)/count).toFixed(1) : "0.0";
    const hot=count>0 && Number(n)/count>=0.80;
    return `<tr class="${hot?"simHotRow":""}"><td>${esc(name)}</td><td>${Number(n).toLocaleString()}</td><td>${pct}%</td></tr>`;
  }).join("") : `<tr><td colspan="3">No filter matches.</td></tr>`;

  el.innerHTML=`
    <div class="simHeading">${esc(heading)}</div>
    <div class="simStats">
      <span><b>Folder contains:</b> ${Number(result?.folderCount ?? count).toLocaleString()}</span>
      <span><b>Tested:</b> ${count.toLocaleString()}</span>
      <span><b>Matched messages:</b> ${matched.toLocaleString()}</span>
      <span><b>No match:</b> ${noMatch.toLocaleString()}</span>
      <span><b>Errors:</b> ${errors.toLocaleString()}</span>
    </div>
    ${warningHtml}
    <details class="simMatches" ${high.length?"open":""}>
      <summary><b>Matches by filter (${entries.length})</b></summary>
      <table><thead><tr><th>Filter</th><th>Matches</th><th>% of scanned</th></tr></thead><tbody>${rows}</tbody></table>
    </details>
    ${isSimulation?'<div class="simSafe"><b>Simulation only — nothing was moved or changed.</b></div>':""}
  `;
}


function mo30FmtTime(v){
  if(!v) return "not recorded";
  try{return new Date(v).toLocaleString();}catch{return String(v);}
}
async function mo30RefreshStorageStatus(){
  const el=$("#storageStatus"); if(!el) return;
  try{
    const s=await messenger.storage.local.get(["rules","mo30LastRulesSaved","mo30LastBackup"]);
    const rr=Array.isArray(s.rules)?s.rules:[];
    el.textContent=`Rule database: ${rr.length} stored locally · Last saved: ${mo30FmtTime(s.mo30LastRulesSaved)}`;
    el.title=`Extension storage.local. Last automatic backup: ${mo30FmtTime(s.mo30LastBackup)}`;
  }catch(e){ el.textContent="Rule database status unavailable: "+e.message; }
}
async function mo30BackupRules(reason="before change"){
  const s=await messenger.storage.local.get(["rules"]);
  const rr=Array.isArray(s.rules)?s.rules:[];
  const stamp=new Date().toISOString();
  const key="mo30RulesBackup";
  await messenger.storage.local.set({[key]:{stamp,reason,rules:rr},mo30LastBackup:stamp});
}

async function save() {
  rules=readRulesFromUI();
  const settings={enabled:$("#enabled").checked, stopAfterFirstMatch:$("#stopFirst").checked, maxLog:1000};
  await messenger.storage.local.set({rules,settings});
  $("#notice").textContent="Saved.";
  setTimeout(()=>$("#notice").textContent="",1800);
  await messenger.storage.local.set({
    mo30LastRulesSaved:new Date().toISOString(),
    mo34RulesAuthority:{at:new Date().toISOString(),source:"Mail Organizer user-saved rules"}
  });
  await mo30RefreshStorageStatus();
}
async function loadLog() {
  const {log=[]}=await messenger.storage.local.get({log:[]});
  $("#log").innerHTML=log.slice(0,300).map(x=>`<tr>
    <td>${esc(new Date(x.time).toLocaleString())}</td><td class="status-${esc(x.status)}">${esc(x.status)}</td>
    <td>${esc(x.rule)}</td><td>${esc(x.author)}</td><td>${esc(x.subject)}</td><td>${esc(x.detail)}</td></tr>`).join("");
}
document.addEventListener("click", e=>{
  const ruleEl=e.target.closest("#rules > .rule"); if(!ruleEl)return;
  const ri=Number(ruleEl.dataset.ri);
  if(e.target.classList.contains("delete")) { rules=readRulesFromUI(); rules.splice(ri,1); renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0); }
  if(e.target.classList.contains("clone")) { rules=readRulesFromUI(); const c=structuredClone(rules[ri]); c.id=crypto.randomUUID(); c.name+=" Copy"; rules.splice(ri+1,0,c); renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0); }
  if(e.target.classList.contains("up") && ri>0) { rules=readRulesFromUI(); [rules[ri-1],rules[ri]]=[rules[ri],rules[ri-1]]; renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0); }
  if(e.target.classList.contains("down") && ri<rules.length-1) { rules=readRulesFromUI(); [rules[ri+1],rules[ri]]=[rules[ri],rules[ri+1]]; renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0); }
  if(e.target.classList.contains("addCond")) { rules=readRulesFromUI(); rules[ri].conditions.push({field:"from",operator:"contains",value:""}); renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0); }
  if(e.target.classList.contains("delCond")) { rules=readRulesFromUI(); const ci=Number(e.target.closest(".cond").dataset.ci); rules[ri].conditions.splice(ci,1); renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0); }
  if(e.target.classList.contains("addAct")) { rules=readRulesFromUI(); rules[ri].actions.push({type:"move",folderId:folders[0]?.id||""}); renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0); }
  if(e.target.classList.contains("delAct")) { rules=readRulesFromUI(); const ai=Number(e.target.closest(".act").dataset.ai); rules[ri].actions.splice(ai,1); renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0); }
});
document.addEventListener("change", e=>{
  if(e.target.classList.contains("aType")) {
    rules=readRulesFromUI();
    const ruleEl=e.target.closest("#rules > .rule"); if(!ruleEl)return;
    const ri=Number(ruleEl.dataset.ri), ai=Number(e.target.closest(".act")?.dataset.ai);
    const type=e.target.value; rules[ri].actions[ai]={type};
    if(["move","copy"].includes(type)) rules[ri].actions[ai].folderId=folders[0]?.id||"";
    if(type==="tag") rules[ri].actions[ai].tagKey=tags[0]?.key||"";
    renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0);
  }
});
$("#addRule").onclick=()=>{ rules=readRulesFromUI(); rules.push(newRule()); renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0); };
$("#save").onclick=save;
$("#refreshLog").onclick=loadLog;
$("#clearLog").onclick=async()=>{await messenger.storage.local.set({log:[]});loadLog();};
$("#export").onclick=async()=>{
  await save(); const data=await messenger.storage.local.get(["rules","settings"]);
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="mail-organizer-rules.json"; a.click(); URL.revokeObjectURL(a.href);
};
$("#import").onchange=async e=>{
  const f=e.target.files[0]; if(!f)return;
  try { const data=JSON.parse(await f.text()); rules=data.rules||[]; await messenger.storage.local.set({rules,settings:data.settings||{}}); location.reload(); }
  catch(err){ $("#notice").textContent="Import failed: "+err.message; }
};
$("#selectAllRules").onclick=()=>{document.querySelectorAll(".manualRule").forEach(x=>x.checked=true);mo27ApplyCatchAllUI();};
$("#selectNoRules").onclick=()=>document.querySelectorAll(".manualRule").forEach(x=>x.checked=false);

$("#simulate").onclick=async()=>{
  mo16SetBusy(true,"simulation");
  try {
  mo27ApplyCatchAllUI();
  // 0.1.47: capture the user's exact manual selection BEFORE any rule synchronization.
  const ids=selectedManualRuleIds();
  if(!ids.length) throw new Error("Select at least one filter.");
  await mo47SyncEditorRulesForRun("simulation", ids);
  if(!$("#simFolder").value){ $("#simResult").textContent="Choose a folder."; return; }
  if(!ids.length){ $("#simResult").textContent="Select at least one filter."; return; }
  const maxMessages=mo27Limit();
  if(maxMessages===null && !confirm("Full-folder simulation selected. This may scan a large number of messages. Continue?")) return;
  $("#simResult").textContent="Simulating...";
  const result=await messenger.runtime.sendMessage({
    type:"simulateFolder", folderId:$("#simFolder").value,
    folderName:$("#simFolder").selectedOptions[0]?.textContent || "",
    ruleIds:ids, maxMessages
  });
  renderRunSummary(result,"SIMULATION — NOTHING MOVED",true);
  loadLog();

  } finally { mo16SetBusy(false,"simulation"); }
};


$("#whyNoMatch").onclick=async()=>{
  mo27ApplyCatchAllUI();
  const ids=selectedManualRuleIds();
  if(!$("#simFolder").value){ $("#simResult").textContent="Choose a folder."; return; }
  if(!ids.length){ $("#simResult").textContent="Select at least one filter."; return; }
  const maxMessages=mo27Limit();
  if(maxMessages===null && !confirm("Analyze the entire folder for Why didn’t it match? This may take a while. Continue?")) return;
  $("#simResult").textContent="Analyzing selected messages...";
  const r=await messenger.runtime.sendMessage({type:"diagnoseMatch",folderId:$("#simFolder").value,ruleIds:ids,maxMessages});
  const summaries=r?.summaries||[], matches=r?.matchingMessages||[], misses=r?.nonmatchingSamples||[];
  const renderMessage=(m,all)=>`<div class="diagSample"><b>${esc(m.subject||"(no subject)")}</b><br><span class="muted">${esc(m.author||"")}</span>
    ${(m.details||[]).filter(d=>all||d.matched).map(d=>`<div class="${d.matched?"diagPass":"diagFail"}"><b>${esc(d.rule)}</b> — ${d.matched?"MATCH":"NO MATCH"}
      ${(d.checks||[]).filter(c=>all||c.ok).map(c=>`<div>${c.ok?"✓":"✗"} ${esc(c.field)} ${esc(c.operator)} <b>${esc(c.expected??"")}</b><br><span class="muted">Actual: ${esc(c.actual??"")}</span></div>`).join("")}
    </div>`).join("")}</div>`;
  $("#simResult").className="simSummary statusBox statusInfo";
  $("#simResult").innerHTML=`<div class="simHeading">Why did / didn’t it match? — Folder contains ${Number(r?.folderCount ?? (r?.scanned || 0)).toLocaleString()} · Tested ${Number(r?.scanned||0).toLocaleString()}</div>`+
    summaries.map(s=>`<div class="diagRule"><b>${esc(s.rule)}</b> — ${s.matches.toLocaleString()} match(es) / ${Number(r.scanned||0).toLocaleString()}</div>`).join("")+
    `<details open class="matchDiag"><summary><b>Matching messages (${matches.length})</b></summary>${matches.length?matches.map(m=>renderMessage(m,false)).join(""):'<div class="muted">No matching messages.</div>'}</details>`+
    `<details class="matchDiag"><summary><b>Nonmatching samples (${misses.length})</b></summary>${misses.length?misses.map(m=>renderMessage(m,true)).join(""):'<div class="muted">No nonmatching samples.</div>'}</details>`;
};

$("#runSelected").onclick=async()=>{
  mo16SetBusy(true,"run");
  try {
  // 0.1.47: capture exact selected IDs first; synchronization is forbidden from changing them.
  const ids=selectedManualRuleIds();
  if(!ids.length) throw new Error("Select at least one filter.");
  await mo47SyncEditorRulesForRun("real run", ids);
  const afterIds=selectedManualRuleIds();
  if(afterIds.length!==ids.length || ids.some(id=>!afterIds.includes(id))){
    throw new Error(`RUN ABORTED — filter selection changed unexpectedly (${ids.length} selected before, ${afterIds.length} after). Nothing was run.`);
  }
  const folderId=$("#simFolder").value;
  const folderName=$("#simFolder").selectedOptions[0]?.textContent || "";
  if(!folderId){ $("#simResult").textContent="Choose a folder."; return; }
  if(!ids.length){ $("#simResult").textContent="Select at least one filter."; return; }
  const selectedRules=rules.filter(r=>ids.includes(String(r.id)));
  const plan=selectedRules.slice(0,3).map(r=>{
    const acts=(r.actions||[]).map(a=>(a.type==="move"||a.type==="copy") ? `${a.type.toUpperCase()} → ${mo46FolderName(a.folderId)}` : String(a.type||"action")).join(", ");
    return `${r.name}: ${acts||"(no actions)"}`;
  }).join("\n");
  const more=selectedRules.length>3 ? `\n… plus ${selectedRules.length-3} more selected filter(s)` : "";
  const ok=confirm(`REAL FILTER RUN

Source: ${folderName}
Selected: ${ids.length}

${plan}${more}

Continue?`);
  if(!ok)return;
  $("#simResult").textContent="Running selected filters...";
  const result=await messenger.runtime.sendMessage({
    type:"runFolder", folderId, folderName, ruleIds:ids
  });
  renderRunSummary(result,"RUN COMPLETE",false);
  loadLog();

  } finally { mo16SetBusy(false,"run"); }
};

let parsedTbFilters = [];

function tbUnquote(v="") {
  v=v.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch {}
    return v.slice(1,-1).replace(/\\"/g,'"').replace(/\\\\/g,"\\");
  }
  return v;
}
function splitTbBlocks(text) {
  const lines=text.replace(/\r\n/g,"\n").split("\n");
  const blocks=[]; let cur=null;
  for (const line of lines) {
    if (/^\s*name=/.test(line)) {
      if(cur) blocks.push(cur);
      cur=[line];
    } else if(cur) cur.push(line);
  }
  if(cur) blocks.push(cur);
  return blocks;
}
function parseTbConditionToken(token) {
  token=token.trim();
  if(token.startsWith("(") && token.endsWith(")")) token=token.slice(1,-1);
  const parts=token.split(",");
  if(parts.length<3) return null;
  const fieldRaw=parts.shift().trim().toLowerCase();
  const opRaw=parts.shift().trim().toLowerCase();
  const value=parts.join(",").trim();
  // Thunderbird's UI calls this "Author from mailing list / is in my address book".
  // Preserve it as a real sender-address-book predicate rather than flattening it to From text.
  if((fieldRaw==="author from mailing list" || fieldRaw==="from in address book" || fieldRaw==="sender") &&
     (opRaw==="is in my address book" || opRaw==="is in address book"))
    return {field:"from",operator:"inAddressBook",value,addressBookName:value};
  if((fieldRaw==="author from mailing list" || fieldRaw==="from in address book" || fieldRaw==="sender") &&
     (opRaw==="isn't in my address book" || opRaw==="is not in my address book" || opRaw==="is not in address book"))
    return {field:"from",operator:"notInAddressBook",value,addressBookName:value};
  const fmap={from:"from",to:"to",cc:"cc",bcc:"bcc",subject:"subject",body:"body",date:"date",priority:"priority",status:"status",size:"size","size (kb)":"size","age in days":"ageDays","junk status":"junkStatus","junk percent":"junkPercent","attachment status":"attachment","all addresses":"allAddresses","to or cc":"toOrCc"};
  const omap={contains:"contains","doesn't contain":"notContains","does not contain":"notContains",
              "is":"is","isn't":"isNot","is not":"isNot","begins with":"startsWith","ends with":"endsWith",
              "is greater than":"greaterThan","is less than":"lessThan","is before":"before","is after":"after"};
  if(!fmap[fieldRaw] || !omap[opRaw]) return {unsupported:`(${token})`};
  return {field:fmap[fieldRaw],operator:omap[opRaw],value};
}
function parseTbCondition(expr) {
  const conditions=[], unsupported=[];
  const mode=/\bOR\b/i.test(expr) ? "any" : "all";
  const tokens=expr.match(/\([^)]*\)/g) || [];
  for(const t of tokens) {
    const c=parseTbConditionToken(t);
    if(!c) continue;
    if(c.unsupported) unsupported.push(c.unsupported); else conditions.push(c);
  }
  return {conditions,unsupported,matchMode:mode};
}
function normalizeTbAction(s="") {
  return s.toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
}
function parseTbFile(text) {
  return splitTbBlocks(text).map((lines,index)=>{
    const kv={actions:[],actionValues:[]};
    for(const line of lines) {
      const eq=line.indexOf("="); if(eq<0) continue;
      const key=line.slice(0,eq).trim(), val=tbUnquote(line.slice(eq+1));
      if(key==="action") kv.actions.push(val);
      else if(key==="actionValue") kv.actionValues.push(val);
      else kv[key]=val;
    }

    const raw=(kv.condition || "").trim();
    let parsed;
    if (/^ALL$/i.test(raw)) {
      parsed={conditions:[{field:"all",operator:"matchAll",value:""}],unsupported:[],matchMode:"all", matchAll:true};
    } else {
      parsed=parseTbCondition(raw);
      parsed.matchAll=false;
    }

    const actions=[], unsupported=[...parsed.unsupported], notes=[];
    let avi=0;
    for(const a0 of kv.actions) {
      const a=normalizeTbAction(a0);
      let val=null;
      if(["move to folder","copy to folder","add tag"].includes(a)) val=kv.actionValues[avi++];

      if(a==="mark read" || a==="markread") actions.push({type:"markRead"});
      else if(a==="mark unread" || a==="markunread") actions.push({type:"markUnread"});
      else if(a==="mark flagged" || a==="markflagged" || a==="flag") actions.push({type:"star"});
      else if(a==="unmark flagged" || a==="unflag") actions.push({type:"unstar"});
      else if(a==="move to folder" || a==="movetofolder") actions.push({type:"move",tbFolderUri:val});
      else if(a==="copy to folder" || a==="copytofolder") actions.push({type:"copy",tbFolderUri:val});
      else if(a==="add tag" || a==="addtag") actions.push({type:"tag",tagKey:val});
      else if(a==="delete" || a==="delete message") actions.push({type:"delete"});
      else if(a==="archive" || a==="archive message") actions.push({type:"archive"});
      else if(a==="set junk score" || a==="junk" || a==="mark junk") actions.push({type:"junk",value:"Junk"});
      else if(a==="mark not junk") actions.push({type:"junk",value:"Not Junk"});
      else if(a==="stop execution" || a==="stopexecution") actions.push({type:"stop"});
      else unsupported.push(`action:${a0}${val?`=${val}`:""}`);
    }

    // If an older Thunderbird variant encodes address-book membership in a form the
    // token parser cannot decode, retain it for review instead of guessing a target book.
    const mailingList = /mailing-list/i.test(raw) || /jsaddrbook:\/\//i.test(raw);
    if (mailingList && !(parsed.conditions||[]).some(c=>c.field==="addressBook"||c.field==="mailingList")) {
      notes.push("Thunderbird address-book/mailing-list predicate detected; select its target book in the editor if import could not resolve it.");
    } else if ((parsed.conditions||[]).some(c=>c.field==="addressBook")) {
      notes.push("Imported Thunderbird sender address-book membership as an executable condition");
    }

    return {
      index, name:kv.name || `Thunderbird Filter ${index+1}`,
      enabled:String(kv.enabled).toLowerCase()!=="no",
      type:kv.type || "", matchMode:parsed.matchMode, matchAll:parsed.matchAll,
      conditions:parsed.conditions, actions, unsupported, notes,
      rawCondition:raw
    };
  });
}
function conversionStatus(f) {
  if (!f.unsupported.length) {
    return {status:"SUPPORTED", reason:"All recognized conditions and actions can be converted.", supported:true};
  }

  const usefulConditions = (f.conditions || []).length > 0;
  const usefulActions = (f.actions || []).length > 0;
  const onlyReviewControl = f.unsupported.every(x =>
    /mailing-list\/address-book|condition:ALL/i.test(x)
  );

  if ((usefulConditions || f.matchAll || onlyReviewControl) && usefulActions) {
    return {
      status:"PARTIAL",
      reason:f.unsupported.join("; "),
      supported:false
    };
  }

  return {
    status:"UNSUPPORTED",
    reason:f.unsupported.join("; ") || "No safely convertible condition/action combination.",
    supported:false
  };
}
function renderTbFilters() {
  $("#tbFilters").innerHTML=parsedTbFilters.length ? `
    <table><thead><tr><th></th><th>Filter</th><th>Enabled</th><th>Conditions</th><th>Actions</th><th>Status / explanation</th></tr></thead><tbody>
    ${parsedTbFilters.map((f,i)=>{
      const cv=conversionStatus(f);
      const actionText=f.actions.map(a=>a.type+(a.tbFolderUri?` → ${a.tbFolderUri}`:"")+(a.tagKey?` → ${a.tagKey}`:"")).join("; ");
      const noteText=(f.notes||[]).join("; ");
      const checked=cv.supported ? "checked" : "";
      return `<tr>
      <td><input type="checkbox" class="tbPick" value="${i}" data-supported="${cv.supported?"true":"false"}" ${checked}></td>
      <td>${esc(f.name)}</td><td>${f.enabled?"Yes":"No"}</td>
      <td>${esc(f.rawCondition || "(none)")}</td>
      <td>${esc([actionText,noteText].filter(Boolean).join("; "))}</td>
      <td><b>${cv.status}</b><br><span class="small">${esc(cv.reason)}</span></td>
    </tr>`}).join("")}</tbody></table>` : "";
  updateTbSelectedCount();
}
function updateTbSelectedCount() {
  const boxes=[...document.querySelectorAll(".tbPick")];
  const selected=boxes.filter(x=>x.checked).length;
  const supported=boxes.filter(x=>x.dataset.supported==="true").length;
  $("#tbSelectedCount").textContent=boxes.length ? `${selected} selected / ${boxes.length} total (${supported} fully supported)` : "";
}
$("#tbSelectAll").onclick=()=>{
  document.querySelectorAll(".tbPick").forEach(x=>x.checked=true);
  updateTbSelectedCount();
};
$("#tbSelectSupported").onclick=()=>{
  document.querySelectorAll(".tbPick").forEach(x=>x.checked=x.dataset.supported==="true");
  updateTbSelectedCount();
};
$("#tbSelectNone").onclick=()=>{
  document.querySelectorAll(".tbPick").forEach(x=>x.checked=false);
  updateTbSelectedCount();
};
document.addEventListener("change", e=>{
  if(e.target.classList.contains("tbPick")) updateTbSelectedCount();
});

function normalizedCondition(c) {
  return [c.field,c.operator,String(c.value||"").trim().toLowerCase()].join("|");
}
function ruleSignature(r) {
  return `${r.matchMode||"all"}::${(r.conditions||[]).map(normalizedCondition).sort().join("&&")}`;
}
function actionSignature(r) {
  return (r.actions||[]).map(a=>`${a.type}:${a.folderId||a.tbFolderUri||a.tagKey||""}`).sort().join("&&");
}
function diagnose(ruleSet, tbSet=[]) {
  const lines=[], all=[];
  for(const r of ruleSet) all.push({source:"Mail Organizer",rule:r});
  for(const r of tbSet) all.push({source:"Thunderbird",rule:r});
  let findings=0;
  for(let i=0;i<all.length;i++) for(let j=i+1;j<all.length;j++) {
    const A=all[i], B=all[j];
    const sa=ruleSignature(A.rule), sb=ruleSignature(B.rule);
    if(!sa || !sb || sa.endsWith("::") || sb.endsWith("::")) continue;
    if(sa===sb) {
      findings++;
      const sameAction=actionSignature(A.rule)===actionSignature(B.rule);
      lines.push(`${sameAction?"DUPLICATE":"CONFLICT"}: ${A.source} "${A.rule.name}" ↔ ${B.source} "${B.rule.name}"`);
      lines.push(`  Conditions are the same.`);
      lines.push(`  ${sameAction?"Actions also appear the same.":"Actions differ: "+actionSignature(A.rule)+"  VS  "+actionSignature(B.rule)}`);
    } else {
      const ac=new Set((A.rule.conditions||[]).map(normalizedCondition));
      const bc=new Set((B.rule.conditions||[]).map(normalizedCondition));
      const overlap=[...ac].filter(x=>bc.has(x));
      if(overlap.length) {
        findings++;
        lines.push(`OVERLAP: ${A.source} "${A.rule.name}" ↔ ${B.source} "${B.rule.name}"`);
        lines.push(`  Shared condition(s): ${overlap.join(", ")}`);
      }
    }
  }
  if(!findings) lines.push("No exact duplicates, direct conflicts, or shared-condition overlaps detected.");
  lines.unshift(`Diagnostic findings: ${findings}`, "");
  return lines.join("\n");
}
function resolveImportedActions(f) {
  const out=[], unresolved=[];
  for(const a of f.actions) {
    if(["move","copy"].includes(a.type)) {
      const uri=(a.tbFolderUri||"").toLowerCase();
      const leaf=decodeURIComponent((a.tbFolderUri||"").split("/").pop()||"").toLowerCase();
      const candidates=folders.filter(x=>{
        const n=x.name.toLowerCase();
        return leaf && (n.endsWith(": "+leaf) || n.endsWith("/"+leaf) || n===leaf);
      });
      if(candidates.length===1) out.push({type:a.type,folderId:candidates[0].id});
      else unresolved.push(`${a.type} destination "${a.tbFolderUri}"`);
    } else out.push({...a});
  }
  return {out,unresolved};
}

async function showAddressBookStatus() {
  try {
    const books=await messenger.runtime.sendMessage({type:"getAddressBooks"});
    const lists=books.reduce((n,b)=>n+(b.mailingLists||[]).length,0);
    const contacts=books.reduce((n,b)=>n+(b.contacts||0),0);
    const existing=$("#tbSummary").textContent;
    ($("#tbSummary").style.display=""), $("#tbSummary").textContent=existing + (existing?" ":"") +
      `Thunderbird contacts available: ${books.length} address book(s), ${contacts} contact(s), ${lists} mailing list(s).`;
  } catch(e) {}
}
$("#analyzeTb").onclick=async()=>{
  try {
  const file=$("#tbFilterFile").files[0];
  if(!file){ ($("#tbSummary").style.display=""), $("#tbSummary").textContent="Choose msgFilterRules.dat first."; return; }
  parsedTbFilters=parseTbFile(await file.text());
  renderTbFilters();
  mo40RefreshThunderbirdSourceDiagnostics();
  $("#importTb").disabled=!parsedTbFilters.length;
  const statuses=parsedTbFilters.map(conversionStatus);
  const supported=statuses.filter(x=>x.status==="SUPPORTED").length;
  const partial=statuses.filter(x=>x.status==="PARTIAL").length;
  const unsupported=statuses.filter(x=>x.status==="UNSUPPORTED").length;
  ($("#tbSummary").style.display=""), $("#tbSummary").textContent=`Found ${parsedTbFilters.length} Thunderbird filter(s): ${supported} SUPPORTED, ${partial} PARTIAL, ${unsupported} UNSUPPORTED. Only SUPPORTED filters are preselected.`;
  await showAddressBookStatus();
  // 0.1.21: remember the analyzed file NAME immediately after successful analysis.
  // Browser security does not allow reopening the local file automatically; this
  // remembers the name/count/time so the user can see which source was last used.
  await rememberTbAnalysis();
  {
  const cards=document.querySelectorAll("#rules > .rule[data-ri]");
  const sourceRules=cards.length ? readRulesFromUI() : rules;
  lastMoDiag=diagnoseOneSet(sourceRules,"Mail Organizer");
  renderDiagnostic(lastMoDiag,"mo");
}

  } catch(e) {
    setStatus("#tbSummary","error","ANALYZE ERROR: "+(e.message||e));
    $("#importTb").disabled=true;
    console.error("Mail Organizer analyze failure",e);
  }
};
$("#diagnoseRules").onclick=async()=>{
  const stored=await messenger.storage.local.get({rules:[]});
  const storedRules=Array.isArray(stored.rules) ? stored.rules : [];
  // 0.1.40: Diagnose Mail Organizer means Mail Organizer ONLY.
  // Do not mix the imported Thunderbird source into the same pairwise comparison;
  // imported rules intentionally mirror that source and would inflate conflicts/overlaps.
  const sourceRules=structuredClone(storedRules);
  const d=diagnoseOneSet(sourceRules,"Mail Organizer");
  lastMoDiag=d;
  renderDiagnostic(d,"mo");
  await messenger.storage.local.set({mo34LastDiagnostics:{
    at:new Date().toISOString(),result:d,analyzedRuleCount:sourceRules.length,scope:"mail-organizer-only"
  }});
  const enabledCount=storedRules.filter(r=>r.enabled!==false).length;
  const disabledCount=storedRules.length-enabledCount;
  if(sourceRules.length!==storedRules.length){
    setStatus("#startupError","warning",
      `INTERNAL COUNT MISMATCH: diagnostics analyzed ${sourceRules.length} rule(s), but storage.local contains ${storedRules.length}. No rules were changed.`);
  } else {
    setStatus("#startupError","success",
      `OK: Loaded ${storedRules.length} stored rule(s): ${enabledCount} enabled, ${disabledCount} disabled.`);
  }
  if($("#storageStatus")) $("#storageStatus").textContent=
    `Rule database: ${storedRules.length} stored locally · ${enabledCount} enabled · ${disabledCount} disabled`;
};


// ---------- remembered Thunderbird source + whole rules-section collapse ----------
function mo22ShowRememberedTbFile(info){
  showRememberedTb(info);
}

async function mo22LoadRememberedTbFile(){
  try{
    const s=await messenger.storage.local.get({
      lastTbAnalysis:null,
      lastTbFilterFileName:null,
      lastTbFilterCount:null,
      lastTbAnalyzedAt:null
    });
    let info=s.lastTbAnalysis;
    if(!info && s.lastTbFilterFileName){
      info={
        fileName:s.lastTbFilterFileName,
        filterCount:s.lastTbFilterCount,
        analyzedAt:s.lastTbAnalyzedAt
      };
    }
    showRememberedTb(info||null);
  }catch(e){
    console.warn("Could not load remembered Thunderbird filter analysis",e);
  }
}

function mo22SetRulesSectionCollapsed(collapsed){
  const rulesEl=document.getElementById("rules");
  if(!rulesEl) return;
  rulesEl.style.display=collapsed ? "none" : "";
  try{ localStorage.setItem("moRulesSectionCollapsed", collapsed ? "1" : "0"); }catch(e){}
}

function mo22RestoreRulesSectionState(){
  let collapsed=false;
  try{ collapsed=localStorage.getItem("moRulesSectionCollapsed")==="1"; }catch(e){}
  mo22SetRulesSectionCollapsed(collapsed);
}

// ---------- 0.1.21 exact duplicate prevention / cleanup ----------
function mo21CanonicalRule(r) {
  const conditions=(r.conditions||[]).map(c=>[
    String(c.field||"").trim().toLowerCase(),
    String(c.operator||"").trim().toLowerCase(),
    String(c.value||"").trim().toLowerCase()
  ].join("|")).sort();

  const actions=(r.actions||[]).map(a=>[
    String(a.type||"").trim().toLowerCase(),
    String(a.folderId||a.tbFolderUri||a.tagKey||"").trim().toLowerCase()
  ].join("|")).sort();

  return JSON.stringify({
    matchMode:String(r.matchMode||"all").toLowerCase(),
    matchAll:!!r.matchAll,
    conditions,
    actions
  });
}

function mo21FindExactDuplicateIndex(candidate, list=rules) {
  const sig=mo21CanonicalRule(candidate);
  return list.findIndex(r=>mo21CanonicalRule(r)===sig);
}

function mo21DedupeRules(inputRules) {
  const kept=[], removed=[];
  const seen=new Map();
  for(const r of inputRules||[]) {
    const sig=mo21CanonicalRule(r);
    if(!seen.has(sig)) {
      const copy=structuredClone(r);
      kept.push(copy);
      seen.set(sig, kept.length-1);
    } else {
      const keep=kept[seen.get(sig)];
      // Preserve an enabled copy if either duplicate was enabled.
      if(r.enabled===true) keep.enabled=true;
      removed.push(r);
    }
  }
  return {kept,removed};
}

async function mo21RemoveExactDuplicates() {
  const currentCards=document.querySelectorAll("#rules > .rule[data-ri]");
  if(currentCards.length) rules=readRulesFromUI();

  const result=mo21DedupeRules(rules);
  if(!result.removed.length) {
    setStatus("#notice","success","OK: No exact duplicate Mail Organizer rules were found.");
    return;
  }

  const names=result.removed.map(r=>r.name||"Unnamed rule");
  const ok=confirm(
    `Remove ${result.removed.length} exact duplicate rule(s)?\n\n`+
    `One copy of each rule will be kept. If either copy was enabled, the kept copy will remain enabled.\n\n`+
    names.slice(0,12).join("\n")+
    (names.length>12?`\n…and ${names.length-12} more`:"")
  );
  if(!ok) return;

  rules=result.kept;
  await messenger.storage.local.set({rules});
  renderRules();
  setTimeout(()=>{ mo20EnhanceRules(); mo16UpdateSummaries(); },0);

  lastMoDiag=diagnoseOneSet(rules,"Mail Organizer");
  const counts=renderStructuredDiagnostics(lastMoDiag,"#diagReport");
  updateDiagnosticBanner(counts.conflicts,counts.warnings);
  setStatus("#notice","success",
    `OK: Removed ${result.removed.length} exact duplicate rule(s). ${rules.length} unique rule(s) remain. Diagnostics rerun.`);
}



function splitDiagnosticFindings(text){
  const conflicts=[], warnings=[], other=[];
  let current=null, currentType=null;
  for(const raw of String(text||"").split(/\r?\n/)){
    const line=raw;
    if(/^CONFLICT:|^DUPLICATE:/i.test(line)){
      current=[]; currentType="conflict"; conflicts.push(current); current.push(line);
    }else if(/^OVERLAP:|^WARNING:/i.test(line)){
      current=[]; currentType="warning"; warnings.push(current); current.push(line);
    }else if(current){
      current.push(line);
    }else if(line.trim() && !/^Diagnostic findings:/i.test(line)){
      other.push(line);
    }
  }
  return {conflicts,warnings,other};
}

function renderStructuredDiagnostics(text, target="#diagReport", options={}){
  const reportEl=document.querySelector(target);
  if(!reportEl) return {conflicts:0,warnings:0};
  reportEl.innerHTML="";
  const parts=splitDiagnosticFindings(text);

  const add=(kind,title,blocks,open=true)=>{
    if(!blocks?.length) return;
    const d=document.createElement("details");
    d.className=`diag-${kind}`;
    d.open=open;
    const s=document.createElement("summary");
    s.textContent=title;
    d.appendChild(s);
    const p=document.createElement("pre");
    p.textContent=blocks.map(b=>Array.isArray(b)?b.join("\n"):b).join("\n");
    d.appendChild(p);
    reportEl.appendChild(d);
  };

  add("error",`🔴 ${parts.conflicts.length} conflict${parts.conflicts.length===1?"":"s"} — Show Details`,
      parts.conflicts,true);
  add("warning",`🟡 ${parts.warnings.length} warning/overlap${parts.warnings.length===1?"":"s"} — Show Details`,
      parts.warnings,true);

  if(parts.other.length){
    const d=document.createElement("div");
    d.className="diag-neutral";
    d.textContent=parts.other.join("\n");
    reportEl.appendChild(d);
  }
  if(!parts.conflicts.length && !parts.warnings.length && !parts.other.length){
    const d=document.createElement("div");
    d.className="diag-info";
    d.textContent="✓ No conflicts or warnings found.";
    reportEl.appendChild(d);
  }
  return {conflicts:parts.conflicts.length,warnings:parts.warnings.length};
}

function renderImportDiagnostics(alreadyExists, skipped, diagnosticText){
  const reportEl=document.querySelector("#diagReport");
  if(!reportEl) return;
  reportEl.innerHTML="";
  const addBox=(kind,title,lines,open=false)=>{
    const el=document.createElement(lines?.length ? "details" : "div");
    el.className=`diag-${kind}`;
    if(el.tagName==="DETAILS") el.open=open;
    if(lines?.length){
      const s=document.createElement("summary"); s.textContent=title; el.appendChild(s);
      const p=document.createElement("pre"); p.textContent=lines.join("\n"); el.appendChild(p);
    } else el.textContent=title;
    reportEl.appendChild(el);
  };
  if(alreadyExists?.length)
    addBox("info",`✓ ${alreadyExists.length} already-present rule(s) — no duplicates added — Show Details`,alreadyExists,false);
  if(skipped?.length)
    addBox("warning",`🟡 ${skipped.length} rule(s) could not be imported — Show Details`,skipped,true);

  const text=String(diagnosticText||"").trim();
  if(text){
    const parts=splitDiagnosticFindings(text);
    if(parts.conflicts.length)
      addBox("error",`🔴 ${parts.conflicts.length} conflict${parts.conflicts.length===1?"":"s"} — Show Details`,
             parts.conflicts.map(b=>b.join("\n")),true);
    if(parts.warnings.length)
      addBox("warning",`🟡 ${parts.warnings.length} warning/overlap${parts.warnings.length===1?"":"s"} — Show Details`,
             parts.warnings.map(b=>b.join("\n")),true);
    if(parts.other.length) addBox("neutral",parts.other.join("\n"),null,false);
  }
}

$("#importTb").onclick=async()=>{
  try {
    // Import must not depend on rule-editor controls being present.
    // Start from the persisted Mail Organizer rules instead.
    const stored=await messenger.storage.local.get({rules:[]});
    rules=Array.isArray(stored.rules) ? structuredClone(stored.rules) : [];
    await rememberTbAnalysis();
    const picks=[...document.querySelectorAll(".tbPick:checked")].map(x=>Number(x.value));
    let imported=0, skipped=[], alreadyExists=[];
    if(!picks.length){
      setStatus("#tbSummary","warning","WARNING: No Thunderbird filters are selected for import.");
      return;
    }
    for(const i of picks) {
      const f=parsedTbFilters[i];
      if(f.unsupported.length){ skipped.push(`${f.name}: unsupported ${f.unsupported.join("; ")}`); continue; }
      const resolved=resolveImportedActions(f);
      if(resolved.unresolved.length){ skipped.push(`${f.name}: cannot uniquely resolve ${resolved.unresolved.join("; ")}`); continue; }
      const candidate={
        id:crypto.randomUUID(), name:`TB: ${f.name}`, enabled:false,
        matchMode:f.matchMode, matchAll:!!f.matchAll, conditions:structuredClone(f.conditions),
        actions:resolved.out
      };
      const duplicateIndex=mo21FindExactDuplicateIndex(candidate,rules);
      if(duplicateIndex>=0){
        alreadyExists.push(`${f.name}: already exists as "${rules[duplicateIndex].name||"existing rule"}"`);
        continue;
      }
      rules.push(candidate);
      imported++;
    }
    // Persist and verify the import transaction.
    const selectedCount=picks.length;
    const convertedCount=imported;
    await messenger.storage.local.set({rules});
    const verify=await messenger.storage.local.get({rules:[]});
    const savedRules=Array.isArray(verify.rules)?verify.rules:[];
    const savedCount=savedRules.length;
    rules=savedRules;
    renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0);
    const enabledCount=rules.filter(r=>r.enabled!==false).length;
    const disabledCount=rules.length-enabledCount;
    const duplicateText=alreadyExists.length
      ? ` ${alreadyExists.length} already exist${alreadyExists.length===1?"s":""} — no duplicate${alreadyExists.length===1?"":"s"} added.`
      : "";
    const skippedText=skipped.length
      ? ` ${skipped.length} could not be imported; see diagnostics.`
      : "";
    setStatus("#tbSummary","success",
      `Import verified — Selected: ${selectedCount} → Added: ${convertedCount} → Saved/read back: ${savedCount}. `+
      `Mail Organizer has ${rules.length} rule(s): ${enabledCount} enabled, ${disabledCount} disabled.`+
      duplicateText+skippedText);
    lastMoDiag=diagnoseOneSet(rules,"Mail Organizer");
    renderImportDiagnostics(alreadyExists, skipped, lastMoDiag);
  } catch(e) {
    setStatus("#tbSummary","error","IMPORT ERROR: "+(e.message||e));
    setStatus("#diagReport","error","Import failed: "+(e.stack||e.message||e));
    updateDiagIndicator("CONFLICT: Import failed");
  }
};

async function loadFolders() {
  $("#simFolder").innerHTML="<option value=\"\">Loading folders…</option>";
  try {
    const result=await messenger.runtime.sendMessage({type:"getFolders"});
    folders=result?.folders||[];
    $("#folderDiag").textContent=(result?.diagnostics||[]).join("\n");
    $("#simFolder").innerHTML=folders.length?folderOptions():'<option value="">No folders returned — see diagnostics</option>';
    return true;
  } catch(e) {
    folders=[];
    $("#simFolder").innerHTML='<option value="">Folder load failed — see diagnostics</option>';
    $("#folderDiag").textContent="FOLDER LOAD ERROR: "+(e.stack||e.message||e);
    setStatus("#startupError","error","ERROR: Folder load failed: "+(e.message||e));
    return false;
  }
}
$("#reloadFolders").onclick=async()=>{await loadFolders();renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0);};
(async()=>{
  try {
    const state=await messenger.storage.local.get({rules:[],settings:{enabled:false,stopAfterFirstMatch:true},lastTbAnalysis:null,mo17SafetyReset:false});
    showRememberedTb(state.lastTbAnalysis);
    rules=state.rules||[];
    // 0.1.17 safety migration: force incoming processing OFF once after update.
    // After that, an explicit user choice is remembered normally.
    if(!state.mo17SafetyReset){
      state.settings={...(state.settings||{}),enabled:false,stopAfterFirstMatch:state.settings?.stopAfterFirstMatch!==false};
      await messenger.storage.local.set({settings:state.settings,mo17SafetyReset:true});
    }
    $("#enabled").checked=state.settings?.enabled===true;
    $("#stopFirst").checked=state.settings?.stopAfterFirstMatch!==false;
    mo17IncomingStatus();
    renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0); // Show stored rules even if another startup API fails.
    try { tags=await messenger.runtime.sendMessage({type:"getTags"}) || []; }
    catch(e) { tags=[]; setStatus("#startupError","warning","WARNING: Could not load Thunderbird tags: "+(e.message||e)); }
    await loadFolders();
    renderRules();
    setTimeout(()=>{ mo17EnhanceRules(); mo16UpdateSummaries(); },0);
    await loadLog();
    const enabledCount=rules.filter(r=>r.enabled!==false).length;
    const disabledCount=rules.length-enabledCount;
    if(!$("#startupError").textContent)
      setStatus("#startupError","success",`OK: Loaded ${rules.length} stored rule(s): ${enabledCount} enabled, ${disabledCount} disabled.`);
  } catch(e) {
    setStatus("#startupError","error","STARTUP ERROR: "+(e.stack||e.message||e));
  }
})();

updateDiagIndicator("No diagnostic run yet.","mo");

window.addEventListener("load",()=>{
  const el=$("#startupReady");
  if(el) setStatus(el,"success","OK: Mail Organizer controls initialized. Analyze/Import handlers are ready.");
});


// ---------- 0.1.16 collapsible UI / busy-state helpers ----------
function mo16WrapHeading(headingText, id, openDefault=true) {
  const headings=[...document.querySelectorAll("h2")];
  const hd=headings.find(x=>x.textContent.trim().startsWith(headingText));
  if(!hd || document.getElementById(id)) return null;
  let end=hd.nextElementSibling;
  const nodes=[];
  while(end && end.tagName!=="H2") {
    const next=end.nextElementSibling; nodes.push(end); end=next;
  }
  const d=document.createElement("details");
  d.id=id; d.className="majorCollapse"; d.open=openDefault;
  const s=document.createElement("summary");
  s.innerHTML=headingText+' <span class="sectionSummary"></span>';
  hd.parentNode.insertBefore(d,hd);
  d.appendChild(s); nodes.forEach(n=>d.appendChild(n)); hd.remove();
  return d;
}

function mo16EnhanceSections() {
  mo16WrapHeading("Thunderbird Filter Import & Diagnostics","mo16TbSection",false);
  const diag=mo16WrapHeading("Conflict / Duplicate","mo16DiagSection",false);
  mo16WrapHeading("Manual Filter Run","mo16ManualSection",true);
  mo16WrapHeading("Activity Log","mo16ActivitySection",false);

  // Manual checklist can collapse independently from the Manual Run section.
  const manualBox=null ? document.getElementById(null) : null;
  if(manualBox && !document.getElementById("mo16ManualFilters")) {
    const d=document.createElement("details"); d.id="mo16ManualFilters"; d.open=false;
    const s=document.createElement("summary"); s.textContent="Selected filters / rule checklist";
    manualBox.parentNode.insertBefore(d,manualBox); d.appendChild(s); d.appendChild(manualBox);
  }

  mo16EnhanceRuleCards();
  mo16UpdateSummaries();
}

function mo16EnhanceRuleCards() {
  document.querySelectorAll("#rules > .rule").forEach(card=>{
    if(card.dataset.mo16==="1") return;
    card.dataset.mo16="1";
    const first=card.firstElementChild;
    if(!first) return;
    const b=document.createElement("button"); b.type="button"; b.className="ruleCollapseBtn";
    b.textContent="Collapse";
    b.onclick=()=>{
      const collapsed=card.dataset.collapsed==="1";
      [...card.children].forEach((x,i)=>{ if(i>0) x.style.display=collapsed?"":"none"; });
      card.dataset.collapsed=collapsed?"0":"1"; b.textContent=collapsed?"Collapse":"Expand";
    };
    first.appendChild(b);
  });
}

function mo16UpdateSummaries() {
  const cards=[...document.querySelectorAll("#rules > .rule")];
  const enabled=cards.filter(c=>c.querySelector('input[type="checkbox"]')?.checked).length;
  const set=(id,text)=>{ const e=document.querySelector("#"+id+" .sectionSummary"); if(e)e.textContent=text; };
  set("mo16TbSection","import / analyze Thunderbird filters");
  set("mo16DiagSection","conflicts, duplicates, overlaps");
  set("mo16ManualSection",cards.length?`${cards.length} rules available`:"no rules");
  set("mo16ActivitySection","run history");
}

function mo16SetBusy(busy,mode="simulation") {
  const sim="simulate" ? document.getElementById("simulate") : null;
  const run="runSelected" ? document.getElementById("runSelected") : null;
  if(sim) {
    sim.disabled=!!busy;
    if(!sim.dataset.normalText) sim.dataset.normalText=sim.textContent;
    sim.textContent=busy ? (mode==="simulation"?"Simulating… please wait":"Working… please wait") : sim.dataset.normalText;
  }
  if(run) run.disabled=!!busy;
}

window.addEventListener("load",()=>setTimeout(mo16EnhanceSections,0));


// ---------- 0.1.20 compact rule collapsing + safe incoming processing ----------
function mo20RuleSummary(card){
  const name=card.querySelector(".rName")?.value || "Rule";
  const enabled=card.querySelector(".rEnabled")?.checked===true;
  const mode=card.querySelector(".rMode")?.value==="any" ? "ANY" : "ALL";
  const moveType=[...card.querySelectorAll(".aType")].find(x=>x.value==="move");
  let move="";
  if(moveType){
    const act=moveType.closest(".act");
    move=act?.querySelector(".aFolder option:checked")?.textContent || "";
  }
  return {text:`${name} — ${mode}${move ? " — Move → "+move : ""} — ${enabled?"ENABLED":"DISABLED"}`,enabled};
}

function mo20UpdateCompact(card){
  const info=mo20RuleSummary(card);
  const label=card.querySelector(".mo20Summary");
  const compactCheck=card.querySelector(".mo20Enabled");
  if(label){
    label.textContent=info.text;
    label.classList.toggle("mo20EnabledText",info.enabled);
    label.classList.toggle("mo20DisabledText",!info.enabled);
  }
  if(compactCheck) compactCheck.checked=info.enabled;
}

function mo20SetRuleCollapsed(card,collapsed){
  if(!card) return;
  const compact=card.querySelector(":scope > .mo20Compact");
  const editor=card.querySelector(":scope > .row");
  [...card.children].forEach(ch=>{
    if(ch===compact) ch.style.display=collapsed?"flex":"none";
    else ch.style.display=collapsed?"none":"";
  });
  if(editor && !collapsed) editor.style.display="";
  card.dataset.collapsed=collapsed?"1":"0";
  mo20UpdateCompact(card);
}

function mo20MakeCompact(card){
  if(card.querySelector(":scope > .mo20Compact")) return;
  const bar=document.createElement("div");
  bar.className="mo20Compact";

  const check=document.createElement("input");
  check.type="checkbox";
  check.className="mo20Enabled";
  check.title="Enable or disable this rule";
  check.addEventListener("change",()=>{
    const original=card.querySelector(".rEnabled");
    if(original){
      original.checked=check.checked;
      original.dispatchEvent(new Event("change",{bubbles:true}));
    }
    mo20UpdateCompact(card);
    mo20UpdateRuleCount();
  });

  const arrow=document.createElement("button");
  arrow.type="button";
  arrow.className="mo20Expand";
  arrow.textContent="▸";
  arrow.title="Expand rule";
  arrow.onclick=()=>mo20SetRuleCollapsed(card,false);

  const summary=document.createElement("span");
  summary.className="mo20Summary";
  summary.onclick=()=>mo20SetRuleCollapsed(card,false);
  summary.title="Click to expand";

  const proxy=(cls,text,title)=>{
    const b=document.createElement("button");
    b.type="button"; b.textContent=text; b.title=title;
    b.onclick=()=>card.querySelector(`:scope > .row .${cls}`)?.click();
    return b;
  };

  bar.append(check,arrow,summary,
    proxy("up","↑","Move rule up"),
    proxy("down","↓","Move rule down"),
    proxy("clone","Clone","Clone rule"),
    proxy("delete","Delete","Delete rule"));
  card.insertBefore(bar,card.firstChild);
}

function mo20EnhanceRules(){
  const cards=[...document.querySelectorAll("#rules > .rule[data-ri]")];
  cards.forEach(card=>{
    mo20MakeCompact(card);
    // Default to the compact view whenever rules are rendered.
    mo20SetRuleCollapsed(card,true);
  });
  mo20UpdateRuleCount();
}

function mo20UpdateRuleCount(){
  const cards=[...document.querySelectorAll("#rules > .rule[data-ri]")];
  const enabled=cards.filter(c=>c.querySelector(".rEnabled")?.checked===true).length;
  const el=document.getElementById("ruleCountSummary");
  if(el) el.textContent=`${cards.length} rules · ${enabled} enabled · ${cards.length-enabled} disabled`;
}

function mo17EnhanceRules(){ mo20EnhanceRules(); }
function mo17UpdateRuleCount(){ mo20UpdateRuleCount(); }
function mo17SetRuleCollapsed(card,collapsed){ mo20SetRuleCollapsed(card,collapsed); }

function mo17IncomingStatus(){
  const on=document.getElementById("enabled")?.checked;
  const el=document.getElementById("incomingStatus");
  if(!el) return;
  el.textContent=on ? "Incoming processing: ON — enabled rules will process new mail"
                    : "Incoming processing: OFF — safe/testing mode";
  el.style.color=on ? "#176b2c" : "#8a5a00";
}

window.addEventListener("load",()=>{
  const ca=document.getElementById("collapseAllRules");
  const ea=document.getElementById("expandAllRules");
  const dd=document.getElementById("removeExactDuplicates");
  if(ca) ca.onclick=()=>mo22SetRulesSectionCollapsed(true);
  if(ea) ea.onclick=()=>mo22SetRulesSectionCollapsed(false);
  if(dd) dd.onclick=mo21RemoveExactDuplicates;
  mo22RestoreRulesSectionState();
  mo22LoadRememberedTbFile();
  const en=document.getElementById("enabled");
  if(en) en.addEventListener("change",mo17IncomingStatus);
  setTimeout(()=>{mo20EnhanceRules();mo17IncomingStatus();},0);
});

document.addEventListener("change",async e=>{
  if(e.target?.id==="enabled" || e.target?.id==="stopFirst"){
    try{
      const cur=await messenger.storage.local.get({settings:{}});
      const settings={...(cur.settings||{}),
        enabled:document.getElementById("enabled")?.checked===true,
        stopAfterFirstMatch:document.getElementById("stopFirst")?.checked!==false};
      await messenger.storage.local.set({settings});
      mo17IncomingStatus();
    }catch(err){ console.error("Could not save processing settings",err); }
  }
  if(e.target?.classList?.contains("rEnabled")){
    const card=e.target.closest(".rule[data-ri]");
    if(card) mo20UpdateCompact(card);
    mo20UpdateRuleCount();
  }
});

// ---------- 0.1.18 Analyze/import null-safety ----------
function mo18Checked(root, selector, fallback=false) {
  try { const el=root?.querySelector?.(selector); return el ? el.checked===true : fallback; }
  catch (_) { return fallback; }
}

// 0.1.19 root-cause fix:
// Only elements directly inside #rules with data-ri are Mail Organizer editor cards.
// Other UI panels formerly shared the CSS class "rule", causing Analyze to scrape
// explanatory/manual-run panels as if they contained .rName/.rMode/.cField controls.

window.addEventListener("load",()=>setTimeout(mo29InitPicker,50));

window.addEventListener("load",()=>setTimeout(mo30RefreshStorageStatus,100));

async function mo34Restore(){
  try{
    const st=await messenger.storage.local.get(["mo34TbAnalysis","mo34LastDiagnostics","rules"]);
    const rr=Array.isArray(st.rules)?st.rules:[];
    if(st.mo34TbAnalysis){
      if(Array.isArray(st.mo34TbAnalysis.filters)) parsedTbFilters=st.mo34TbAnalysis.filters;
      showRememberedTb(st.mo34TbAnalysis);
    }
    if(st.mo34LastDiagnostics?.result){
      renderDiagnostic(st.mo34LastDiagnostics.result);
      const n=Number(st.mo34LastDiagnostics.analyzedRuleCount||0);
      if(n && n!==rr.length){
        const b=$("#diagBanner");
        if(b){b.className="statusBox statusWarning";b.textContent=`Mail Organizer: saved diagnostics are stale — analyzed ${n} rule(s), now ${rr.length}. Run diagnostics again.`;}
      }
    }
    const summary=$("#tbSummary");
    if(summary && !String(summary.textContent||"").trim()) summary.style.display="none";
  }catch(e){console.warn("Persistent-state restore failed",e);}
}
window.addEventListener("load",()=>setTimeout(mo34Restore,250));

// ---- 0.1.35 persistence safety / inspector ----
let mo35StoredRules = [];

async function mo35InspectStorage(){
  const box = document.querySelector("#mo35StorageText");
  const warn = document.querySelector("#mo35StorageWarning");
  const restore = document.querySelector("#mo35RestoreRules");
  try{
    const st = await messenger.storage.local.get(null);
    const stored = Array.isArray(st.rules) ? st.rules : [];
    mo35StoredRules = stored;

    // "rules" is the normal page working array in Mail Organizer.
    const uiCount = (typeof rules !== "undefined" && Array.isArray(rules)) ? rules.length : 0;
    const tbCount = Array.isArray(st.mo34TbAnalysis?.filters)
      ? st.mo34TbAnalysis.filters.length
      : Number(st.lastTbFilterCount || st.mo34TbAnalysis?.filterCount || 0);
    const diagCount = Number(st.mo34LastDiagnostics?.analyzedRuleCount || 0);
    const lastSave = st.mo30LastRulesSaved || st.mo34RulesAuthority?.at || "(none recorded)";

    if(box){
      box.innerHTML =
        `<b>Persistent storage rules:</b> ${stored.length}<br>` +
        `<b>Rules loaded into UI:</b> ${uiCount}<br>` +
        `<b>Cached Thunderbird source:</b> ${tbCount}<br>` +
        `<b>Cached diagnostics analyzed:</b> ${diagCount}<br>` +
        `<b>Last rule save:</b> ${lastSave}`;
    }

    if(restore) restore.disabled = !(stored.length > 0 && uiCount === 0);

    if(warn){
      if(stored.length > 0 && uiCount === 0){
        warn.style.color = "#8a5a00";
        warn.innerHTML = `<b>WARNING:</b> ${stored.length} stored rule(s) exist but the UI loaded 0. Save Rules is blocked until this is resolved.`;
      }else if(stored.length === 0 && uiCount > 0){
        warn.style.color = "#8a5a00";
        warn.innerHTML = `<b>WARNING:</b> ${uiCount} rule(s) exist in the running page but persistent storage currently contains 0. Do not close the page before recovery/save is verified.`;
      }else if(stored.length === uiCount && uiCount > 0){
        warn.style.color = "#176b27";
        warn.innerHTML = `<b>OK:</b> persistent storage and the UI agree on ${uiCount} rule(s).`;
      }else{
        warn.style.color = "#8a5a00";
        warn.innerHTML = `<b>SAFE MODE:</b> no automatic rule overwrite will be performed.`;
      }
    }

    // Protect Save Rules from an unexpected zero-rule overwrite.
    const save = document.querySelector("#saveRules");
    if(save){
      if(stored.length > 0 && uiCount === 0){
        save.disabled = true;
        save.title = "Blocked: persistent storage contains rules but the UI has loaded zero.";
      } else {
        save.disabled = false;
        save.title = "";
      }
    }
  }catch(e){
    if(box) box.textContent = "Storage inspection failed: " + e.message;
    if(warn){ warn.style.color="#a00"; warn.textContent="No storage changes were made."; }
  }
}

async function mo35RestoreStoredRules(){
  if(!Array.isArray(mo35StoredRules) || !mo35StoredRules.length) return;
  if(typeof rules === "undefined" || !Array.isArray(rules)){
    alert("The page rule array is unavailable. Nothing was changed.");
    return;
  }
  if(rules.length){
    alert("Restore stopped because the UI already contains rules. Nothing was changed.");
    return;
  }
  rules.splice(0, rules.length, ...JSON.parse(JSON.stringify(mo35StoredRules)));
  if(typeof renderRules === "function") renderRules();
  if(typeof renderManualRules === "function") renderManualRules();
  await mo35InspectStorage();
}

window.addEventListener("load", () => {
  setTimeout(() => {
    document.querySelector("#mo35RefreshStorage")?.addEventListener("click", mo35InspectStorage);
    document.querySelector("#mo35RestoreRules")?.addEventListener("click", mo35RestoreStoredRules);
    mo35InspectStorage();
  }, 500);
});

// ---- 0.1.37 stability / integrity layer ----
const MO137_ID = "mail-organizer@local";

async function mo137Snapshot(reason){
  try{
    const st=await messenger.storage.local.get(["rules","mo137RuleBackups"]);
    const rr=Array.isArray(st.rules)?st.rules:[];
    if(!rr.length) return;
    const backups=Array.isArray(st.mo137RuleBackups)?st.mo137RuleBackups:[];
    backups.unshift({at:new Date().toISOString(),reason:String(reason||"snapshot"),rules:JSON.parse(JSON.stringify(rr))});
    while(backups.length>5) backups.pop();
    await messenger.storage.local.set({mo137RuleBackups:backups,mo137LastKnownRuleCount:rr.length});
  }catch(e){ console.warn("0.1.37 snapshot failed",e); }
}

async function mo137IntegrityCheck(){
  try{
    const st=await messenger.storage.local.get(["rules","mo137RuleBackups","mo137LastKnownRuleCount"]);
    const stored=Array.isArray(st.rules)?st.rules:[];
    const backups=Array.isArray(st.mo137RuleBackups)?st.mo137RuleBackups:[];
    const ui=(typeof rules!=="undefined"&&Array.isArray(rules))?rules:[];
    const inspector=document.querySelector("#mo35StorageWarning");

    if(stored.length){
      await messenger.storage.local.set({mo137LastKnownRuleCount:stored.length});
      await mo137Snapshot("startup verified");
    }

    if(!stored.length && backups.length && Array.isArray(backups[0].rules) && backups[0].rules.length){
      if(inspector){
        inspector.style.color="#8a5a00";
        inspector.innerHTML=`<b>RECOVERY AVAILABLE:</b> current storage has 0 rules, but backup has ${backups[0].rules.length}. Use Restore Stored Rules to UI only after checking the Storage Inspector.`;
      }
    }

    // Never allow an empty UI to overwrite a non-empty persistent rule set.
    const save=document.querySelector("#saveRules");
    if(save && stored.length>0 && ui.length===0){
      save.disabled=true;
      save.title=`Blocked by 0.1.37 safety check: ${stored.length} persistent rules exist but UI has 0.`;
    }
  }catch(e){ console.warn("0.1.37 integrity check failed",e); }
}

window.addEventListener("load",()=>setTimeout(mo137IntegrityCheck,800));

document.addEventListener("click",e=>{
  const el=e.target;
  if(!(el instanceof HTMLElement)) return;
  if(el.id==="saveRules" || (el.textContent||"").trim()==="Save Rules"){
    mo137Snapshot("before Save Rules");
  }
},true);

// ---- 0.1.39: fixed Analyze regression + explicit backup/restore ----
let mo39RestorePayload=null;

function mo39Download(name,text){
  const blob=new Blob([text],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function mo39BackupRules(){
  const st=await messenger.storage.local.get(["rules"]);
  const rr=Array.isArray(st.rules)?st.rules:[];
  const payload={format:"Mail Organizer Rule Backup",version:"0.1.39",created:new Date().toISOString(),ruleCount:rr.length,rules:rr};
  mo39Download(`MailOrganizer-Rules-Backup-${new Date().toISOString().replace(/[:.]/g,"-")}.json`,JSON.stringify(payload,null,2));
}
async function mo39ReadRestore(file){
  mo39RestorePayload=null;
  const b=document.querySelector("#mo39RestoreRules"); if(b)b.disabled=true;
  if(!file)return;
  try{
    const x=JSON.parse(await file.text());
    if(!Array.isArray(x.rules)) throw new Error("No rules array found.");
    mo39RestorePayload=x;
    if(b){b.disabled=false;b.textContent=`Restore Backup (${x.rules.length})`;}
  }catch(e){alert("Cannot read backup file: "+e.message);}
}
async function mo39Restore(){
  if(!mo39RestorePayload?.rules)return;
  const incoming=mo39RestorePayload.rules;
  if(!confirm(`Restore ${incoming.length} Mail Organizer rule(s) from backup?`))return;
  await messenger.storage.local.set({rules:JSON.parse(JSON.stringify(incoming)),mo30LastRulesSaved:new Date().toISOString()});
  rules=JSON.parse(JSON.stringify(incoming));
  renderRules(); renderManualRules();
  await mo35InspectStorage();
}
window.addEventListener("load",()=>setTimeout(()=>{
  document.querySelector("#mo39BackupRules")?.addEventListener("click",mo39BackupRules);
  document.querySelector("#mo39RestoreFile")?.addEventListener("change",e=>mo39ReadRestore(e.target.files?.[0]));
  document.querySelector("#mo39RestoreRules")?.addEventListener("click",mo39Restore);
},600));

// Refresh storage display after import/analyze/save-related clicks.
document.addEventListener("click",e=>{
  const el=e.target;if(!(el instanceof HTMLElement))return;
  const txt=(el.textContent||"").toLowerCase();
  if(txt.includes("import selected")||txt.includes("save rules")){
    setTimeout(()=>{ if(typeof mo35InspectStorage==="function") mo35InspectStorage(); },900);
  }
});

// 0.1.41 safe duplicate-name cleanup
function mo41Html(x){return String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function mo41CondSig(r){try{return ruleSignature(r)||"";}catch{return "";}}
function mo41ActionSig(r){try{return actionSignature(r)||"";}catch{return "";}}
async function mo41Scan(){
 const st=await messenger.storage.local.get({rules:[]}),rr=Array.isArray(st.rules)?st.rules:[];
 const g=new Map();rr.forEach((r,i)=>{const k=String(r.name||"").trim().toLowerCase();if(!g.has(k))g.set(k,[]);g.get(k).push({r,i});});
 const dup=[...g.values()].filter(v=>v.length>1),sum=document.querySelector("#mo41CleanupSummary"),box=document.querySelector("#mo41CleanupResults");
 if(sum)sum.textContent=`${rr.length} stored rule(s) · ${dup.length} duplicate-name group(s)`;if(!box)return;
 if(!dup.length){box.innerHTML='<div style="color:green">✓ No duplicate rule names found.</div>';return;}
 box.innerHTML=dup.map(items=>`<details open style="border:1px solid #999;padding:6px;margin:6px 0"><summary><b>${mo41Html(items[0].r.name)}</b> — ${items.length} stored versions</summary>${items.map(({r,i})=>`<div style="border:1px solid #bbb;padding:7px;margin:6px 0"><b>#${i+1} ${mo41Html(r.name)}</b> — ${r.enabled===false?"DISABLED":"ENABLED"}<br><small><b>Conditions:</b> ${mo41Html(mo41CondSig(r)||"(none)")}</small><br><small><b>Actions:</b> ${mo41Html(mo41ActionSig(r)||"(none)")}</small><br><button type="button" class="mo41RemoveRule" data-index="${i}">Remove this stored rule…</button></div>`).join("")}</details>`).join("");
 box.querySelectorAll(".mo41RemoveRule").forEach(b=>b.addEventListener("click",()=>mo41Remove(Number(b.dataset.index))));
}
async function mo41Remove(index){
 const st=await messenger.storage.local.get({rules:[]}),rr=Array.isArray(st.rules)?structuredClone(st.rules):[],r=rr[index];if(!r)return;
 if(!confirm(`Remove ONLY this stored rule?\n\n${r.name}\n\nConditions: ${mo41CondSig(r)}\nActions: ${mo41ActionSig(r)}\n\nThunderbird's original filter file is not changed.`))return;
 await messenger.storage.local.set({mo41PreCleanupBackup:{at:new Date().toISOString(),rules:structuredClone(rr)}});
 rr.splice(index,1);await messenger.storage.local.set({rules:rr,mo30LastRulesSaved:new Date().toISOString()});
 const v=await messenger.storage.local.get({rules:[]});rules=Array.isArray(v.rules)?structuredClone(v.rules):[];
 renderRules();try{renderManualRules();}catch{}try{await mo35InspectStorage();}catch{}await mo41Scan();
 alert(`Removed "${r.name}". Stored rules now: ${rules.length}. A pre-cleanup snapshot was saved.`);
}
window.addEventListener("load",()=>setTimeout(()=>document.querySelector("#mo41ScanDuplicates")?.addEventListener("click",mo41Scan),700));

// ---------- 0.1.42 clean UI status strip; no engine/storage changes ----------
async function mo42RefreshDashboard(){
 try{
  const st=await messenger.storage.local.get({rules:[]});
  const rr=Array.isArray(st.rules)?st.rules:[];
  const en=rr.filter(r=>r.enabled!==false).length;
  const rc=document.querySelector("#mo42RuleCount"), ee=document.querySelector("#mo42Enabled");
  if(rc)rc.textContent=`Rules: ${rr.length}`; if(ee)ee.textContent=`Enabled: ${en}`;
  const banner=document.querySelector("#topDiagBanner");
  const issues=document.querySelector("#mo42Issues");
  if(issues){
    const t=banner?.textContent||"";
    const cm=t.match(/(\d+)\s+conflict/i), wm=t.match(/(\d+)\s+warning/i);
    issues.textContent=(cm||wm)?`Issues: ${cm?cm[1]:"0"} conflicts · ${wm?wm[1]:"0"} warnings`:"Issues: none";
  }
  const inc=document.querySelector("#mo42Incoming");
  if(inc){
    const incoming=await messenger.storage.local.get({incomingEnabled:false});
    inc.innerHTML=`<b>Incoming: ${incoming.incomingEnabled?"ON":"OFF"}</b>`;
  }
 }catch(e){console.warn("0.1.42 dashboard refresh",e);}
}
window.addEventListener("load",()=>setTimeout(mo42RefreshDashboard,800));
document.addEventListener("click",()=>setTimeout(mo42RefreshDashboard,700));

// After 0.1.41 cleanup deletion, refresh diagnostics automatically.
// The cleanup function saves and verifies first; this only updates the display.
const mo42OriginalRemove=typeof mo41Remove==="function"?mo41Remove:null;
if(mo42OriginalRemove){
 mo41Remove=async function(index){
   await mo42OriginalRemove(index);
   try{document.querySelector("#diagnoseRules")?.click();}catch{}
   setTimeout(mo42RefreshDashboard,400);
 };
}

// 0.1.43 presentation cleanup
function mo43IssueCounts(text){
 try{const p=splitDiagnosticFindings(String(text||""));return {conflicts:p.conflicts.length,warnings:p.warnings.length};}
 catch{return {conflicts:0,warnings:0};}
}
async function mo43RefreshPresentation(){
 try{
  const st=await messenger.storage.local.get({rules:[],mo34LastDiagnostics:null});
  const rr=Array.isArray(st.rules)?st.rules:[],en=rr.filter(r=>r.enabled!==false).length;
  let c=mo43IssueCounts(lastMoDiag);
  if(!c.conflicts&&!c.warnings&&st.mo34LastDiagnostics?.result)c=mo43IssueCounts(st.mo34LastDiagnostics.result);
  const rc=document.querySelector("#mo42RuleCount"),ee=document.querySelector("#mo42Enabled"),ii=document.querySelector("#mo42Issues");
  if(rc)rc.textContent=`Rules: ${rr.length}`;if(ee)ee.textContent=`Enabled: ${en}`;
  if(ii)ii.textContent=`Issues: ${c.conflicts} conflicts · ${c.warnings} warnings`;
  const last=document.querySelector("#lastTbFile");
  if(last&&!last.dataset.mo43){last.dataset.mo43="1";last.title="Cached analysis is retained. Browse again only to reread the current local msgFilterRules.dat.";}
 }catch(e){console.warn("0.1.43 refresh",e);}
}
window.addEventListener("load",()=>setTimeout(mo43RefreshPresentation,1000));
document.addEventListener("click",()=>setTimeout(mo43RefreshPresentation,800));

// ---------- 0.1.44 structural UI cleanup; engine/storage unchanged ----------
function mo44FindButton(text){
 return [...document.querySelectorAll("button")].find(b=>(b.textContent||"").trim().toLowerCase()===text.toLowerCase());
}
function mo44HideLegacyStatus(){
 [...document.querySelectorAll("body > div, body > p")].forEach(el=>{
   const t=(el.textContent||"").trim();
   if(/^0\.1\.37 Stability Mode\b/.test(t) ||
      /^OK:\s*Mail Organizer controls initialized\b/.test(t) ||
      /^Mail Organizer:\s*🔴/.test(t)) el.classList.add("mo44-hidden");
 });
}
function mo44ScrollTo(el){ if(el){el.scrollIntoView({behavior:"smooth",block:"start"});}}
function mo44Wire(){
 mo44HideLegacyStatus();
 const add=mo44FindButton("+ Add Rule"), save=mo44FindButton("Save Rules"),
       backup=document.querySelector("#mo39BackupRules"),
       diag=document.querySelector("#diagnoseRules");
 document.querySelector("#mo44Add")?.addEventListener("click",()=>add?.click());
 document.querySelector("#mo44Save")?.addEventListener("click",()=>save?.click());
 document.querySelector("#mo44Backup")?.addEventListener("click",()=>backup?.click());
 document.querySelector("#mo44Diag")?.addEventListener("click",()=>{
   const report=document.querySelector("#diagReport")||diag;
   mo44ScrollTo(report); if(diag)diag.click();
 });
 document.querySelector("#mo44Run")?.addEventListener("click",()=>{
   const el=document.querySelector("#manualRunSection")||document.querySelector("#manualRuleList");
   mo44ScrollTo(el);
 });
 document.querySelector("#mo44Advanced")?.addEventListener("click",()=>{
   const el=document.querySelector("#mo35StorageInspector")||document.querySelector("#tbFilterFile");
   mo44ScrollTo(el);
 });
 // The original title remains useful but no longer needs to dominate.
 const title=[...document.querySelectorAll("h1")].find(x=>/Mail Organizer 0\.1\.44/.test(x.textContent||""));
 if(title){title.style.fontSize="18px";title.style.margin="6px 0";}
 // Remembered TB source becomes a quiet single-line note.
 const last=document.querySelector("#lastTbFile");
 if(last){last.style.fontSize="13px";last.style.margin="4px 0";}
}
window.addEventListener("load",()=>setTimeout(mo44Wire,900));

// ---------- 0.1.45 one-toolbar normal view; engine/storage unchanged ----------
function mo45ButtonExact(txt){
 return [...document.querySelectorAll("button")].find(b=>(b.textContent||"").trim().toLowerCase()===txt.toLowerCase());
}
function mo45HideNormalClutter(){
 // Hide title/API description, old primary toolbar pieces, and duplicate incoming controls.
 const h1=[...document.querySelectorAll("h1")].find(x=>/Mail Organizer 0\.1\.45/.test(x.textContent||""));
 if(h1){
   h1.classList.add("mo45-normal-hidden");
   const n=h1.nextElementSibling;
   if(n && /supported MailExtension APIs/i.test(n.textContent||"")) n.classList.add("mo45-normal-hidden");
 }
 // Hide the old controls after the new toolbar has been wired to them.
 ["+ Add Rule","Save Rules","Export JSON"].forEach(t=>{
   const all=[...document.querySelectorAll("button")].filter(b=>(b.textContent||"").trim()===t);
   // Preserve the new + Add Rule button by ID.
   all.forEach(b=>{if(!b.id?.startsWith("mo44")) b.classList.add("mo45-normal-hidden");});
 });
 // Hide old JSON import label/input group visually (still callable from Import button).
 const importBrowse=[...document.querySelectorAll("input[type=file]")].find(i=>i.id && !/tbFilterFile|mo39RestoreFile/i.test(i.id));
 if(importBrowse){
   importBrowse.classList.add("mo45-normal-hidden");
   // Hide nearby label text nodes by hiding parent only if it is a dedicated label.
   if(importBrowse.parentElement?.tagName==="LABEL") importBrowse.parentElement.classList.add("mo45-normal-hidden");
 }
 // Hide duplicate incoming UI while keeping controls alive.
 const incomingCb=[...document.querySelectorAll('input[type="checkbox"]')].find(x=>{
   const p=x.parentElement?.textContent||""; return /Process incoming mail/i.test(p);
 });
 if(incomingCb){
   if(incomingCb.parentElement) incomingCb.parentElement.classList.add("mo45-normal-hidden");
   let el=incomingCb.parentElement?.nextElementSibling;
   if(el && /Incoming processing:/i.test(el.textContent||"")) el.classList.add("mo45-normal-hidden");
 }
 const stopCb=[...document.querySelectorAll('input[type="checkbox"]')].find(x=>/Stop after first matching rule/i.test(x.parentElement?.textContent||""));
 if(stopCb?.parentElement) stopCb.parentElement.classList.add("mo45-normal-hidden");
 // Last analyzed source is advanced information, not normal-view status.
 document.querySelector("#lastTbFile")?.classList.add("mo45-normal-hidden");
}
function mo45AddImportButton(){
 const bar=document.querySelector("#mo44Actions"); if(!bar||document.querySelector("#mo45Import"))return;
 const b=document.createElement("button"); b.id="mo45Import"; b.textContent="Import";
 const run=document.querySelector("#mo44Run"); bar.insertBefore(b,run||null);
 b.addEventListener("click",()=>{
   const tb=document.querySelector("#tbFilterFile");
   if(tb){tb.scrollIntoView({behavior:"smooth",block:"center"});tb.click();}
 });
}
function mo45Wire(){
 mo45AddImportButton();
 setTimeout(mo45HideNormalClutter,50);
}
window.addEventListener("load",()=>setTimeout(mo45Wire,1050));

// ---------- 0.1.46 run-state integrity + test UI fixes ----------
function mo46FolderName(id){
  const f=(folders||[]).find(x=>String(x.id)===String(id));
  return f?.name || String(id||"(no destination)");
}
async function mo46SyncEditorRulesForRun(reason){
  const current=readRulesFromUI();
  if(!Array.isArray(current) || !current.length) throw new Error("No rules are available in the editor.");
  // Keep the page model, manual picker, and background worker on ONE exact rule snapshot.
  rules=structuredClone(current);
  await messenger.storage.local.set({
    rules:structuredClone(current),
    mo30LastRulesSaved:new Date().toISOString(),
    mo34RulesAuthority:{at:new Date().toISOString(),source:`0.1.46 editor sync before ${reason}`}
  });
  const verify=await messenger.storage.local.get({rules:[]});
  const vr=Array.isArray(verify.rules)?verify.rules:[];
  if(vr.length!==current.length) throw new Error(`Rule sync verification failed (${current.length} editor / ${vr.length} stored).`);
  renderManualRules();
  if(typeof mo29ApplyPicker==="function") mo29ApplyPicker();
  if(typeof mo35InspectStorage==="function") setTimeout(mo35InspectStorage,0);
}
function mo46EnhanceSimulationPanel(){
  const el=document.querySelector("#simResult"); if(!el)return;
  if(!el.querySelector(".mo46CloseResult") && el.innerHTML.trim() && !/No simulation run yet/i.test(el.textContent||"")){
    const b=document.createElement("button"); b.type="button"; b.className="mo46CloseResult";
    b.textContent="×"; b.title="Close results";
    b.style.cssText="float:right;font-size:18px;line-height:1;padding:2px 7px;margin:-2px -2px 4px 8px";
    b.onclick=()=>{el.style.display="none";};
    el.prepend(b);
  }
  el.style.minHeight="0"; el.style.height="auto";
}
const mo46OldRenderRunSummary=renderRunSummary;
renderRunSummary=function(...args){
  const el=document.querySelector("#simResult"); if(el)el.style.display="";
  const r=mo46OldRenderRunSummary(...args); mo46EnhanceSimulationPanel(); return r;
};
function mo46FixActivityCollapse(){
  const d=document.querySelector("#mo16ActivitySection"); if(!d)return;
  // mo16 wrapped only the heading; pull the activity toolbar/table into the same details element.
  let n=d.nextElementSibling;
  while(n && !(n.matches?.("hr") || n.id==="mo16TbSection")){
    const next=n.nextElementSibling;
    if(n.matches?.(".toolbar,table")) d.appendChild(n);
    n=next;
  }
}
window.addEventListener("load",()=>setTimeout(()=>{mo46FixActivityCollapse();mo46EnhanceSimulationPanel();},1300));

// ---------- 0.1.47 operational integrity ----------
let mo47AutoSaveTimer=null;
let mo47Saving=false;

function mo47SetSavedState(text, good=true){
  let el=document.getElementById("mo47SaveState");
  if(!el){
    el=document.createElement("span");
    el.id="mo47SaveState";
    el.style.cssText="margin-left:10px;font-weight:600";
    const save=document.querySelector("#saveRules");
    if(save?.parentElement) save.insertAdjacentElement("afterend",el);
  }
  el.textContent=text||"";
  el.style.color=good?"#176b2c":"#9a6700";
}

async function mo47PersistCurrentEditor(reason="edit"){
  if(mo47Saving)return;
  mo47Saving=true;
  try{
    const current=readRulesFromUI();
    if(!Array.isArray(current)||!current.length)return;
    rules=structuredClone(current);
    const stamp=new Date().toISOString();
    await messenger.storage.local.set({
      rules:structuredClone(current),
      mo30LastRulesSaved:stamp,
      mo34RulesAuthority:{at:stamp,source:`0.1.47 autosave: ${reason}`}
    });
    const verify=await messenger.storage.local.get({rules:[]});
    if(!Array.isArray(verify.rules)||verify.rules.length!==current.length)
      throw new Error("Autosave verification failed.");
    mo47SetSavedState("Saved ✓",true);
  }catch(e){
    console.error("0.1.47 autosave",e);
    mo47SetSavedState("Not saved ⚠",false);
  }finally{mo47Saving=false;}
}

function mo47ScheduleAutoSave(reason="edit"){
  mo47SetSavedState("Saving…",false);
  clearTimeout(mo47AutoSaveTimer);
  mo47AutoSaveTimer=setTimeout(()=>mo47PersistCurrentEditor(reason),350);
}

// Autosave actual rule-editor edits, including destination, condition, action and enabled checkbox.
document.addEventListener("change",e=>{
  if(e.target.closest?.("#rules")) mo47ScheduleAutoSave("rule change");
},true);
document.addEventListener("input",e=>{
  if(e.target.closest?.("#rules") && (e.target.matches("input[type=text],textarea"))) mo47ScheduleAutoSave("rule text edit");
},true);

async function mo47SyncEditorRulesForRun(reason, selectedIds){
  const wanted=[...(selectedIds||[])].map(String);
  const current=readRulesFromUI();
  if(!Array.isArray(current)||!current.length) throw new Error("No rules are available in the editor.");
  // Persist the exact editor state WITHOUT rebuilding the manual selector.
  rules=structuredClone(current);
  const stamp=new Date().toISOString();
  await messenger.storage.local.set({
    rules:structuredClone(current),
    mo30LastRulesSaved:stamp,
    mo34RulesAuthority:{at:stamp,source:`0.1.47 exact editor snapshot before ${reason}`}
  });
  const verify=await messenger.storage.local.get({rules:[]});
  const vr=Array.isArray(verify.rules)?verify.rules:[];
  if(vr.length!==current.length) throw new Error(`Rule sync verification failed (${current.length} editor / ${vr.length} stored).`);
  // Verify each selected rule still exists and its action snapshot is identical.
  for(const id of wanted){
    const a=current.find(r=>String(r.id)===id), b=vr.find(r=>String(r.id)===id);
    if(!a||!b) throw new Error(`RUN ABORTED — selected rule ${id} disappeared during save.`);
    if(JSON.stringify(a.actions||[])!==JSON.stringify(b.actions||[]))
      throw new Error(`RUN ABORTED — destination/action changed while preparing ${a.name}.`);
  }
  mo47SetSavedState("Saved ✓",true);
}

// Prevent .46 helper from being accidentally used elsewhere to rebuild selection during a run.
mo46SyncEditorRulesForRun=async function(reason){ 
  return mo47SyncEditorRulesForRun(reason, selectedManualRuleIds());
};

window.addEventListener("load",()=>setTimeout(()=>mo47SetSavedState("Saved ✓",true),900));

// ---------- 0.1.48 clean on-demand workspace ----------
let mo148Selected=null, mo148Mode="manager";
function mo148Btn(txt){return [...document.querySelectorAll("button")].find(b=>(b.textContent||"").trim().toLowerCase()===txt.toLowerCase())}
function mo148Sections(){
 return [...document.querySelectorAll("section,details")];
}
function mo148HideClutter(){
 const rr=document.querySelector("#rules"); if(rr)rr.classList.add("mo148-hidden");
 mo148Sections().forEach(x=>{
   const t=(x.querySelector("h1,h2,h3,summary")?.textContent||"").toLowerCase();
   if(/storage inspector|thunderbird filter import|manual filter run|conflict \/ duplicate report|duplicate-name/.test(t))x.classList.add("mo148-hidden");
 });
 ["#mo35StorageInspector","#mo16StorageInspector","#storageInspector","#tbImportSection","#mo16TbSection","#manualRunSection","#mo16ManualSection","#diagnosticsSection","#mo16DiagnosticsSection","#duplicateCleanup"].forEach(q=>document.querySelector(q)?.classList.add("mo148-hidden"));
}
function mo148Current(){try{return readRulesFromUI()}catch{return Array.isArray(rules)?rules:[]}}
function mo148Render(){
 const list=document.querySelector("#mo148List"); if(!list)return;
 const q=(document.querySelector("#mo148Search")?.value||"").trim().toLowerCase(), all=mo148Current();
 const show=all.filter(r=>!q||String(r.name||"").toLowerCase().includes(q)); list.innerHTML="";
 show.forEach(r=>{
   const row=document.createElement("div"); row.className="mo148row"+(String(r.id)===String(mo148Selected)?" sel":"");
   const radio=document.createElement("input");radio.type="radio";radio.name="mo148pick";radio.checked=String(r.id)===String(mo148Selected);
   const name=document.createElement("div");name.className="mo148name";name.textContent=r.name||"(unnamed)";
   const st=document.createElement("div");st.className="mo148state";st.textContent=r.enabled?"ENABLED":"disabled";
   row.append(radio,name,st);row.onclick=()=>{mo148Selected=String(r.id);mo148Render()};row.ondblclick=()=>mo148OpenEditor(false);list.append(row);
 });
 document.querySelector("#mo148Count").textContent=`${show.length} shown · ${all.length} total`;
}
function mo148Show(title){mo148Mode="tool";document.querySelector("#mo148Manager")?.classList.add("mo148-hidden");document.querySelector("#mo148ToolBar")?.classList.remove("mo148-hidden");document.querySelector("#mo148ToolTitle").textContent=title}
function mo148Reveal(rx){mo148Sections().forEach(x=>{const t=x.querySelector("h1,h2,h3,summary")?.textContent||"";if(rx.test(t))x.classList.remove("mo148-hidden")})}
function mo148Home(){mo148Mode="manager";document.querySelector("#mo148ToolBar")?.classList.add("mo148-hidden");document.querySelector("#mo148Manager")?.classList.remove("mo148-hidden");mo148HideClutter();mo148Render()}
function mo148OpenEditor(add){
 mo148Show(add?"Add Rule":"Edit Rule");const root=document.querySelector("#rules");root?.classList.remove("mo148-hidden");
 if(add){document.querySelector("#addRule")?.click();return}
 const all=mo148Current(), idx=all.findIndex(r=>String(r.id)===String(mo148Selected));
 [...(root?.children||[])].forEach((c,i)=>{if(c.querySelector?.("input,select,button"))c.style.display=(i===idx?"":"none")});
}
function mo148Wire(){
 document.querySelector("#mo148Search")?.addEventListener("input",mo148Render);
 document.querySelector("#mo148Edit")?.addEventListener("click",()=>{if(mo148Selected)mo148OpenEditor(false)});
 document.querySelector("#mo148Close")?.addEventListener("click",mo148Home);
 const add=mo148Btn("+ Add Rule")||document.querySelector("#addRule");
 add?.addEventListener("click",e=>{if(mo148Mode==="manager"){e.preventDefault();e.stopImmediatePropagation();mo148OpenEditor(true)}},true);
 mo148Btn("Run Filters")?.addEventListener("click",()=>{mo148Show("Run Filters");mo148Reveal(/manual filter run/i);document.querySelector("#manualRunSection,#mo16ManualSection")?.classList.remove("mo148-hidden")});
 mo148Btn("Diagnostics")?.addEventListener("click",()=>{mo148Show("Diagnostics");mo148Reveal(/diagnostic|conflict|duplicate/i)});
 mo148Btn("Advanced")?.addEventListener("click",()=>{mo148Show("Advanced");mo148Reveal(/storage inspector|thunderbird filter import|duplicate-name/i)});
 mo148Btn("Import")?.addEventListener("click",()=>{mo148Show("Import");mo148Reveal(/thunderbird filter import/i)});
}
window.addEventListener("load",()=>setTimeout(()=>{mo148HideClutter();mo148Render();mo148Wire()},1600));

// ---------- 0.1.49 controlled live incoming ----------
function mo149EnabledRules(){try{return mo148Current().filter(r=>r.enabled!==false)}catch(e){return []}}
function mo149Sync(){
 const inc=document.getElementById('enabled'), sf=document.getElementById('stopFirst'), on=inc?.checked===true, n=mo149EnabledRules().length;
 const st=document.getElementById('mo149LiveState'); if(st){st.textContent=on?'ON — LIVE MAIL':'OFF — safe/testing mode';st.className=on?'mo149-on':'mo149-off'}
 const ec=document.getElementById('mo149Enabled');if(ec)ec.textContent=`${n} rule${n===1?'':'s'} enabled`;
 const cb=document.getElementById('mo149StopFirst');if(cb&&sf)cb.checked=sf.checked!==false;
}
async function mo149SetIncoming(on){
 const inc=document.getElementById('enabled'); if(!inc){alert('Incoming control not found. Nothing changed.');return}
 const rr=mo149EnabledRules();
 if(on&&!rr.length){alert('No rules are enabled. Enable one or two low-risk rules first.');return}
 if(on&&rr.some(r=>(r.actions||[]).some(a=>String(a.type||'').toLowerCase()==='delete'))){alert('Incoming was NOT started: an enabled rule contains DELETE. Disable delete rules during the first live test.');return}
 const sf=document.getElementById('stopFirst'); if(on&&sf&&!sf.checked){sf.checked=true;sf.dispatchEvent(new Event('change',{bubbles:true}))}
 if(inc.checked!==on){inc.checked=on;inc.dispatchEvent(new Event('change',{bubbles:true}))}
 mo149Sync();
}
function mo149Init(){
 document.body.classList.add('mo149-manager');
 document.getElementById('mo149Start')?.addEventListener('click',()=>mo149SetIncoming(true));
 document.getElementById('mo149Stop')?.addEventListener('click',()=>mo149SetIncoming(false));
 document.getElementById('mo149StopFirst')?.addEventListener('change',e=>{const sf=document.getElementById('stopFirst');if(sf){sf.checked=e.target.checked;sf.dispatchEvent(new Event('change',{bubbles:true}))}});
 document.addEventListener('change',()=>setTimeout(mo149Sync,50)); mo149Sync();
}
window.addEventListener('load',()=>setTimeout(mo149Init,1900));

// ---------- 0.1.50 compact/resizable manager + compact editor/manual run ----------
const MO150_SIZE_KEY="mo150WorkspaceSize";
async function mo150RestoreSize(){
 try{
  const st=await messenger.storage.local.get({[MO150_SIZE_KEY]:null}), v=st[MO150_SIZE_KEY], el=document.querySelector("#mo150Workspace");
  if(el&&v){if(v.width)el.style.width=v.width+"px";if(v.height)el.style.height=v.height+"px";}
 }catch(e){console.warn("0.1.50 restore size",e)}
}
let mo150SizeTimer=null;
function mo150WatchSize(){
 const el=document.querySelector("#mo150Workspace"); if(!el||!window.ResizeObserver)return;
 new ResizeObserver(entries=>{
  const r=entries[0]?.contentRect;if(!r)return;clearTimeout(mo150SizeTimer);
  mo150SizeTimer=setTimeout(()=>messenger.storage.local.set({[MO150_SIZE_KEY]:{width:Math.round(r.width),height:Math.round(r.height)}}),350);
 }).observe(el);
}
function mo150SelectedId(){return String(mo148Selected||"")}
function mo150FindRule(id){return mo148Current().find(r=>String(r.id)===String(id))}
function mo150SelectOnlyManualRule(id){
 const root=document.querySelector("#manualRules")||document.querySelector("#manualRuleList");
 if(!root)return;
 const boxes=[...root.querySelectorAll('input[type="checkbox"]')];
 boxes.forEach(cb=>{
   const row=cb.closest("label,tr,div");
   const txt=(row?.textContent||"");
   const rid=cb.value||cb.dataset.ruleId||cb.getAttribute("data-id")||"";
   cb.checked=String(rid)===String(id) || (!!mo150FindRule(id)?.name && txt.includes(mo150FindRule(id).name));
   cb.dispatchEvent(new Event("change",{bubbles:true}));
 });
}
function mo150CompactEditor(){
 const root=document.querySelector("#rules");if(!root)return;
 root.classList.add("mo150Editor");root.style.width="100%";
}
function mo150CompactManual(){
 const el=document.querySelector("#manualRunSection")||document.querySelector("#mo16ManualSection")||
   [...document.querySelectorAll("section,details")].find(x=>/manual filter run/i.test(x.querySelector("h1,h2,h3,summary")?.textContent||""));
 if(el){el.classList.remove("mo148-hidden");el.classList.add("mo150CompactTool");}
 return el;
}
function mo150RunSelectedRule(){
 const id=mo150SelectedId();if(!id){alert("Select a filter first.");return}
 document.body.classList.remove("mo149-manager");
 mo148Show("Run Filter");
 mo148Reveal(/manual filter run/i);
 const el=mo150CompactManual();
 setTimeout(()=>{mo150SelectOnlyManualRule(id);el?.scrollIntoView({block:"nearest"});},100);
}
function mo150EditSelected(){
 if(!mo150SelectedId()){alert("Select a filter first.");return}
 document.body.classList.remove("mo149-manager");
 mo148OpenEditor(false);setTimeout(mo150CompactEditor,50);
}
async function mo150ToggleSelected(){
 const id=mo150SelectedId();if(!id){alert("Select a filter first.");return}
 const all=mo148Current(), r=all.find(x=>String(x.id)===id);if(!r)return;
 r.enabled=!r.enabled; rules=structuredClone(all);
 await messenger.storage.local.set({rules:structuredClone(all),mo30LastRulesSaved:new Date().toISOString()});
 // Update the underlying editor checkbox without rebuilding the manual picker.
 try{
   const cards=[...document.querySelector("#rules").children].filter(x=>x.querySelector?.("input,select,button"));
   const idx=all.findIndex(x=>String(x.id)===id);
   const cb=cards[idx]?.querySelector('input[type="checkbox"]'); if(cb)cb.checked=r.enabled;
 }catch{}
 mo148Render();mo149Sync?.();
}
function mo150Init(){
 mo150RestoreSize();mo150WatchSize();
 document.querySelector("#mo150Edit")?.addEventListener("click",mo150EditSelected);
 document.querySelector("#mo150Run")?.addEventListener("click",mo150RunSelectedRule);
 document.querySelector("#mo150ToggleEnabled")?.addEventListener("click",mo150ToggleSelected);
 // Existing Edit button uses same compact editor.
 document.querySelector("#mo148Edit")?.addEventListener("click",()=>setTimeout(mo150CompactEditor,50));
 // Top Run Filters opens compact manual area.
 mo148Btn("Run Filters")?.addEventListener("click",()=>setTimeout(mo150CompactManual,80));
 // Returning home removes editor/tool sizing classes but keeps remembered workspace size.
 document.querySelector("#mo148Close")?.addEventListener("click",()=>{
   document.querySelector("#rules")?.classList.remove("mo150Editor");
   document.querySelectorAll(".mo150CompactTool").forEach(x=>x.classList.remove("mo150CompactTool"));
 },true);
}
window.addEventListener("load",()=>setTimeout(mo150Init,2000));

// ---------- 0.1.51 sticky title/version/status/toolbar ----------
function mo151FindToolbar(){
  const add=mo148Btn?.("+ Add Rule") || mo148Btn?.("Add Rule");
  if(!add) return null;
  return add.closest("nav,.toolbar,.topbar,.controls,div,section");
}
function mo151InitSticky(){
  const workspace=document.querySelector("#mo150Workspace");
  if(!workspace || document.querySelector("#mo151StickyHeader")) return;

  // Locate title by visible Mail Organizer text.
  const title=[...workspace.querySelectorAll("h1,h2,h3,strong")]
    .find(x=>/Mail Organizer/i.test(x.textContent||""));
  const toolbar=mo151FindToolbar();

  // Status line is usually near title/toolbar and contains Rules/Enabled/Incoming.
  const status=[...workspace.querySelectorAll("div,p,span")]
    .find(x=>{
      const t=x.textContent||"";
      return /Rules\s*:/i.test(t) && /Enabled\s*:/i.test(t) && /Incoming\s*:/i.test(t)
             && x.children.length < 8;
    });

  if(!title && !toolbar) return;

  const sticky=document.createElement("div");
  sticky.id="mo151StickyHeader";

  const first=[title,status,toolbar].filter(Boolean)
    .sort((a,b)=>(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_PRECEDING)?1:-1)[0];
  first?.parentNode?.insertBefore(sticky,first);

  // Move, don't clone: preserves existing button handlers and live status updates.
  if(title) sticky.appendChild(title);
  if(status && !sticky.contains(status)) sticky.appendChild(status);
  if(toolbar && !sticky.contains(toolbar)) sticky.appendChild(toolbar);

  // Ensure the visible title reports the actual build.
  if(title) title.textContent=(title.textContent||"Mail Organizer").replace(/0\.1\.\d+/,"0.1.51");
}
window.addEventListener("load",()=>setTimeout(mo151InitSticky,2200));

// ---------- 0.1.52 proper header outside resizable workspace ----------
function mo152Button(text){
 try{return mo148Btn(text)}catch(e){return null}
}
function mo152BuildHeader(){
 if(document.querySelector("#mo152Header"))return;
 const workspace=document.querySelector("#mo150Workspace"); if(!workspace)return;
 const header=document.createElement("header"); header.id="mo152Header";
 header.innerHTML=`
   <div id="mo152Brand"><span id="mo152BrandName">Mail Organizer</span><span id="mo152Version">v0.1.52</span></div>
   <div id="mo152Status">
     <span class="mo152pill" id="mo152Rules">Rules: —</span>
     <span class="mo152pill" id="mo152Enabled">Enabled: —</span>
     <span class="mo152pill" id="mo152Issues">Issues: —</span>
     <span class="mo152pill mo152off" id="mo152Incoming">Incoming: OFF</span>
   </div>
   <div id="mo152Toolbar"></div>`;
 workspace.parentNode.insertBefore(header,workspace);

 // Move primary toolbar buttons into the real header; handlers remain attached.
 const tb=header.querySelector("#mo152Toolbar");
 ["+ Add Rule","Save","Backup","Import","Run Filters","Diagnostics","Advanced"].forEach(label=>{
   const b=mo152Button(label)||mo152Button(label.replace("+ ",""));
   if(b && !tb.contains(b))tb.appendChild(b);
 });
 mo152RefreshHeader();
}
function mo152RefreshHeader(){
 const rs=mo148Current?.()||[], enabled=rs.filter(r=>r.enabled).length;
 const r=document.querySelector("#mo152Rules"), e=document.querySelector("#mo152Enabled");
 if(r)r.textContent=`Rules: ${rs.length}`; if(e)e.textContent=`Enabled: ${enabled}`;

 // Reuse the application's authoritative issue/status text when available.
 const txt=[...document.querySelectorAll("div,p,span,strong")]
   .map(x=>x.textContent||"").find(t=>/Issues\s*:/i.test(t)&&/conflict|warning/i.test(t));
 const issue=(txt?.match(/Issues\s*:\s*([^I\n]+)/i)?.[1]||"").trim();
 const i=document.querySelector("#mo152Issues"); if(i)i.textContent=`Issues: ${issue||"—"}`;

 const inc=mo149NativeIncoming?.(), on=!!inc?.checked, x=document.querySelector("#mo152Incoming");
 if(x){x.textContent=`Incoming: ${on?"ON — LIVE":"OFF"}`;x.className=`mo152pill ${on?"mo152on":"mo152off"}`;}
}
function mo152Init(){
 mo152BuildHeader();
 document.addEventListener("change",()=>setTimeout(mo152RefreshHeader,80));
 document.addEventListener("click",()=>setTimeout(mo152RefreshHeader,120));
 // Ensure obsolete title inside workspace does not consume space.
 [...document.querySelectorAll("#mo150Workspace h1,#mo150Workspace h2")]
   .filter(x=>/Mail Organizer 0\.1\.52/i.test(x.textContent||"")).forEach(x=>x.style.display="none");
}
window.addEventListener("load",()=>setTimeout(mo152Init,2400));

// ---------- 0.1.53 single Home / Filter Manager navigation ----------
let mo153Mode="home";
function mo153Workspace(){return document.querySelector("#mo150Workspace")}
function mo153Manager(){return document.querySelector("#mo148Manager")}
function mo153HideLegacyToolAreas(){
 const ws=mo153Workspace(); if(!ws)return;
 [...ws.querySelectorAll("section,details")].forEach(el=>{
   if(el===mo153Manager() || el.contains(mo153Manager()))return;
   const head=el.querySelector("h1,h2,h3,summary")?.textContent||"";
   if(/manual filter run|storage inspector|thunderbird filter import|conflict|duplicate/i.test(head))
      el.classList.add("mo153-hidden");
 });
 const rules=document.querySelector("#rules"); if(rules)rules.classList.add("mo153-hidden");
}
function mo153Home(){
 mo153Mode="home"; document.body.classList.add("mo149-manager");
 mo153HideLegacyToolAreas();
 const mgr=mo153Manager(); if(mgr)mgr.classList.remove("mo153-hidden");
 document.querySelector("#mo153ToolTitle")?.remove();
 document.querySelector("#mo148Close")?.style.setProperty("display","none");
 mo148Render?.(); mo152RefreshHeader?.();
}
function mo153ShowOnlyTool(regex,title){
 mo153Mode=title.toLowerCase();
 const ws=mo153Workspace(); if(!ws)return null;
 mo153HideLegacyToolAreas();
 mo153Manager()?.classList.add("mo153-hidden");
 let target=[...ws.querySelectorAll("section,details")].find(el=>regex.test(el.querySelector("h1,h2,h3,summary")?.textContent||""));
 if(target){
   target.classList.remove("mo153-hidden");
   target.classList.add("mo150CompactTool");
   const lab=document.createElement("div");lab.id="mo153ToolTitle";lab.textContent=title;
   target.parentNode.insertBefore(lab,target);
 }
 const close=document.querySelector("#mo148Close");
 if(close){close.style.display="inline-block";close.textContent="← Home / Filters";}
 return target;
}
function mo153Run(single){
 const id=mo150SelectedId?.();
 if(single && !id){alert("Select a filter first.");return}
 const target=mo153ShowOnlyTool(/manual filter run/i,"Run Filters");
 if(!target){alert("Run Filters area was not found.");mo153Home();return}
 if(single)setTimeout(()=>mo150SelectOnlyManualRule(id),100);
}
function mo153Edit(){
 const id=mo150SelectedId?.(); if(!id){alert("Select a filter first.");return}
 mo153HideLegacyToolAreas(); mo153Manager()?.classList.add("mo153-hidden");
 const rules=document.querySelector("#rules"); if(rules){rules.classList.remove("mo153-hidden");rules.classList.add("mo150Editor")}
 mo148OpenEditor?.(false);
 const close=document.querySelector("#mo148Close");
 if(close){close.style.display="inline-block";close.textContent="← Home / Filters";}
}
function mo153Add(){
 mo153HideLegacyToolAreas();mo153Manager()?.classList.add("mo153-hidden");
 const rules=document.querySelector("#rules");if(rules){rules.classList.remove("mo153-hidden");rules.classList.add("mo150Editor")}
 mo148OpenEditor?.(true);
 const close=document.querySelector("#mo148Close");
 if(close){close.style.display="inline-block";close.textContent="← Home / Filters";}
}
function mo153Init(){
 // Permanent Home button in the gradient header.
 const tb=document.querySelector("#mo152Toolbar");
 if(tb && !document.querySelector("#mo153Home")){
   const b=document.createElement("button");b.id="mo153Home";b.textContent="Home / Filters";
   b.addEventListener("click",mo153Home);tb.insertBefore(b,tb.firstChild);
 }
 // Make existing Close/Done universally return Home.
 document.querySelector("#mo148Close")?.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();mo153Home()},true);

 // Manager controls use the one canonical rule list.
 document.querySelector("#mo150Edit")?.addEventListener("click",e=>{e.stopImmediatePropagation();mo153Edit()},true);
 document.querySelector("#mo150Run")?.addEventListener("click",e=>{e.stopImmediatePropagation();mo153Run(true)},true);

 // Header controls route to a single work surface.
 const add=mo152Button("+ Add Rule")||mo152Button("Add Rule");
 add?.addEventListener("click",e=>{e.stopImmediatePropagation();mo153Add()},true);
 mo152Button("Run Filters")?.addEventListener("click",e=>{e.stopImmediatePropagation();mo153Run(false)},true);
 mo152Button("Diagnostics")?.addEventListener("click",e=>{
   e.stopImmediatePropagation();mo153ShowOnlyTool(/conflict|duplicate report|diagnostic/i,"Diagnostics");
 },true);
 mo152Button("Import")?.addEventListener("click",e=>{
   e.stopImmediatePropagation();mo153ShowOnlyTool(/thunderbird filter import/i,"Import Filters");
 },true);
 mo152Button("Advanced")?.addEventListener("click",e=>{
   e.stopImmediatePropagation();mo153ShowOnlyTool(/storage inspector/i,"Advanced");
 },true);

 mo153Home();
}
window.addEventListener("load",()=>setTimeout(mo153Init,2700));

// ---------- 0.1.54 master app shell + canonical execution order ----------
const MO154_SIZE="mo154AppSize";
let mo154Selected=new Set();

function mo154RuleId(r){return String(r?.id??"")}
function mo154Rules(){return mo148Current?.()||[]}

async function mo154PersistRules(arr){
 rules=structuredClone(arr);
 await messenger.storage.local.set({rules:structuredClone(arr),mo30LastRulesSaved:new Date().toISOString()});
 mo148Render?.(); mo149Sync?.(); mo152RefreshHeader?.();
 setTimeout(mo154DecorateList,40);
}
function mo154BuildShell(){
 if(document.querySelector("#mo154App"))return;
 const header=document.querySelector("#mo152Header"), ws=document.querySelector("#mo150Workspace");
 if(!header||!ws)return;
 const app=document.createElement("div");app.id="mo154App";
 header.parentNode.insertBefore(app,header); app.append(header,ws);
}
async function mo154RestoreSize(){
 const app=document.querySelector("#mo154App");if(!app)return;
 try{
  const o=await messenger.storage.local.get({[MO154_SIZE]:null}),v=o[MO154_SIZE];
  if(v){if(v.width)app.style.width=v.width+"px";if(v.height)app.style.height=v.height+"px";}
 }catch{}
 if(window.ResizeObserver){
  let t;
  new ResizeObserver(e=>{const r=e[0]?.contentRect;if(!r)return;clearTimeout(t);
    t=setTimeout(()=>messenger.storage.local.set({[MO154_SIZE]:{width:Math.round(r.width),height:Math.round(r.height)}}),300)
  }).observe(app);
 }
}
function mo154Rows(){
 const list=document.querySelector("#mo148List"); if(!list)return [];
 return [...list.children].filter(x=>x.nodeType===1);
}
function mo154DecorateList(){
 const rs=mo154Rules(), rows=mo154Rows();
 rows.forEach((row,i)=>{
   const r=rs[i]; if(!r)return;
   row.dataset.mo154Id=mo154RuleId(r);
   let n=row.querySelector(".mo154-order-num");
   if(!n){n=document.createElement("span");n.className="mo154-order-num";row.prepend(n)}
   n.textContent=String(i+1)+".";
   // Dedicated selection checkbox, independent of Enabled.
   let cb=row.querySelector(".mo154-select");
   if(!cb){cb=document.createElement("input");cb.type="checkbox";cb.className="mo154-select";
     cb.title="Select this filter";row.insertBefore(cb,n);
     cb.addEventListener("click",e=>e.stopPropagation());
     cb.addEventListener("change",()=>{cb.checked?mo154Selected.add(row.dataset.mo154Id):mo154Selected.delete(row.dataset.mo154Id)});
   }
   cb.checked=mo154Selected.has(row.dataset.mo154Id);
 });
}
function mo154SelectedIds(){
 if(mo154Selected.size)return [...mo154Selected];
 const one=mo150SelectedId?.();return one?[String(one)]:[];
}
function mo154SelectAll(on){
 mo154Selected=new Set(on?mo154Rules().map(mo154RuleId):[]);
 mo154DecorateList();
}
async function mo154Move(delta){
 const ids=mo154SelectedIds(); if(!ids.length){alert("Select one or more filters first.");return}
 let a=structuredClone(mo154Rules());
 if(delta<0){
   for(let i=1;i<a.length;i++) if(ids.includes(mo154RuleId(a[i]))&&!ids.includes(mo154RuleId(a[i-1]))) [a[i-1],a[i]]=[a[i],a[i-1]];
 }else{
   for(let i=a.length-2;i>=0;i--) if(ids.includes(mo154RuleId(a[i]))&&!ids.includes(mo154RuleId(a[i+1]))) [a[i+1],a[i]]=[a[i],a[i+1]];
 }
 await mo154PersistRules(a);
}
function mo154BuildOrderBar(){
 const mgr=document.querySelector("#mo148Manager"), list=document.querySelector("#mo148List");if(!mgr||!list||document.querySelector("#mo154OrderBar"))return;
 const bar=document.createElement("div");bar.id="mo154OrderBar";
 bar.innerHTML=`<button id="mo154All">Select All</button><button id="mo154None">Select None</button>
 <button id="mo154Up">↑ Move Up</button><button id="mo154Down">↓ Move Down</button>
 <span id="mo154OrderNote">Displayed order = Manual Run and Incoming execution order</span>`;
 list.parentNode.insertBefore(bar,list);
 bar.querySelector("#mo154All").onclick=()=>mo154SelectAll(true);
 bar.querySelector("#mo154None").onclick=()=>mo154SelectAll(false);
 bar.querySelector("#mo154Up").onclick=()=>mo154Move(-1);
 bar.querySelector("#mo154Down").onclick=()=>mo154Move(1);
}
function mo154SyncManualOrder(){
 // Manual selector is rebuilt/reordered from canonical stored rule order when possible.
 const root=document.querySelector("#manualRules")||document.querySelector("#manualRuleList");if(!root)return;
 const rs=mo154Rules();
 const kids=[...root.children];
 kids.sort((a,b)=>{
   const ta=a.textContent||"",tb=b.textContent||"";
   const ia=rs.findIndex(r=>ta.includes(r.name||"")), ib=rs.findIndex(r=>tb.includes(r.name||""));
   return (ia<0?99999:ia)-(ib<0?99999:ib);
 }).forEach(k=>root.appendChild(k));
}
function mo154Init(){
 mo154BuildShell();mo154RestoreSize();mo154BuildOrderBar();mo154DecorateList();
 // Re-decorate after searches/renders.
 const list=document.querySelector("#mo148List");
 if(list&&window.MutationObserver)new MutationObserver(()=>setTimeout(mo154DecorateList,0)).observe(list,{childList:true});
 // Whenever Run is opened, mirror canonical display/execution order.
 document.addEventListener("click",e=>{
   if(/run filter/i.test(e.target?.textContent||""))setTimeout(mo154SyncManualOrder,120);
 });
}
window.addEventListener("load",()=>setTimeout(mo154Init,3000));

// ---------- 0.1.55 clean canonical Home + checkbox execution + splitters ----------
const MO155_HOME_SPLIT="mo155HomeSplitPct", MO155_RUN_SPLIT="mo155RunSplitPct";
let mo155Selected=new Set();

function mo155Rules(){return mo148Current?.()||[]}
function mo155Id(r){return String(r?.id??"")}
function mo155Manager(){
 const m=document.querySelector("#mo148Manager"); if(!m)return;
 // Replace old rendered list visually with a canonical list; data remains same.
 let head=document.querySelector("#mo155ListHead");
 if(!head){head=document.createElement("div");head.id="mo155ListHead";
   head.innerHTML="<span>Select</span><span>#</span><span>Enabled</span><span>Filter Name</span>";
   const list=document.querySelector("#mo148List");list?.parentNode?.insertBefore(head,list);
 }
 let list=document.querySelector("#mo148List");if(!list)return;
 list.innerHTML="";
 mo155Rules().forEach((r,i)=>{
   const row=document.createElement("div");row.className="mo155row";row.dataset.id=mo155Id(r);
   const checked=mo155Selected.has(mo155Id(r))?"checked":"";
   row.innerHTML=`<span class="mo155sel"><input class="mo155check" type="checkbox" ${checked}></span>
     <span class="mo155num">${i+1}</span>
     <span class="mo155enabled">${r.enabled?"Yes":"No"}</span>
     <span class="mo155name" title="${String(r.name||"").replaceAll('"',"&quot;")}"></span>`;
   row.querySelector(".mo155name").textContent=r.name||"(unnamed rule)";
   const cb=row.querySelector(".mo155check");
   cb.onchange=()=>{cb.checked?mo155Selected.add(row.dataset.id):mo155Selected.delete(row.dataset.id)};
   row.onclick=e=>{if(e.target!==cb){cb.checked=!cb.checked;cb.onchange()}};
   list.appendChild(row);
 });
}
function mo155Ids(){return [...mo155Selected]}
function mo155SelectAll(on){mo155Selected=new Set(on?mo155Rules().map(mo155Id):[]);mo155Manager()}
async function mo155Move(delta){
 const ids=mo155Ids();if(!ids.length){alert("Select one or more filters first.");return}
 let a=structuredClone(mo155Rules());
 if(delta<0){for(let i=1;i<a.length;i++)if(ids.includes(mo155Id(a[i]))&&!ids.includes(mo155Id(a[i-1]))) [a[i-1],a[i]]=[a[i],a[i-1]]}
 else{for(let i=a.length-2;i>=0;i--)if(ids.includes(mo155Id(a[i]))&&!ids.includes(mo155Id(a[i+1]))) [a[i+1],a[i]]=[a[i],a[i+1]]}
 await mo154PersistRules(a);mo155Manager();
}
function mo155SingleId(){
 const ids=mo155Ids(); if(ids.length!==1){alert(ids.length?"Select exactly one filter for Edit.":"Select a filter first.");return null} return ids[0];
}
function mo155SyncManual(){
 const ids=new Set(mo155Ids()), rs=mo155Rules();
 const root=document.querySelector("#manualRules")||document.querySelector("#manualRuleList");if(!root)return;
 [...root.querySelectorAll('input[type="checkbox"]')].forEach(cb=>{
   const row=cb.closest("label,tr,div"), txt=row?.textContent||"", val=String(cb.value||cb.dataset.ruleId||"");
   const r=rs.find(x=>val===mo155Id(x)||(x.name&&txt.includes(x.name)));
   cb.checked=!!r&&ids.has(mo155Id(r));cb.dispatchEvent(new Event("change",{bubbles:true}));
 });
}
function mo155Run(){
 if(!mo155Ids().length){alert("Select one or more filters first.");return}
 document.body.classList.remove("mo155-home");mo153ShowOnlyTool(/manual filter run/i,"Run Filters");
 setTimeout(()=>{mo155SyncManual();mo155InstallRunSplitter()},100);
}
function mo155Edit(){
 const id=mo155SingleId();if(!id)return;
 // Feed legacy editor its expected single radio selection.
 mo148Selected=id;document.body.classList.remove("mo155-home");mo153Edit();
}
function mo155Home(){
 document.body.classList.add("mo155-home");mo153Home();setTimeout(mo155Manager,20);
}
function mo155HomeLayout(){
 const mgr=document.querySelector("#mo148Manager"), list=document.querySelector("#mo148List");if(!mgr||!list)return;
 document.querySelector("#mo154OrderBar")?.remove();
 document.querySelector("#mo150ManagerActions")?.remove();
 let actions=document.querySelector("#mo155HomeActions");
 if(!actions){actions=document.createElement("div");actions.id="mo155HomeActions";
  actions.innerHTML=`<button id="mo155All">Select All</button><button id="mo155None">Select None</button>
  <button id="mo155Edit">Edit</button><button id="mo155Run">Run Selected</button>
  <button id="mo155Toggle">Enable / Disable</button><button id="mo155Up">↑ Move Up</button><button id="mo155Down">↓ Move Down</button>`;
  const head=document.querySelector("#mo155ListHead");head?.parentNode?.insertBefore(actions,head);
  actions.querySelector("#mo155All").onclick=()=>mo155SelectAll(true);
  actions.querySelector("#mo155None").onclick=()=>mo155SelectAll(false);
  actions.querySelector("#mo155Edit").onclick=mo155Edit;actions.querySelector("#mo155Run").onclick=mo155Run;
  actions.querySelector("#mo155Up").onclick=()=>mo155Move(-1);actions.querySelector("#mo155Down").onclick=()=>mo155Move(1);
  actions.querySelector("#mo155Toggle").onclick=async()=>{
    const ids=mo155Ids();if(!ids.length){alert("Select one or more filters first.");return}
    const a=structuredClone(mo155Rules()), anyOff=a.some(r=>ids.includes(mo155Id(r))&&!r.enabled);
    a.forEach(r=>{if(ids.includes(mo155Id(r)))r.enabled=anyOff});await mo154PersistRules(a);mo155Manager();
  };
 }
 // proportional list area; simple draggable horizontal splitter above bottom actions/status.
 let split=document.querySelector("#mo155HomeSplit");
 if(!split){split=document.createElement("div");split.id="mo155HomeSplit";list.after(split);
   let dragging=false;
   split.onmousedown=()=>dragging=true;window.addEventListener("mouseup",()=>dragging=false);
   window.addEventListener("mousemove",e=>{if(!dragging)return;const box=mgr.getBoundingClientRect();
     let pct=Math.max(35,Math.min(88,(e.clientY-box.top)/box.height*100));
     list.style.flex="none";list.style.height=pct+"%";messenger.storage.local.set({[MO155_HOME_SPLIT]:pct});
   });
   messenger.storage.local.get({[MO155_HOME_SPLIT]:70}).then(o=>{list.style.flex="none";list.style.height=o[MO155_HOME_SPLIT]+"%"});
 }
}
function mo155InstallRunSplitter(){
 const tool=[...document.querySelectorAll(".mo150CompactTool")].find(x=>/manual filter run/i.test(x.textContent||""));if(!tool||tool.querySelector("#mo155RunSplit"))return;
 const candidates=[...tool.children]; if(candidates.length<2)return;
 const split=document.createElement("div");split.id="mo155RunSplit";
 const result=candidates.find(x=>/result|activity|summary/i.test(x.textContent||""))||candidates[candidates.length-1];
 result.parentNode.insertBefore(split,result);result.id=result.id||"mo155RunResults";
 let dragging=false;split.onmousedown=()=>dragging=true;window.addEventListener("mouseup",()=>dragging=false);
 window.addEventListener("mousemove",e=>{if(!dragging)return;const box=tool.getBoundingClientRect();
   let pct=Math.max(30,Math.min(80,(e.clientY-box.top)/box.height*100));result.style.maxHeight=(100-pct)+"%";
   messenger.storage.local.set({[MO155_RUN_SPLIT]:pct});
 });
}
function mo155Init(){
 // Correct version badge regardless of inherited .52 text.
 const v=document.querySelector("#mo152Version");if(v)v.textContent="v0.1.55";
 mo155Manager();mo155HomeLayout();mo155Home();
 document.querySelector("#mo153Home")?.addEventListener("click",e=>{e.stopImmediatePropagation();mo155Home()},true);
}
window.addEventListener("load",()=>setTimeout(mo155Init,3300));

// ---------- 0.1.56 authoritative selection + compact names + proportional scaling ----------
function mo156ShortName(name,max=20){
 name=String(name||"(unnamed rule)");
 return name.length<=max?name:name.slice(0,max-1)+"…";
}
function mo156Render(){
 const list=document.querySelector("#mo148List");if(!list)return;
 const rs=mo155Rules();
 list.innerHTML="";
 rs.forEach((r,i)=>{
   const id=mo155Id(r), row=document.createElement("div");
   row.className="mo155row";row.dataset.id=id;
   row.innerHTML=`<span class="mo155sel"><input class="mo155check" type="checkbox"></span>
     <span class="mo155num">${i+1}</span>
     <span class="mo155enabled">${r.enabled?"Yes":"No"}</span>
     <span class="mo155name"></span>`;
   const cb=row.querySelector(".mo155check"), nm=row.querySelector(".mo155name");
   cb.checked=mo155Selected.has(id);nm.textContent=mo156ShortName(r.name,20);nm.title=r.name||"";
   cb.addEventListener("click",e=>e.stopPropagation());
   cb.addEventListener("change",()=>{cb.checked?mo155Selected.add(id):mo155Selected.delete(id)});
   row.addEventListener("click",e=>{if(e.target===cb)return;cb.checked=!cb.checked;cb.dispatchEvent(new Event("change"))});
   list.appendChild(row);
 });
}
function mo156SelectedIds(){
 // DOM is authoritative, so every operation sees exactly what user sees checked.
 const ids=[...document.querySelectorAll("#mo148List .mo155row")]
   .filter(row=>row.querySelector(".mo155check")?.checked).map(row=>String(row.dataset.id));
 mo155Selected=new Set(ids);return ids;
}
async function mo156Toggle(){
 const ids=mo156SelectedIds();if(!ids.length){alert("Select one or more filters first.");return}
 const a=structuredClone(mo155Rules()), anyDisabled=a.some(r=>ids.includes(mo155Id(r))&&!r.enabled);
 a.forEach(r=>{if(ids.includes(mo155Id(r)))r.enabled=anyDisabled});
 await mo154PersistRules(a);mo156Render();
}
async function mo156Move(delta){
 const ids=mo156SelectedIds();if(!ids.length){alert("Select one or more filters first.");return}
 let a=structuredClone(mo155Rules());
 if(delta<0){for(let i=1;i<a.length;i++)if(ids.includes(mo155Id(a[i]))&&!ids.includes(mo155Id(a[i-1]))) [a[i-1],a[i]]=[a[i],a[i-1]]}
 else{for(let i=a.length-2;i>=0;i--)if(ids.includes(mo155Id(a[i]))&&!ids.includes(mo155Id(a[i+1]))) [a[i+1],a[i]]=[a[i],a[i+1]]}
 await mo154PersistRules(a);mo156Render();
}
function mo156Run(){
 const ids=mo156SelectedIds();if(!ids.length){alert("Select one or more filters first.");return}
 mo155Selected=new Set(ids);mo155Run();
}
function mo156Edit(){
 const ids=mo156SelectedIds();if(ids.length!==1){alert(ids.length?"Select exactly one filter for Edit.":"Select a filter first.");return}
 mo155Selected=new Set(ids);mo155Edit();
}
function mo156Scale(){
 const app=document.querySelector("#mo154App");if(!app)return;
 const r=app.getBoundingClientRect();
 const scale=Math.max(.88,Math.min(1.18,Math.min(r.width/980,r.height/700)));
 app.style.setProperty("--moScale",scale.toFixed(3));
}
function mo156Wire(){
 const v=document.querySelector("#mo152Version");if(v)v.textContent="v0.1.56";
 // Replace inherited handlers with clones so only one selection path remains.
 const ids=["mo155All","mo155None","mo155Edit","mo155Run","mo155Toggle","mo155Up","mo155Down"];
 const fns=[
  ()=>{mo155Selected=new Set(mo155Rules().map(mo155Id));mo156Render()},
  ()=>{mo155Selected.clear();mo156Render()},mo156Edit,mo156Run,mo156Toggle,()=>mo156Move(-1),()=>mo156Move(1)
 ];
 ids.forEach((id,i)=>{const old=document.getElementById(id);if(!old)return;const n=old.cloneNode(true);old.replaceWith(n);n.onclick=fns[i]});
 mo156Render();mo156Scale();
 const app=document.querySelector("#mo154App");
 if(app&&window.ResizeObserver)new ResizeObserver(()=>mo156Scale()).observe(app);
 // keep our clean renderer after Home navigation
 document.querySelector("#mo153Home")?.addEventListener("click",()=>setTimeout(mo156Render,40));
}
window.addEventListener("load",()=>setTimeout(mo156Wire,3600));

const MO157_COLS="mo157ColumnWidths";let mo157Cols={select:64,num:54,enabled:92};
function mo157DisplayName(name){return String(name||"(unnamed rule)").replace(/^TB:\s*/i,"")}
function mo157ApplyCols(){const app=document.querySelector("#mo154App");if(!app)return;app.style.setProperty("--moColSelect",mo157Cols.select+"px");app.style.setProperty("--moColNum",mo157Cols.num+"px");app.style.setProperty("--moColEnabled",mo157Cols.enabled+"px")}
async function mo157LoadCols(){try{const o=await messenger.storage.local.get({[MO157_COLS]:null});if(o[MO157_COLS])mo157Cols={...mo157Cols,...o[MO157_COLS]}}catch{}mo157ApplyCols()}
function mo157InstallGrips(){const head=document.querySelector("#mo155ListHead");if(!head)return;const cells=[...head.children],keys=["select","num","enabled"];keys.forEach((key,i)=>{const cell=cells[i];if(!cell||cell.querySelector(".mo157grip"))return;const grip=document.createElement("span");grip.className="mo157grip";grip.title="Drag to resize column";cell.appendChild(grip);grip.addEventListener("mousedown",e=>{e.preventDefault();e.stopPropagation();const sx=e.clientX,start=mo157Cols[key],mins={select:46,num:38,enabled:68};function move(ev){mo157Cols[key]=Math.max(mins[key],Math.round(start+ev.clientX-sx));mo157ApplyCols()}async function up(){window.removeEventListener("mousemove",move);window.removeEventListener("mouseup",up);await messenger.storage.local.set({[MO157_COLS]:mo157Cols})}window.addEventListener("mousemove",move);window.addEventListener("mouseup",up)})})}
function mo157Render(){const list=document.querySelector("#mo148List");if(!list)return;const rs=mo155Rules();list.innerHTML="";rs.forEach((r,i)=>{const id=mo155Id(r),row=document.createElement("div");row.className="mo155row";row.dataset.id=id;row.innerHTML=`<span class="mo155sel"><input class="mo155check" type="checkbox"></span><span class="mo155num">${i+1}</span><span class="mo155enabled">${r.enabled?"Yes":"No"}</span><span class="mo155name"></span>`;const cb=row.querySelector(".mo155check"),nm=row.querySelector(".mo155name");cb.checked=mo155Selected.has(id);const full=mo157DisplayName(r.name);nm.textContent=full;nm.title=full;cb.onclick=e=>e.stopPropagation();cb.onchange=()=>{cb.checked?mo155Selected.add(id):mo155Selected.delete(id)};row.onclick=e=>{if(e.target===cb)return;cb.checked=!cb.checked;cb.dispatchEvent(new Event("change"))};list.appendChild(row)})}
function mo157Init(){const v=document.querySelector("#mo152Version");if(v)v.textContent="v0.1.57";window.mo156Render=mo157Render;mo157LoadCols();mo157Render();mo157InstallGrips();document.querySelector("#mo153Home")?.addEventListener("click",()=>setTimeout(()=>{mo157Render();mo157InstallGrips()},60))}
window.addEventListener("load",()=>setTimeout(mo157Init,3900));

const MO158_PREFS="mo158Prefs";let mo158Active=null,mo158Prefs={fontSize:13,checkboxSide:"right"};
function mo158Rules(){return mo148Current?.()||[]} function mo158Id(r){return String(r?.id??"")}
function mo158FriendlyName(name){let n=String(name||"(unnamed rule)").replace(/^TB:\s*/i,"").trim();n=n.replace(/^From\s+contains\s*:\s*/i,"").replace(/^From\s+is\s*:\s*/i,"").replace(/^Subject\s+contains\s*:\s*/i,"").replace(/^Subject\s+is\s*:\s*/i,"");return n||"(unnamed rule)"}
async function mo158SetEnabled(id,on){const a=structuredClone(mo158Rules()),r=a.find(x=>mo158Id(x)===String(id));if(!r)return;r.enabled=!!on;await mo154PersistRules(a);mo158Render();mo152RefreshHeader?.()}
function mo158Render(){const list=document.querySelector("#mo148List");if(!list)return;let head=document.querySelector("#mo158ListHead");if(!head){head=document.createElement("div");head.id="mo158ListHead";list.parentNode.insertBefore(head,list)}
 const left=mo158Prefs.checkboxSide==="left";head.innerHTML=left?'<span class="enabled">Run</span><span>Filter Name</span>':'<span>Filter Name</span><span class="enabled">Run</span>';head.style.gridTemplateColumns=left?"52px minmax(180px,1fr)":"minmax(180px,1fr) 52px";list.innerHTML="";
 mo158Rules().forEach(r=>{const row=document.createElement("div");row.className="mo158row"+(mo158Active===mo158Id(r)?" mo158active":"");row.dataset.id=mo158Id(r);const nm=document.createElement("span");nm.className="mo158name";nm.style.fontSize=mo158Prefs.fontSize+"px";nm.textContent=mo158FriendlyName(r.name);nm.title=mo158FriendlyName(r.name);const wrap=document.createElement("span");wrap.className="mo158enabled";const cb=document.createElement("input");cb.type="checkbox";cb.checked=!!r.enabled;cb.title="Enabled for incoming processing";cb.onclick=e=>e.stopPropagation();cb.onchange=()=>mo158SetEnabled(row.dataset.id,cb.checked);wrap.appendChild(cb);if(left){row.append(wrap,nm);row.style.gridTemplateColumns="52px minmax(180px,1fr)"}else{row.append(nm,wrap);row.style.gridTemplateColumns="minmax(180px,1fr) 52px"}row.onclick=()=>{mo158Active=row.dataset.id;mo158Render()};list.appendChild(row)})}
function mo158ActiveRule(){const r=mo158Rules().find(x=>mo158Id(x)===String(mo158Active));if(!r)alert("Click a filter row first.");return r||null}
async function mo158Move(d){const r=mo158ActiveRule();if(!r)return;let a=structuredClone(mo158Rules()),i=a.findIndex(x=>mo158Id(x)===mo158Id(r)),j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];await mo154PersistRules(a);mo158Render()}
function mo158Edit(){const r=mo158ActiveRule();if(!r)return;mo148Selected=mo158Id(r);document.body.classList.remove("mo155-home");mo153Edit()}
function mo158RunNow(){const r=mo158ActiveRule();if(!r)return;mo155Selected=new Set([mo158Id(r)]);document.body.classList.remove("mo155-home");mo153ShowOnlyTool(/manual filter run/i,"Run Filter");setTimeout(()=>mo155SyncManual(),100)}
function mo158BuildActions(){document.querySelector("#mo155HomeActions")?.remove();document.querySelector("#mo155ListHead")?.remove();const list=document.querySelector("#mo148List");if(!list)return;let bar=document.querySelector("#mo158Actions");if(!bar){bar=document.createElement("div");bar.id="mo158Actions";bar.innerHTML='<button id="mo158Edit">Edit</button><button id="mo158Run">Run Now</button><button id="mo158Up">↑ Move Up</button><button id="mo158Down">↓ Move Down</button><button id="mo158PrefBtn">Preferences</button>';list.parentNode.insertBefore(bar,list);bar.querySelector("#mo158Edit").onclick=mo158Edit;bar.querySelector("#mo158Run").onclick=mo158RunNow;bar.querySelector("#mo158Up").onclick=()=>mo158Move(-1);bar.querySelector("#mo158Down").onclick=()=>mo158Move(1);bar.querySelector("#mo158PrefBtn").onclick=()=>document.querySelector("#mo158Prefs")?.classList.toggle("open")}
 let prefs=document.querySelector("#mo158Prefs");if(!prefs){prefs=document.createElement("div");prefs.id="mo158Prefs";prefs.innerHTML='<strong>Preferences</strong> &nbsp; <label>Filter name size <select id="mo158Font"><option>11</option><option>12</option><option selected>13</option><option>14</option><option>15</option><option>16</option></select> px</label><label>Checkbox <select id="mo158Side"><option value="right">Right</option><option value="left">Left</option></select></label>';bar.after(prefs);prefs.querySelector("#mo158Font").onchange=async e=>{mo158Prefs.fontSize=+e.target.value;await messenger.storage.local.set({[MO158_PREFS]:mo158Prefs});mo158Render()};prefs.querySelector("#mo158Side").onchange=async e=>{mo158Prefs.checkboxSide=e.target.value;await messenger.storage.local.set({[MO158_PREFS]:mo158Prefs});mo158Render()}}}
async function mo158Init(){const v=document.querySelector("#mo152Version");if(v)v.textContent="v0.1.58";try{const o=await messenger.storage.local.get({[MO158_PREFS]:null});if(o[MO158_PREFS])mo158Prefs={...mo158Prefs,...o[MO158_PREFS]}}catch{}mo158BuildActions();mo158Render();const f=document.querySelector("#mo158Font"),side=document.querySelector("#mo158Side");if(f)f.value=String(mo158Prefs.fontSize);if(side)side.value=mo158Prefs.checkboxSide;const old=[...document.querySelectorAll("#mo148Manager button")].find(b=>b.textContent.trim()==="Edit"&&!b.closest("#mo158Actions"));if(old)old.style.display="none";document.querySelector("#mo153Home")?.addEventListener("click",()=>setTimeout(()=>{mo158BuildActions();mo158Render()},60))}
window.addEventListener("load",()=>setTimeout(mo158Init,4200));

// ---------- 0.1.59 compact Thunderbird-style Home ----------
function mo159Build(){
 const mgr=document.querySelector("#mo148Manager"),list=document.querySelector("#mo148List");
 if(!mgr||!list||document.querySelector("#mo159HomeLayout"))return;
 const head=document.querySelector("#mo158ListHead");
 const search=[...mgr.querySelectorAll("input")].find(x=>/search/i.test(x.placeholder||""));
 const searchWrap=search?.parentElement;

 const layout=document.createElement("div");layout.id="mo159HomeLayout";
 const left=document.createElement("div");left.id="mo159ListPane";
 const side=document.createElement("div");side.id="mo159SideActions";
 side.innerHTML=`<button id="mo159Edit">Edit</button><button id="mo159Run">Run Now</button>
 <div class="mo159spacer"></div><button id="mo159Up">↑ Move Up</button><button id="mo159Down">↓ Move Down</button>
 <div class="mo159spacer"></div><button id="mo159PrefsBtn">Preferences</button>`;
 // Place layout where list/head currently live.
 const anchor=(searchWrap&&searchWrap.parentNode===mgr)?searchWrap:(head||list);
 mgr.insertBefore(layout,anchor);
 if(searchWrap)left.appendChild(searchWrap);
 const prefs=document.querySelector("#mo158Prefs"); if(prefs)left.appendChild(prefs);
 if(head)left.appendChild(head); left.appendChild(list);
 layout.append(left,side);

 side.querySelector("#mo159Edit").onclick=mo158Edit;
 side.querySelector("#mo159Run").onclick=mo158RunNow;
 side.querySelector("#mo159Up").onclick=()=>mo158Move(-1);
 side.querySelector("#mo159Down").onclick=()=>mo158Move(1);
 side.querySelector("#mo159PrefsBtn").onclick=()=>document.querySelector("#mo158Prefs")?.classList.toggle("open");

 // Old horizontal action bar is no longer part of Home.
 document.querySelector("#mo158Actions")?.remove();
}
function mo159Init(){
 const v=document.querySelector("#mo152Version");if(v)v.textContent="v0.1.59";
 mo159Build();mo158Render();
 // Preserve compact Home after returning from tools.
 document.querySelector("#mo153Home")?.addEventListener("click",()=>setTimeout(()=>{mo159Build();mo158Render()},80));
}
window.addEventListener("load",()=>setTimeout(mo159Init,4500));

// 0.1.60: canonical Name | Run | Menu list and overlay editor.
let mo160Active=null, mo160Editing=null;
const mo160Rules=()=>mo148Current?.()||[];
const mo160Id=r=>String(r?.id??"");
const mo160Name=r=>mo158FriendlyName?mo158FriendlyName(r.name):String(r.name||"(unnamed)");

function mo160UI(){
 const list=document.querySelector("#mo148List"); if(!list)return;
 document.querySelector("#mo158ListHead")?.remove();
 let hd=document.querySelector("#mo160Head");
 if(!hd){hd=document.createElement("div");hd.id="mo160Head";hd.innerHTML='<span>Name</span><span class="c">Run</span><span class="c">Menu</span>';list.parentNode.insertBefore(hd,list)}
 if(!document.querySelector("#mo160Context")){
   let c=document.createElement("div");c.id="mo160Context";c.innerHTML='<button data-a="edit">Edit</button><button data-a="run">Run Now</button><button data-a="up">Move Up</button><button data-a="down">Move Down</button><button data-a="clone">Duplicate</button><button data-a="toggle">Enable / Disable</button><button data-a="delete">Delete</button>';document.body.appendChild(c);
   c.onclick=e=>{let b=e.target.closest("button");if(b)mo160Action(b.dataset.a)}
 }
 if(!document.querySelector("#mo160Overlay")){
   let o=document.createElement("div");o.id="mo160Overlay";o.innerHTML='<div id="mo160Dialog"><div id="mo160DialogHead"><span id="mo160Title">Edit Filter</span><button id="mo160X">✕</button></div><div id="mo160DialogBody"><div id="mo160EditorHost"></div></div><div id="mo160DialogFoot"><button id="mo160Cancel">Cancel</button><button id="mo160Save">Save</button></div></div>';
   (document.querySelector("#mo154App")||document.body).appendChild(o);
   o.querySelector("#mo160X").onclick=o.querySelector("#mo160Cancel").onclick=mo160Close;
   o.querySelector("#mo160Save").onclick=mo160Save;
 }
}
function mo160Render(){
 mo160UI();let list=document.querySelector("#mo148List");if(!list)return;list.innerHTML="";
 for(const r of mo160Rules()){
   let row=document.createElement("div");row.className="mo160row"+(mo160Active===mo160Id(r)?" active":"");row.dataset.id=mo160Id(r);
   let n=document.createElement("span");n.className="mo160name";n.textContent=mo160Name(r);n.title=mo160Name(r);n.style.fontSize=(mo158Prefs?.fontSize||13)+"px";
   let rr=document.createElement("span");rr.className="mo160run";let cb=document.createElement("input");cb.type="checkbox";cb.checked=!!r.enabled;cb.onclick=e=>e.stopPropagation();cb.onchange=async()=>{let a=structuredClone(mo160Rules()),x=a.find(q=>mo160Id(q)===row.dataset.id);if(x){x.enabled=cb.checked;await mo154PersistRules(a);mo152RefreshHeader?.()}};rr.append(cb);
   let mm=document.createElement("span");mm.className="mo160menu";let b=document.createElement("button");b.className="mo160dots";b.textContent="⋮";b.onclick=e=>{e.stopPropagation();mo160Active=row.dataset.id;mo160Render();let c=document.querySelector("#mo160Context"),z=b.getBoundingClientRect();c.style.left=Math.max(4,z.right-150)+"px";c.style.top=Math.min(innerHeight-220,z.bottom+2)+"px";c.classList.add("open")};mm.append(b);
   row.append(n,rr,mm);row.onclick=()=>{mo160Active=row.dataset.id;mo160Render()};row.ondblclick=()=>mo160Edit(row.dataset.id);list.append(row)
 }
}
async function mo160Move(d){let a=structuredClone(mo160Rules()),i=a.findIndex(x=>mo160Id(x)===String(mo160Active)),j=i+d;if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];await mo154PersistRules(a);mo160Render()}
async function mo160Toggle(){let a=structuredClone(mo160Rules()),r=a.find(x=>mo160Id(x)===String(mo160Active));if(!r)return;r.enabled=!r.enabled;await mo154PersistRules(a);mo160Render();mo152RefreshHeader?.()}
async function mo160Clone(){let a=structuredClone(mo160Rules()),i=a.findIndex(x=>mo160Id(x)===String(mo160Active));if(i<0)return;let x=structuredClone(a[i]);x.id=crypto.randomUUID?crypto.randomUUID():"r"+Date.now();x.name=(x.name||"Rule")+" copy";x.enabled=false;a.splice(i+1,0,x);await mo154PersistRules(a);mo160Active=mo160Id(x);mo160Render()}
async function mo160Delete(){let r=mo160Rules().find(x=>mo160Id(x)===String(mo160Active));if(!r||!confirm(`Delete filter "${mo160Name(r)}"?`))return;await mo154PersistRules(structuredClone(mo160Rules()).filter(x=>mo160Id(x)!==String(mo160Active)));mo160Active=null;mo160Render();mo152RefreshHeader?.()}
function mo160Run(){let r=mo160Rules().find(x=>mo160Id(x)===String(mo160Active));if(!r)return;mo155Selected=new Set([mo160Id(r)]);document.body.classList.remove("mo155-home");mo153ShowOnlyTool(/manual filter run/i,"Run Filter");setTimeout(()=>mo155SyncManual(),100)}
function mo160Action(a){document.querySelector("#mo160Context")?.classList.remove("open");({edit:()=>mo160Edit(mo160Active),run:mo160Run,up:()=>mo160Move(-1),down:()=>mo160Move(1),clone:mo160Clone,toggle:mo160Toggle,delete:mo160Delete}[a]||(()=>{}))()}
document.addEventListener("click",e=>{if(!e.target.closest("#mo160Context")&&!e.target.closest(".mo160dots"))document.querySelector("#mo160Context")?.classList.remove("open")});

function mo160Edit(id){
 let r=mo160Rules().find(x=>mo160Id(x)===String(id));if(!r)return;mo160Editing=id;mo148Selected=id;try{mo153Edit()}catch{}
 setTimeout(()=>{let host=document.querySelector("#mo160EditorHost");let candidates=[...document.querySelectorAll("section,div")].filter(x=>!x.closest("#mo160Overlay")&&/rule editor|edit rule|add.*rule/i.test(x.querySelector("h2,h3")?.textContent||"")&&x.querySelector("input,select,textarea"));let ed=candidates[0]||document.querySelector("#ruleEditor,#editorSection,#addEditSection");if(ed){ed.dataset.mo160Origin="1";host.appendChild(ed);ed.style.display="block"}document.querySelector("#mo160Title").textContent="Edit Filter: "+mo160Name(r);document.querySelector("#mo160Overlay").classList.add("open")},100)
}
function mo160Return(){let ed=document.querySelector('#mo160EditorHost > [data-mo160-origin="1"]');if(ed){(document.querySelector("#mo154App")||document.body).appendChild(ed);ed.style.display="none"}}
function mo160Close(){document.querySelector("#mo160Overlay")?.classList.remove("open");mo160Return();mo160Editing=null;setTimeout(mo160Render,80)}
function mo160Save(){let b=[...document.querySelectorAll("#mo160EditorHost button")].find(x=>/^save/i.test(x.textContent.trim()));if(b)b.click();else document.querySelector("#saveRules")?.click();setTimeout(mo160Close,180)}
function mo160Init(){let v=document.querySelector("#mo152Version");if(v)v.textContent="v0.1.60";document.querySelector("#mo159SideActions")?.remove();document.querySelector("#mo158Actions")?.remove();mo160UI();mo160Render();document.querySelector("#mo153Home")?.addEventListener("click",()=>setTimeout(mo160Render,100))}
window.addEventListener("load",()=>setTimeout(mo160Init,4800));

// ---------- 0.1.61 isolated clean Home list ----------
let mo161Active=null, mo161Query="";
const mo161Rules=()=>mo148Current?.()||[];
const mo161Id=r=>String(r?.id??"");
const mo161Name=r=>mo158FriendlyName?mo158FriendlyName(r.name):String(r.name||"(unnamed rule)");

function mo161Build(){
 const legacy=document.querySelector("#mo148List"); if(!legacy)return;
 let mgr=document.querySelector("#mo161Manager");
 if(!mgr){
   mgr=document.createElement("div");mgr.id="mo161Manager";
   mgr.innerHTML=`<div id="mo161Top"><input id="mo161Search" type="search" placeholder="Search filters by name..."><span id="mo161Count"></span></div>
   <div id="mo161Frame"><div id="mo161Head"><span>Name</span><span class="center">Run</span><span class="center">Menu</span></div><div id="mo161Rows"></div></div>`;
   const parent=legacy.parentNode;
   // Hide old search/count controls in the same pane so only the clean manager remains.
   [...parent.children].forEach(x=>{if(x!==legacy && x.id!=="mo161Manager" && (x.querySelector?.('input[placeholder*="Search"]')||/shown.*total/i.test(x.textContent||"")))x.style.display="none"});
   parent.insertBefore(mgr,legacy);
   mgr.querySelector("#mo161Search").oninput=e=>{mo161Query=e.target.value.trim().toLowerCase();mo161Render()};
 }
 if(!document.querySelector("#mo161Menu")){
   const menu=document.createElement("div");menu.id="mo161Menu";
   menu.innerHTML='<button data-a="edit">Edit</button><button data-a="run">Run Now</button><button data-a="up">Move Up</button><button data-a="down">Move Down</button><button data-a="clone">Duplicate</button><button data-a="toggle">Enable / Disable</button><button class="danger" data-a="delete">Delete</button>';
   (document.querySelector("#mo154App")||document.body).appendChild(menu);
   menu.onclick=e=>{const b=e.target.closest("button");if(b)mo161Action(b.dataset.a)}
 }
}
function mo161Render(){
 mo161Build(); const rows=document.querySelector("#mo161Rows"), count=document.querySelector("#mo161Count"); if(!rows)return;
 const all=mo161Rules(),shown=all.filter(r=>!mo161Query||mo161Name(r).toLowerCase().includes(mo161Query));
 count.textContent=`${shown.length} shown · ${all.length} total`; rows.innerHTML="";
 if(!shown.length){rows.innerHTML='<div id="mo161Empty">No filters match this search.</div>';return}
 for(const r of shown){
   const id=mo161Id(r),row=document.createElement("div");row.className="mo161row"+(mo161Active===id?" active":"");row.dataset.id=id;
   const name=document.createElement("div");name.className="mo161name";name.textContent=mo161Name(r);name.title=mo161Name(r);name.style.fontSize=(mo158Prefs?.fontSize||13)+"px";
   const run=document.createElement("div");run.className="mo161run";const cb=document.createElement("input");cb.type="checkbox";cb.checked=!!r.enabled;cb.title="Enabled for normal filter processing";cb.onclick=e=>e.stopPropagation();cb.onchange=async()=>{let a=structuredClone(mo161Rules()),x=a.find(q=>mo161Id(q)===id);if(x){x.enabled=cb.checked;await mo154PersistRules(a);mo152RefreshHeader?.()}};run.append(cb);
   const mc=document.createElement("div");mc.className="mo161menu";const dots=document.createElement("button");dots.className="mo161dots";dots.textContent="⋮";dots.title="Actions";dots.onclick=e=>{e.stopPropagation();mo161Active=id;mo161Render();requestAnimationFrame(()=>mo161OpenMenu(id))};mc.append(dots);
   row.append(name,run,mc);row.onclick=()=>{mo161Active=id;mo161Render()};row.ondblclick=()=>{mo161Active=id;mo160Edit(id)};rows.append(row)
 }
}
function mo161OpenMenu(id){
 const row=[...document.querySelectorAll("#mo161Rows .mo161row")].find(x=>x.dataset.id===id),btn=row?.querySelector(".mo161dots"),menu=document.querySelector("#mo161Menu"),app=document.querySelector("#mo154App");if(!btn||!menu||!app)return;
 const b=btn.getBoundingClientRect(),a=app.getBoundingClientRect();menu.classList.add("open");
 const mw=menu.offsetWidth||158,mh=menu.offsetHeight||220;
 let left=b.right-a.left-mw,top=b.bottom-a.top+3;
 left=Math.max(4,Math.min(left,a.width-mw-4)); top=Math.max(4,Math.min(top,a.height-mh-4));
 menu.style.left=left+"px";menu.style.top=top+"px";
}
function mo161CloseMenu(){document.querySelector("#mo161Menu")?.classList.remove("open")}
document.addEventListener("click",e=>{if(!e.target.closest("#mo161Menu")&&!e.target.closest(".mo161dots"))mo161CloseMenu()});

async function mo161Move(d){let a=structuredClone(mo161Rules()),i=a.findIndex(x=>mo161Id(x)===String(mo161Active)),j=i+d;if(i<0||j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];await mo154PersistRules(a);mo161Render()}
async function mo161Toggle(){let a=structuredClone(mo161Rules()),r=a.find(x=>mo161Id(x)===String(mo161Active));if(!r)return;r.enabled=!r.enabled;await mo154PersistRules(a);mo161Render();mo152RefreshHeader?.()}
async function mo161Clone(){let a=structuredClone(mo161Rules()),i=a.findIndex(x=>mo161Id(x)===String(mo161Active));if(i<0)return;let x=structuredClone(a[i]);x.id=crypto.randomUUID?crypto.randomUUID():"r"+Date.now();x.name=(x.name||"Rule")+" copy";x.enabled=false;a.splice(i+1,0,x);await mo154PersistRules(a);mo161Active=mo161Id(x);mo161Render();mo152RefreshHeader?.()}
async function mo161Delete(){let r=mo161Rules().find(x=>mo161Id(x)===String(mo161Active));if(!r||!confirm(`Delete filter "${mo161Name(r)}"?`))return;await mo154PersistRules(structuredClone(mo161Rules()).filter(x=>mo161Id(x)!==String(mo161Active)));mo161Active=null;mo161Render();mo152RefreshHeader?.()}
function mo161Run(){let r=mo161Rules().find(x=>mo161Id(x)===String(mo161Active));if(!r)return;mo155Selected=new Set([mo161Id(r)]);document.body.classList.remove("mo155-home");mo153ShowOnlyTool(/manual filter run/i,"Run Filter");setTimeout(()=>mo155SyncManual(),100)}
function mo161Action(a){mo161CloseMenu();({edit:()=>mo160Edit(mo161Active),run:mo161Run,up:()=>mo161Move(-1),down:()=>mo161Move(1),clone:mo161Clone,toggle:mo161Toggle,delete:mo161Delete}[a]||(()=>{}))()}

function mo161Init(){
 const v=document.querySelector("#mo152Version");if(v)v.textContent="v0.1.61";
 // Disable old .60 context menu; .61 owns its own isolated list/menu.
 document.querySelector("#mo160Context")?.remove();
 mo161Build();mo161Render();
 document.querySelector("#mo153Home")?.addEventListener("click",()=>setTimeout(()=>{mo161Build();mo161Render()},100));
}
window.addEventListener("load",()=>setTimeout(mo161Init,5100));

// ---------- 0.1.62 bulk enable/disable + compact names + highlighted-rule folder run ----------
function mo162ShortName(name){
 const full=String(name||"(unnamed rule)");
 // Display only: keep full name in title/hover.
 if(full.length<=34)return full;
 return full.slice(0,31).trimEnd()+"…";
}
async function mo162SetAll(enabled){
 const rules=structuredClone(mo161Rules());
 if(enabled && !confirm(`Enable all ${rules.length} filters?\n\nThey will be eligible to run when incoming processing is ON.`))return;
 if(!enabled && !confirm(`Disable all ${rules.length} filters?`))return;
 for(const r of rules)r.enabled=enabled;
 await mo154PersistRules(rules);mo161Render();mo152RefreshHeader?.();mo162UpdateSelected();
}
async function mo162LoadFolders(){
 const sel=document.querySelector("#mo162Folder");if(!sel)return;
 sel.innerHTML='<option value="">Choose one folder…</option>';
 let folders=[];
 try{
   if(typeof mo011GetFolders==="function")folders=await mo011GetFolders();
   else if(typeof loadFolders==="function")folders=await loadFolders();
 }catch{}
 // Reuse any already-populated folder selector if helper names differ.
 if(!folders?.length){
   const src=[...document.querySelectorAll("select")].find(x=>x!==sel && [...x.options].some(o=>/inbox|possiblejunk|gmail/i.test(o.textContent||"")));
   if(src)for(const o of [...src.options])if(o.value)sel.add(new Option(o.textContent,o.value));
   return;
 }
 const flat=[];
 const walk=(arr,p="")=>{for(const f of arr||[]){flat.push({id:f.id||f.path||f.folderId,name:(p?p+" / ":"")+(f.name||f.path||"Folder")});if(f.subFolders||f.folders)walk(f.subFolders||f.folders,(p?p+" / ":"")+(f.name||""))}};
 walk(folders);
 for(const f of flat)if(f.id)sel.add(new Option(f.name,f.id));
}
function mo162UpdateSelected(){
 const t=document.querySelector("#mo162Selected"),b=document.querySelector("#mo162RunFolder");
 const r=mo161Rules().find(x=>mo161Id(x)===String(mo161Active));
 if(t)t.textContent=r?`Highlighted filter: ${mo161Name(r)}`:"Highlight one filter above to run it on the selected folder.";
 if(b)b.disabled=!r;
}
function mo162Build(){
 const top=document.querySelector("#mo161Top");if(top&&!document.querySelector("#mo162EnableAll")){
   const en=document.createElement("button");en.id="mo162EnableAll";en.textContent="Enable All";en.onclick=()=>mo162SetAll(true);
   const dis=document.createElement("button");dis.id="mo162DisableAll";dis.textContent="Disable All";dis.onclick=()=>mo162SetAll(false);
   top.append(en,dis);
 }
 const frame=document.querySelector("#mo161Frame");if(frame&&!document.querySelector("#mo162QuickRun")){
   const q=document.createElement("div");q.id="mo162QuickRun";
   q.innerHTML='<label for="mo162Folder">Run highlighted filter on folder:</label><select id="mo162Folder"><option>Loading folders…</option></select><button id="mo162RunFolder" disabled>Run Filter</button><span id="mo162Selected"></span>';
   frame.appendChild(q);q.querySelector("#mo162RunFolder").onclick=mo162RunHighlightedFolder;mo162LoadFolders();
 }
 mo162UpdateSelected();
}
function mo162RunHighlightedFolder(){
 const r=mo161Rules().find(x=>mo161Id(x)===String(mo161Active)),sel=document.querySelector("#mo162Folder");
 if(!r){alert("Highlight a filter first.");return}
 if(!sel?.value){alert("Choose a folder first.");return}
 // Bridge to existing Manual Run so its simulation/confirmation/safety path remains authoritative.
 mo155Selected=new Set([mo161Id(r)]);
 document.body.classList.remove("mo155-home");
 mo153ShowOnlyTool(/manual filter run/i,"Run Filter");
 setTimeout(()=>{
   try{mo155SyncManual()}catch{}
   // Select same folder in the existing manual-run selector when values match.
   const candidates=[...document.querySelectorAll("select")].filter(x=>x!==sel);
   const dst=candidates.find(x=>[...x.options].some(o=>o.value===sel.value));
   if(dst){dst.value=sel.value;dst.dispatchEvent(new Event("change",{bubbles:true}))}
 },120);
}
// Wrap .61 renderer: preserve full hover name, compact visual name, and update highlighted-run status.
const mo162BaseRender=mo161Render;
mo161Render=function(){
 mo162BaseRender();
 for(const el of document.querySelectorAll("#mo161Rows .mo161name")){
   const full=el.title||el.textContent;el.title=full;el.textContent=mo162ShortName(full);
 }
 // Rebind row click so selection status updates after the .61 re-render.
 for(const row of document.querySelectorAll("#mo161Rows .mo161row")){
   row.addEventListener("click",()=>setTimeout(mo162UpdateSelected,0));
 }
 mo162UpdateSelected();
};
function mo162Init(){
 const v=document.querySelector("#mo152Version");if(v)v.textContent="v0.1.62";
 mo162Build();mo161Render();
 document.querySelector("#mo153Home")?.addEventListener("click",()=>setTimeout(()=>{mo162Build();mo161Render()},120));
}
window.addEventListener("load",()=>setTimeout(mo162Init,5400));

// 0.1.63 centered manager + independent editor
function mo163CondRow(c={}){
 let d=document.createElement("div");d.className="mo163row mo163cond";d.innerHTML='<select class="f"><option value="from">From</option><option value="to">To</option><option value="cc">CC</option><option value="subject">Subject</option></select><select class="o"><option value="contains">contains</option><option value="notContains">does not contain</option><option value="is">is exactly</option><option value="notIs">is not</option><option value="startsWith">starts with</option><option value="endsWith">ends with</option><option value="regex">regex</option></select><input class="v" type="text"><button class="mo163remove">×</button>';
 d.querySelector(".f").value=c.field||"from";d.querySelector(".o").value=c.operator||"contains";d.querySelector(".v").value=c.value??"";d.querySelector(".mo163remove").onclick=()=>d.remove();return d}
function mo163ActRow(a={}){
 let d=document.createElement("div");d.className="mo163row mo163act";d.innerHTML='<select class="t"><option value="move">Move to folder</option><option value="copy">Copy to folder</option><option value="markRead">Mark read</option><option value="markUnread">Mark unread</option><option value="star">Star</option><option value="unstar">Unstar</option><option value="tag">Add tag</option></select><span></span><input class="v" type="text" placeholder="Folder ID / tag"><button class="mo163remove">×</button>';
 d.querySelector(".t").value=a.type||"move";d.querySelector(".v").value=a.value??a.folderId??a.tag??"";d.querySelector(".mo163remove").onclick=()=>d.remove();return d}
function mo163Open(id){
 let r=mo161Rules().find(x=>mo161Id(x)===String(id));if(!r)return;mo160Editing=id;
 let host=document.querySelector("#mo160EditorHost");host.innerHTML='<div id="mo163Editor"><div class="mo163line"><label>Filter Name</label><input id="mo163Name" type="text"></div><div class="mo163line"><label>Enabled</label><label><input id="mo163Enabled" type="checkbox"> Run this filter</label></div><div class="mo163line"><label>Match</label><select id="mo163Logic"><option value="all">ALL conditions</option><option value="any">ANY condition</option></select></div><div class="mo163box"><h4>Conditions</h4><div id="mo163Conds"></div><button class="mo163add" id="mo163AddCond">+ Add Condition</button></div><div class="mo163box"><h4>Actions</h4><div id="mo163Acts"></div><button class="mo163add" id="mo163AddAct">+ Add Action</button></div></div>';
 host.querySelector("#mo163Name").value=r.name||"";host.querySelector("#mo163Enabled").checked=!!r.enabled;host.querySelector("#mo163Logic").value=(r.logic||r.match||"all").toLowerCase().includes("any")?"any":"all";
 let cs=host.querySelector("#mo163Conds"),as=host.querySelector("#mo163Acts");for(const c of (r.conditions?.length?r.conditions:[{}]))cs.append(mo163CondRow(c));for(const a of (r.actions?.length?r.actions:[{}]))as.append(mo163ActRow(a));
 host.querySelector("#mo163AddCond").onclick=()=>cs.append(mo163CondRow());host.querySelector("#mo163AddAct").onclick=()=>as.append(mo163ActRow());
 document.querySelector("#mo160Title").textContent="Edit Filter: "+mo161Name(r);document.querySelector("#mo160Overlay").classList.add("open")}
async function mo163Save(){
 let host=document.querySelector("#mo160EditorHost"),rules=structuredClone(mo161Rules()),r=rules.find(x=>mo161Id(x)===String(mo160Editing));if(!r)return;
 r.name=host.querySelector("#mo163Name").value.trim()||r.name;r.enabled=host.querySelector("#mo163Enabled").checked;r.logic=host.querySelector("#mo163Logic").value;
 r.conditions=[...host.querySelectorAll(".mo163cond")].map(x=>({field:x.querySelector(".f").value,operator:x.querySelector(".o").value,value:x.querySelector(".v").value}));
 r.actions=[...host.querySelectorAll(".mo163act")].map(x=>({type:x.querySelector(".t").value,value:x.querySelector(".v").value}));
 await mo154PersistRules(rules);document.querySelector("#mo160Overlay").classList.remove("open");host.innerHTML="";mo160Editing=null;mo161Render();mo152RefreshHeader?.()}
function mo163Close(){document.querySelector("#mo160Overlay")?.classList.remove("open");let h=document.querySelector("#mo160EditorHost");if(h)h.innerHTML="";mo160Editing=null}
function mo163Init(){
 let v=document.querySelector("#mo152Version");if(v)v.textContent="v0.1.63";
 mo160Edit=mo163Open;mo160Close=mo163Close;mo160Save=mo163Save;
 let save=document.querySelector("#mo160Save"),cancel=document.querySelector("#mo160Cancel"),x=document.querySelector("#mo160X");if(save)save.onclick=mo163Save;if(cancel)cancel.onclick=mo163Close;if(x)x.onclick=mo163Close}
// .66 owns startup

// ---------- 0.1.64 enabled-state UI + stable import surface ----------
function mo164Rules(){ try{return mo161Rules()}catch(e){return []} }
async function mo164SetAllEnabled(on){
  const rules=structuredClone(mo164Rules());
  if(!rules.length)return;
  if(!confirm((on?"Enable":"Disable")+" all "+rules.length+" filters?\n\n"+
    (on?"They will be eligible to run when incoming processing is ON.":"They will not run until enabled again."))) return;
  for(const r of rules) r.enabled=!!on;
  await mo154PersistRules(rules);
  // Re-render from the just-persisted canonical array so every checkbox changes now.
  try{mo161Render()}catch(e){}
  try{mo152RefreshHeader()}catch(e){}
  setTimeout(()=>{try{mo161Render();mo152RefreshHeader()}catch(e){}},50);
}
function mo164Relabel(){
  // Current clean .61+ list header.
  document.querySelectorAll("#mo161Manager th,#mo161Manager .mo161HeadCell,#mo161Manager [class*='head']").forEach(el=>{
    if((el.textContent||"").trim()==="Run") el.textContent="Enabled/Disabled";
  });
  // fallback exact visible text nodes/buttons from later patches
  document.querySelectorAll("#mo161Manager *").forEach(el=>{
    if(el.children.length===0 && (el.textContent||"").trim()==="Run") el.textContent="Enabled/Disabled";
  });
}
function mo164WireBulk(){
  const mgr=document.querySelector("#mo161Manager"); if(!mgr)return;
  [...mgr.querySelectorAll("button")].forEach(b=>{
    const t=(b.textContent||"").trim();
    if(t==="Enable All"){
      const n=b.cloneNode(true); b.replaceWith(n); n.onclick=()=>mo164SetAllEnabled(true);
    } else if(t==="Disable All"){
      const n=b.cloneNode(true); b.replaceWith(n); n.onclick=()=>mo164SetAllEnabled(false);
    }
  });
}
function mo164StableImport(){
  // Keep the current Import button, but suppress transient legacy status panels while
  // the import workspace is being opened. The import workspace itself remains visible.
  const btn=[...document.querySelectorAll("button")].find(b=>(b.textContent||"").trim()==="Import");
  if(!btn || btn.dataset.mo164)return;
  btn.dataset.mo164="1";
  btn.addEventListener("click",()=>{
    setTimeout(()=>{
      // Re-label obvious legacy success/error banners as inline status rather than
      // allowing old full-width panels to dominate the manager.
      document.querySelectorAll(".success,.error,.warning,[class*='banner']").forEach(el=>{
        if(el.closest("#mo161Manager") && el.id!=="mo152Status") return;
        if(getComputedStyle(el).position==="fixed" && !el.closest("#mo160Overlay")){
          el.style.position="static";
        }
      });
    },0);
  },true);
}
function mo164Init(){
  const v=document.querySelector("#mo152Version"); if(v)v.textContent="v0.1.64";
  mo164Relabel(); mo164WireBulk(); mo164StableImport();
  // Re-apply after manager renders/re-renders.
  const mgr=document.querySelector("#mo161Manager");
  if(mgr){
    new MutationObserver(()=>{mo164Relabel();}).observe(mgr,{childList:true,subtree:true});
  }
}
// .66 owns startup

// ---------- 0.1.65 startup cleanup ----------
function mo165HideLegacy(){
  const textKill=[
    "0.1.37 Stability Mode","Stability Mode","Storage Inspector / Recovery",
    "Refresh Storage Check","Restore Stored Rules to UI"
  ];
  document.querySelectorAll("body *").forEach(el=>{
    if(el.children.length>20)return;
    const t=(el.textContent||"").trim();
    if(textKill.some(x=>t===x || t.startsWith(x))) el.style.display="none";
  });
}
function mo165Version(){
  const v=document.querySelector("#mo152Version"); if(v)v.textContent="v0.1.65";
  // Clean any visible old version literals in title/header only.
  document.querySelectorAll("header,[class*='header'],[id*='header'],h1,h2").forEach(el=>{
    for(const n of el.childNodes) if(n.nodeType===3)
      n.nodeValue=n.nodeValue.replace(/v?0\.1\.(?:37|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63|64)/g,"v0.1.65");
  });
}
function mo165Ready(){
  mo165Version(); mo165HideLegacy();
  try{mo163Init()}catch(e){}
  try{mo164Init()}catch(e){}
  try{mo164Relabel()}catch(e){}
  document.documentElement.classList.remove("mo165Booting");
}
// .66 owns startup
// .66 owns startup

// ---------- 0.1.66 CONSOLIDATED AUTHORITATIVE UI ----------
const MO166_VERSION="v0.1.66";
function mo166SetVersion(){
  const v=document.querySelector("#mo152Version"); if(v)v.textContent=MO166_VERSION;
  document.querySelectorAll("header,[class*='header'],[id*='header'],h1,h2").forEach(el=>{
    [...el.childNodes].filter(n=>n.nodeType===3).forEach(n=>{
      n.nodeValue=n.nodeValue.replace(/v?0\.1\.\d+/g,MO166_VERSION);
    });
  });
}
function mo166HideLegacy(){
  const exact=["0.1.37 Stability Mode","Stability Mode","Storage Inspector / Recovery",
    "Refresh Storage Check","Restore Stored Rules to UI"];
  document.querySelectorAll("body *").forEach(el=>{
    const t=(el.textContent||"").trim();
    if(exact.some(x=>t===x||t.startsWith(x))) el.style.display="none";
  });
}
function mo166NormalizeManager(){
  const mgr=document.querySelector("#mo161Manager"); if(!mgr)return false;
  // Current list is authoritative. Normalize the semantic column title.
  mgr.querySelectorAll("*").forEach(el=>{
    if(el.children.length===0 && (el.textContent||"").trim()==="Run") el.textContent="Enabled/Disabled";
  });
  try{mo164WireBulk()}catch(e){}
  try{mo164Relabel()}catch(e){}
  return true;
}
function mo166OwnEditor(){
  try{
    mo160Edit=mo163Open; mo160Close=mo163Close; mo160Save=mo163Save;
    const save=document.querySelector("#mo160Save"),cancel=document.querySelector("#mo160Cancel"),x=document.querySelector("#mo160X");
    if(save)save.onclick=mo163Save;if(cancel)cancel.onclick=mo163Close;if(x)x.onclick=mo163Close;
  }catch(e){}
}
function mo166Finish(){
  mo166SetVersion(); mo166HideLegacy(); mo166NormalizeManager(); mo166OwnEditor();
  document.documentElement.classList.remove("mo165Booting");
  document.documentElement.classList.remove("mo166Boot");
}
function mo166Start(){
  // Let the original storage/rule loader build once, then take ownership immediately.
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    mo166SetVersion(); mo166HideLegacy();
    if(mo166NormalizeManager() || tries>40){
      clearInterval(timer); mo166Finish();
      const mgr=document.querySelector("#mo161Manager");
      if(mgr)new MutationObserver(()=>{mo166SetVersion();mo166NormalizeManager();}).observe(mgr,{childList:true,subtree:true});
    }
  },25);
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",mo166Start,{once:true});
else mo166Start();
