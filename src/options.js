
"use strict";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

let rules = [];
let folders = [];
let selectedId = null;
let selectedIds = new Set();
let selectionAnchorId = null;
let lastSimulationDiagnostic = [];
let diagnosticView = "matches";
let activeSimulationToken = null;
let simulationStartedAt = 0;
let activeProgressMode = "Simulation";
function formatElapsed(ms){const sec=Math.max(0,Math.floor(ms/1000)),m=Math.floor(sec/60),ss=String(sec%60).padStart(2,"0");return `${m}:${ss}`;}
function setSimulationProgress(p={}){
 const box=$("#simProgress"),bar=$("#simProgressBar"),txt=$("#simProgressText"),stats=$("#simProgressStats"); if(!box)return;
 box.classList.add("show"); const done=Number(p.processed||0), total=Number(p.total||0);
 txt.textContent=p.cancelled?"Cancelling…":(p.folder?`${activeProgressMode}: ${p.folder}${p.stage ? " · "+p.stage : ""}`:`${activeProgressMode}${p.stage ? " · "+p.stage : "…"}`);
 stats.textContent=total>0?`${done} / ${total} (${Math.min(100,Math.round(done*100/total))}%) · elapsed ${formatElapsed(Date.now()-simulationStartedAt)}`:`${done} scanned · elapsed ${formatElapsed(Date.now()-simulationStartedAt)}`;
 if(total>0){bar.classList.remove("indeterminate");bar.style.width=`${Math.min(100,done*100/total)}%`;bar.style.transform="";}else{bar.style.width="35%";bar.classList.add("indeterminate");}
}
function finishSimulationProgress(){const box=$("#simProgress"),bar=$("#simProgressBar");if(bar){bar.classList.remove("indeterminate");bar.style.width="100%";bar.style.transform="";}setTimeout(()=>box?.classList.remove("show"),900);activeSimulationToken=null;}
messenger.runtime.onMessage.addListener((msg)=>{if(msg?.type==="simulationProgress" && msg.token===activeSimulationToken)setSimulationProgress(msg);});
function renderSimulationDetails() {
 const detail=$("#simDetails"), controls=$("#simDetailControls"), counts=$("#detailCounts");
 if(!detail||!controls)return;
 const all=Array.isArray(lastSimulationDiagnostic)?lastSimulationDiagnostic:[];
 const matched=all.filter(d=>d.matched), non=all.filter(d=>!d.matched);
 if(counts)counts.textContent=`${matched.length} match detail(s) · ${non.length} non-match sample(s)`;
 const visible=diagnosticView==="matches"?matched:diagnosticView==="nonmatches"?non:all;
 if(!all.length){controls.style.display="none";detail.style.display="none";detail.textContent="";return;}
 controls.style.display="flex"; const lines=[];
 for(const d of visible){lines.push(`${d.matched?"MATCH":"NO MATCH"} — ${d.rule}${d.folder ? " — Folder: "+d.folder : ""} — From: ${d.author||"(blank)"} — Subject: ${d.subject||"(blank)"}`);for(const c of d.conditions||[])lines.push(`   ${c.matched?"✓":"✗"} ${c.field} ${c.operator} "${c.wanted}" — actual: "${c.actual}"${c.error?" — ERROR: "+c.error:""}`);}
 detail.textContent=lines.length?lines.join("\n"):`No ${diagnosticView==="matches"?"matches":diagnosticView==="nonmatches"?"non-match samples":"diagnostic entries"} to display.`;
 detail.style.display="block";
}

let diagnosticReportView = "matches";
function diagnosticEntryText(d) {
 const lines=[`${d.matched?"MATCH":"NO MATCH"} — ${d.rule}${d.folder ? " — Folder: "+d.folder : ""} — From: ${d.author||"(blank)"} — Subject: ${d.subject||"(blank)"}`];
 for(const c of d.conditions||[]) lines.push(`   ${c.matched?"✓":"✗"} ${c.field} ${c.operator} "${c.wanted}" — actual: "${c.actual}"${c.error?" — ERROR: "+c.error:""}`);
 return lines.join("\n");
}
function populateDiagnosticReportSelectors(){
 const all=Array.isArray(lastSimulationDiagnostic)?lastSimulationDiagnostic:[];
 const filters=[...new Set(all.map(d=>d.rule).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
 const fs=[...new Set(all.map(d=>d.folder).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
 const rf=$("#reportFilter"), rfo=$("#reportFolder");
 if(rf){const old=rf.value;rf.innerHTML='<option value="">All filters</option>'+filters.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");if(filters.includes(old))rf.value=old;}
 if(rfo){const old=rfo.value;rfo.innerHTML='<option value="">All folders</option>'+fs.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");if(fs.includes(old))rfo.value=old;}
}
function renderDiagnosticReport(){
 const all=Array.isArray(lastSimulationDiagnostic)?lastSimulationDiagnostic:[];
 const matched=all.filter(d=>d.matched), non=all.filter(d=>!d.matched);
 let visible=diagnosticReportView==="matches"?matched:diagnosticReportView==="nonmatches"?non:all;
 const filter=$("#reportFilter")?.value||"", folder=$("#reportFolder")?.value||"", q=($("#reportSearch")?.value||"").trim().toLowerCase();
 if(filter) visible=visible.filter(d=>d.rule===filter);
 if(folder) visible=visible.filter(d=>d.folder===folder);
 if(q) visible=visible.filter(d=>diagnosticEntryText(d).toLowerCase().includes(q));
 const counts=$("#diagReportCounts"); if(counts) counts.textContent=`${matched.length} match detail(s) · ${non.length} non-match sample(s) · ${visible.length} shown`;
 const text=$("#diagReportText"); if(text) text.textContent=visible.length?visible.map(d=>diagnosticEntryText(d)).join("\n\n"):`No ${diagnosticReportView==="matches"?"matches":diagnosticReportView==="nonmatches"?"non-match samples":"diagnostic entries"} match the current report filters.`;
}
function openDiagnosticReport(){
 if(!lastSimulationDiagnostic.length){show("Run a diagnostic simulation first; there are no saved diagnostic results to open.");return;}
 diagnosticReportView=diagnosticView||"matches"; populateDiagnosticReportSelectors();
 const dlg=$("#diagReport"); if(dlg)dlg.style.display="block"; renderDiagnosticReport();
}
let editingId = null;
let menuRuleId = null;
let prefs = { fontSize: 14, checkboxSide: "right", theme: "blueTeal" };
let startupStoredCount = 0;

function rid(rule, index) {
  return String(rule?.id ?? index);
}

function friendly(name) {
  let x = String(name || "Unnamed")
    .replace(/^TB:\s*/i, "")
    .replace(/^From contains:\s*/i, "");
  if (/^Author from mailing list is in my address book:/i.test(x)) return "Address Book – Author";
  return x;
}


function migrateLegacyMembershipConditions(rule){
 let changed=false;
 for(const c of (rule?.conditions||[])){
   // Old imported builds stored address-book/list membership as special fields.
   // Convert them to the native .87.4+ model: address field + membership operator + selected source.
   if(c.field==="addressBook"||c.field==="notAddressBook"){
     const neg=c.field==="notAddressBook"; c.field="from"; c.operator=neg?"notInAddressBook":"inAddressBook";
     c.addressBookName=c.addressBookName||c.value||""; changed=true;
   } else if(c.field==="mailingList"||c.field==="notMailingList"){
     const neg=c.field==="notMailingList"; c.field="from"; c.operator=neg?"notInMailingList":"inMailingList";
     c.mailingListName=c.mailingListName||c.value||""; changed=true;
   }
   // Some Thunderbird imports identified the old field as mailingList/addressBook but
   // already carried the opposite membership operator. The operator is authoritative.
   if((c.operator==="inAddressBook"||c.operator==="notInAddressBook") && !["from","to","cc","bcc"].includes(c.field)){c.field="from";c.addressBookName=c.addressBookName||c.value||"";changed=true;}
   if((c.operator==="inMailingList"||c.operator==="notInMailingList") && !["from","to","cc","bcc"].includes(c.field)){c.field="from";c.mailingListName=c.mailingListName||c.value||"";changed=true;}
 }
 return changed;
}

function findRule(id) {
  return rules.find((r, i) => rid(r, i) === String(id));
}

function show(message) {
  const el = $("#status");
  el.textContent = message;
  el.classList.add("show");
}

function hideStatus() {
  $("#status").classList.remove("show");
}

function setSelfTest(ok, extra = "") {
  const el = $("#selftest");
  el.className = "status show";
  el.style.background = ok ? "#eaf7ee" : "#fff3cd";
  el.style.border = ok ? "1px solid #5a9d69" : "1px solid #d39e00";
  el.textContent = ok
    ? `UI Wiring ✓ · Stored: ${startupStoredCount} · UI: ${rules.length} · Incoming: OFF${extra ? " · " + extra : ""}`
    : `UI Wiring ERROR${extra ? " · " + extra : ""}`;
}

async function persist() {
  // Never save an unexpectedly empty UI over a non-empty startup rule set.
  if (startupStoredCount > 0 && rules.length === 0) {
    throw new Error(`Safety stop: refusing to overwrite ${startupStoredCount} stored rules with zero UI rules.`);
  }
  await messenger.storage.local.set({
    rules: structuredClone(rules),
    mo30LastRulesSaved: new Date().toISOString()
  });
  const verify = await messenger.storage.local.get("rules");
  const storedNow = Array.isArray(verify.rules) ? verify.rules.length : 0;
  startupStoredCount = storedNow;
  if (storedNow !== rules.length) {
    setSelfTest(false, `Save verification mismatch · Stored: ${storedNow} · UI: ${rules.length}`);
    throw new Error(`Save verification mismatch: stored ${storedNow}, UI ${rules.length}`);
  }
  setSelfTest(true, "Save verified");
}

const THEMES={
  blueTeal:{bg:"#f4f6f8",surface:"#ffffff",text:"#182536",muted:"#667788",header:"linear-gradient(115deg,#263d68,#315b83 48%,#24818a)",accent:"#2680d9",select:"#dbeaff",panel:"#f3f5f7",border:"#aeb8c5"},
  classicBlue:{bg:"#eef3f9",surface:"#ffffff",text:"#17263a",muted:"#5f6f82",header:"linear-gradient(115deg,#173f73,#2467a5)",accent:"#1769aa",select:"#d7eaff",panel:"#edf4fb",border:"#9eb2c8"},
  dark:{bg:"#20242a",surface:"#2b3038",text:"#f2f5f7",muted:"#b8c0c8",header:"linear-gradient(115deg,#111820,#24384b,#17646a)",accent:"#55a9ff",select:"#344f69",panel:"#343a43",border:"#626d79"},
  light:{bg:"#f5f5f3",surface:"#ffffff",text:"#242424",muted:"#6a6a6a",header:"linear-gradient(115deg,#59636e,#7b858e)",accent:"#4b78a6",select:"#e6eef6",panel:"#f4f4f2",border:"#b9b9b5"},
  slate:{bg:"#e9edf1",surface:"#fdfefe",text:"#202b35",muted:"#64717d",header:"linear-gradient(115deg,#303b46,#526577)",accent:"#557a9d",select:"#dce7f0",panel:"#edf1f4",border:"#a6b0ba"},
  green:{bg:"#eef5f0",surface:"#ffffff",text:"#183026",muted:"#60746a",header:"linear-gradient(115deg,#234c3b,#34745a,#438a72)",accent:"#2f8061",select:"#d9eee4",panel:"#edf6f1",border:"#9fb9ac"},
  purple:{bg:"#f3eff8",surface:"#ffffff",text:"#2d2338",muted:"#70647d",header:"linear-gradient(115deg,#49345f,#684b83,#765a91)",accent:"#7650a3",select:"#eadff5",panel:"#f5f0f8",border:"#b6a8c4"},
  highContrast:{bg:"#ffffff",surface:"#ffffff",text:"#000000",muted:"#222222",header:"#000000",accent:"#005fcc",select:"#ffef66",panel:"#ffffff",border:"#000000"}
};
function applyTheme(name){
  const t=THEMES[name]||THEMES.blueTeal;
  const root=document.documentElement;
  root.style.setProperty("--mo-bg",t.bg);
  document.body.style.background=t.bg; document.body.style.color=t.text;
  const app=$("#app"); if(app){app.style.background=t.surface;app.style.color=t.text;app.style.borderColor=t.border;}
  const hdr=document.querySelector("header"); if(hdr) hdr.style.background=t.header;
  document.querySelectorAll(".head,.dhead").forEach(x=>{x.style.background=t.panel;x.style.color=t.text;x.style.borderColor=t.border;});
  document.querySelectorAll(".list,.box,.dialog,#prefsBox").forEach(x=>{x.style.borderColor=t.border;x.style.background=t.surface;x.style.color=t.text;});
  document.querySelectorAll(".rule").forEach(x=>{x.style.color=t.text; if(x.classList.contains("sel")){x.style.background=t.select;x.style.boxShadow=`inset 3px 0 ${t.accent}`;} else x.style.background="";});
  document.querySelectorAll("input,select,button,textarea").forEach(x=>{x.style.color=t.text;x.style.background=t.surface;x.style.borderColor=t.border;});
  const preview=$("#themePreview"); if(preview){preview.style.background=t.panel;preview.style.color=t.text;preview.style.borderColor=t.border;}
}
function applyPrefs() {
  applyTheme(prefs.theme || "blueTeal");
  document.querySelectorAll(".rule .name").forEach(x => x.style.fontSize = prefs.fontSize + "px");

  const left = prefs.checkboxSide === "left";
  document.querySelectorAll(".rule").forEach(row => {
    const name = row.querySelector(".name");
    const enabled = row.querySelector(".enabled");
    if (!name || !enabled) return;
    row.style.gridTemplateColumns = left
      ? "125px minmax(240px,1fr) 44px"
      : "minmax(240px,1fr) 125px 44px";
    if (left && row.firstElementChild !== enabled) row.insertBefore(enabled, name);
    if (!left && row.firstElementChild !== name) row.insertBefore(name, enabled);
  });

  const head = document.querySelector(".head");
  if (head) {
    const cells = [...head.children];
    const name = cells.find(x => x.textContent.trim() === "Name");
    const enabled = cells.find(x => x.textContent.includes("Enabled"));
    head.style.gridTemplateColumns = left
      ? "125px minmax(240px,1fr) 44px"
      : "minmax(240px,1fr) 125px 44px";
    if (name && enabled) {
      if (left && head.firstElementChild !== enabled) head.insertBefore(enabled, name);
      if (!left && head.firstElementChild !== name) head.insertBefore(name, enabled);
    }
  }
}

function render() {
  const q = $("#search").value.trim().toLowerCase();
  const shown = [];
  rules.forEach((r, i) => {
    if (friendly(r.name).toLowerCase().includes(q)) shown.push([r, i]);
  });

  $("#rows").innerHTML = shown.map(([r, i]) => `
    <div class="rule ${selectedIds.has(rid(r,i)) ? "sel" : ""}" data-id="${esc(rid(r,i))}" title="${esc(r.name)}">
      <span class="name">${esc(friendly(r.name))}</span>
      <span class="enabled"><input class="en" type="checkbox" ${r.enabled !== false ? "checked" : ""}></span>
      <button class="menu" title="Filter menu">⋮</button>
    </div>
  `).join("");

  selectedIds = new Set([...selectedIds].filter(id => !!findRule(id)));
  if (selectedId && !findRule(selectedId)) selectedId = selectedIds.values().next().value || null;
  $("#count").textContent = `${shown.length} shown · ${rules.length} total`;
  const selectedCountEl = $("#selectedCount");
  if (selectedCountEl) selectedCountEl.textContent = `${selectedIds.size} highlighted`;
  $("#rulesPill").textContent = `Rules: ${rules.length}`;
  $("#enabledPill").textContent = `Enabled: ${rules.filter(r => r.enabled !== false).length}`;

  for (const row of $("#rows").children) {
    const id = row.dataset.id;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".en") || e.target.closest(".menu")) return;
      const visibleIds = Array.from($("#rows").children).map(x => x.dataset.id);
      if (e.shiftKey && selectionAnchorId && visibleIds.includes(selectionAnchorId)) {
        const a = visibleIds.indexOf(selectionAnchorId), b = visibleIds.indexOf(id);
        const lo = Math.min(a,b), hi = Math.max(a,b);
        for (let n=lo; n<=hi; n++) selectedIds.add(visibleIds[n]);
      } else if (e.ctrlKey || e.metaKey) {
        if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
        selectionAnchorId = id;
      } else {
        selectedIds = new Set([id]);
        selectionAnchorId = id;
      }
      selectedId = selectedIds.has(id) ? id : (selectedIds.values().next().value || null);
      render();
    });

    row.addEventListener("dblclick", (e) => {
      if (e.target.closest(".en") || e.target.closest(".menu")) return;
      selectedIds = new Set([id]);
      selectedId = id;
      selectionAnchorId = id;
      openEdit(id);
    });

    row.querySelector(".en").addEventListener("click", async (e) => {
      e.stopPropagation();
      const r = findRule(id);
      if (!r) return;
      r.enabled = e.target.checked;
      // Disabled means ineligible to run anywhere. Remove it from the run-highlight set.
      if (r.enabled === false) {
        selectedIds.delete(String(id));
        if (selectedId === String(id)) selectedId = selectedIds.values().next().value || null;
        if (selectionAnchorId === String(id)) selectionAnchorId = selectedId;
      }
      await persist();
      render();
    });

    row.querySelector(".menu").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!selectedIds.has(id)) selectedIds = new Set([id]);
      selectedId = id;
      selectionAnchorId = id;
      // IMPORTANT: do not render before measuring the clicked button.
      // Rendering would detach the button and its rect becomes 0,0.
      openMenu(e.currentTarget, id);
      document.querySelectorAll(".rule").forEach(x => x.classList.toggle("sel", selectedIds.has(x.dataset.id)));
    });
  }

  applyPrefs();
}

function openMenu(button, id) {
  menuRuleId = id;
  const menu = $("#contextMenu");
  const rect = button.getBoundingClientRect();
  menu.classList.add("open");

  const pad = 8;
  const mw = menu.offsetWidth || 165;
  const mh = menu.offsetHeight || 245;

  let left = rect.right - mw;
  left = Math.max(pad, Math.min(left, window.innerWidth - mw - pad));

  const below = rect.bottom + 4;
  const above = rect.top - mh - 4;
  let top = (below + mh <= window.innerHeight - pad) ? below : above;
  top = Math.max(pad, Math.min(top, window.innerHeight - mh - pad));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function closeMenu() {
  $("#contextMenu").classList.remove("open");
}


const TB_FIELDS = {
 subject:["Subject","text",true], from:["From","text",true], body:["Body","text",true],
 date:["Date","date",true], priority:["Priority","priority",true], status:["Status","status",true],
 to:["To","text",true], cc:["Cc","text",true], bcc:["Bcc","text",true], toOrCc:["To or Cc","text",true],
 ageDays:["Age In Days","number",true], size:["Size (KB)","number",true],
 tag:["Tags","text",true], junkStatus:["Junk Status","junk",true],
 junkPercent:["Junk Percent","number",true], attachment:["Attachment Status","attachment",true],
 allAddresses:["From, To or Cc","text",true]
};
const TB_OPS={
 text:[["contains","contains"],["notContains","doesn't contain"],["is","is"],["isNot","isn't"],["startsWith","begins with"],["endsWith","ends with"],["regex","regex (Mail Organizer)"]],
 number:[["is","is"],["isNot","isn't"],["greaterThan","is greater than"],["lessThan","is less than"]],
 date:[["is","is"],["before","is before"],["after","is after"]],
 priority:[["is","is"],["isNot","isn't"],["greaterThan","is higher than"],["lessThan","is lower than"]],
 status:[["is","is"],["isNot","isn't"]],junk:[["is","is"],["isNot","isn't"]],
 attachment:[["is","is"],["isNot","isn't"]],
 addressbook:[["inAddressBook","is in Address Book"],["notInAddressBook","is not in Address Book"]],
 mailinglist:[["inMailingList","is in Mailing List"],["notInMailingList","is not in Mailing List"]]
};
const TB_VALUES={priority:["Highest","High","Normal","Low","Lowest"],status:["New","Read","Replied","Forwarded","Starred"],junk:["Junk","Not Junk"],attachment:["Has Attachment","No Attachment"]};
let customHeaders=[];
let tbAddressBooks=[];

function fieldDef(v){if(v.startsWith("hdr:"))return[v.slice(4),"text",true];return TB_FIELDS[v]||[v,"text",false]}
function fieldOptions(){
 let a=Object.entries(TB_FIELDS).map(([v,d])=>`<option value="${v}">${d[0]}${d[2]?"":" ⚠"}</option>`);
 a.push(...customHeaders.map(x=>`<option value="hdr:${esc(x)}">${esc(x)}</option>`));
 a.push('<option value="__customize__">Customize…</option>');return a.join("");
}
function opOptions(f){
 const kind=fieldDef(f)[1];
 let ops=[...(TB_OPS[kind]||TB_OPS.text)];
 if(["from","to","cc","bcc","toOrCc","allAddresses"].includes(f)) ops=ops.concat([
   ["inAddressBook","is in Address Book"],["notInAddressBook","is not in Address Book"],
   ["inMailingList","is in Mailing List"],["notInMailingList","is not in Mailing List"]
 ]);
 return ops.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join("")
}
function valueControl(f,val="",op=""){
 const kind=fieldDef(f)[1],choices=TB_VALUES[kind];
 if(op==="inAddressBook"||op==="notInAddressBook"){
   const x=document.createElement("select");x.className="v addressBookValue";
   const names=tbAddressBooks.map(b=>String(b.name||"")).filter(Boolean);
   x.innerHTML='<option value="">Choose Address Book…</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
   if(val && !names.some(n=>n===String(val))){const o=document.createElement("option");o.value=String(val);o.textContent=String(val)+" (saved)";x.append(o)}
   x.value=val||"";return x
 }
 if(op==="inMailingList"||op==="notInMailingList"){
   const x=document.createElement("select");x.className="v mailingListValue";
   const lists=[];for(const b of tbAddressBooks)for(const l of (b.mailingLists||[]))lists.push({name:l.name,label:`${l.name} — ${b.name}`});
   x.innerHTML='<option value="">Choose Mailing List…</option>'+lists.map(l=>`<option value="${esc(l.name)}">${esc(l.label)}</option>`).join("");
   if(val && !lists.some(l=>l.name===String(val))){const o=document.createElement("option");o.value=String(val);o.textContent=String(val)+" (saved)";x.append(o)}
   x.value=val||"";return x
 }
 if(choices){const x=document.createElement("select");x.className="v";x.innerHTML=choices.map(v=>`<option>${esc(v)}</option>`).join("");x.value=val||choices[0];return x}
 if(kind==="addressbook"){
   const x=document.createElement("select");x.className="v addressBookValue";
   const names=tbAddressBooks.map(b=>String(b.name||"")).filter(Boolean);
   x.innerHTML='<option value="">Choose Address Book…</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
   if(val && !names.some(n=>n===String(val))){const o=document.createElement("option");o.value=String(val);o.textContent=String(val)+" (saved)";x.append(o)}
   x.value=val||"";return x
 }
 if(kind==="mailinglist"){
   const x=document.createElement("select");x.className="v mailingListValue";
   const lists=[];for(const b of tbAddressBooks)for(const l of (b.mailingLists||[]))lists.push({name:l.name,label:`${l.name} — ${b.name}`});
   x.innerHTML='<option value="">Choose Mailing List…</option>'+lists.map(l=>`<option value="${esc(l.name)}">${esc(l.label)}</option>`).join("");
   if(val && !lists.some(l=>l.name===String(val))){const o=document.createElement("option");o.value=String(val);o.textContent=String(val)+" (saved)";x.append(o)}
   x.value=val||"";return x
 }
 const x=document.createElement("input");x.className="v";x.type=kind==="date"?"date":kind==="number"?"number":"text";x.value=val??"";return x
}
async function addCustomHeader(sel){
 const raw=prompt("Custom message header (example: Reply-To or List-Id)","");
 const name=String(raw||"").trim().replace(/:$/,"");
 if(!name||!/^[A-Za-z0-9-]+$/.test(name)){sel.value="subject";return}
 if(!customHeaders.some(x=>x.toLowerCase()===name.toLowerCase()))customHeaders.push(name);
 await messenger.storage.local.set({moCustomHeaders:customHeaders});sel.innerHTML=fieldOptions();sel.value="hdr:"+name;
}
function condRow(c={}){
 const d=document.createElement("div");d.className="tbrow cond";
 d.innerHTML=`<select class="f">${fieldOptions()}</select><select class="o"></select><span class="vh"></span><button class="mini plus" type="button">+</button><button class="mini minus" type="button">−</button><div class="cap"></div>`;
 const f=d.querySelector(".f"),o=d.querySelector(".o"),vh=d.querySelector(".vh"),cap=d.querySelector(".cap");
 f.value=[...f.options].some(x=>x.value===c.field)?c.field:"from";
 const rebuild=(op,val)=>{o.innerHTML=opOptions(f.value);if(op&&[...o.options].some(x=>x.value===op))o.value=op;vh.replaceChildren(valueControl(f.value,val,o.value));cap.innerHTML=fieldDef(f.value)[2]?'<span class="okcap">Engine supported</span>':'<span class="waitcap">Thunderbird option — engine support pending</span>'};
 rebuild(c.operator||"contains",c.value||"");
 o.onchange=()=>vh.replaceChildren(valueControl(f.value,"",o.value));
 f.onchange=async()=>{if(f.value==="__customize__")await addCustomHeader(f);rebuild(null,"");o.onchange=()=>vh.replaceChildren(valueControl(f.value,"",o.value))};
 d.querySelector(".plus").onclick=()=>d.after(condRow({field:f.value,operator:o.value}));
 d.querySelector(".minus").onclick=()=>{if($("#conds").children.length>1)d.remove()};
 return d
}
function actionValueControl(a={}){
 const t=a.type||"move";
 if(t==="move"||t==="copy"){const x=document.createElement("select");x.className="v";x.innerHTML='<option value="">Choose Folder…</option>'+folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");x.value=a.folderId||"";return x}
 if(t==="tag"){const x=document.createElement("input");x.className="v";x.value=a.tagKey||"";return x}
 if(t==="priority"||t==="junk"){const vals=t==="priority"?TB_VALUES.priority:TB_VALUES.junk,x=document.createElement("select");x.className="v";x.innerHTML=vals.map(v=>`<option>${v}</option>`).join("");x.value=a.value||vals[0];return x}
 const x=document.createElement("input");x.className="v";x.disabled=true;x.placeholder="No value required";return x
}
const ACTIONS=[["move","Move Message to",true],["copy","Copy Message to",true],["markRead","Mark As Read",true],["markUnread","Mark As Unread",true],["star","Add Star",true],["unstar","Remove Star",true],["tag","Tag Message",true],["priority","Set Priority",false],["junk","Set Junk Status",true],["archive","Archive Message",true],["stop","Stop Filter Execution",true],["delete","Delete Message",true]];
function actRow(a={}){
 const d=document.createElement("div");d.className="tbrow action act";
 d.innerHTML=`<select class="t">${ACTIONS.map(x=>`<option value="${x[0]}">${x[1]}${x[2]?"":" ⚠"}</option>`).join("")}</select><span class="vh"></span><button class="mini plus" type="button">+</button><button class="mini minus" type="button">−</button><div class="cap"></div>`;
 const t=d.querySelector(".t"),vh=d.querySelector(".vh"),cap=d.querySelector(".cap");t.value=a.type||"move";
 const rebuild=(seed={})=>{vh.replaceChildren(actionValueControl({...seed,type:t.value}));const m=ACTIONS.find(x=>x[0]===t.value);cap.innerHTML=m?.[2]?'<span class="okcap">Engine supported</span>':'<span class="waitcap">Thunderbird option — engine support pending</span>'};
 rebuild(a);t.onchange=()=>rebuild({});d.querySelector(".plus").onclick=()=>d.after(actRow());d.querySelector(".minus").onclick=()=>{if($("#acts").children.length>1)d.remove()};return d
}
function editorMarkup(){return`<div class="line"><label>Filter Name</label><input id="ename"></div><div class="line"><label>Enabled</label><label><input id="een" type="checkbox"> Run this filter</label></div><div class="tbmatch"><b>Match:</b><label><input type="radio" name="mm" value="all" checked> all of the following</label><label><input type="radio" name="mm" value="any"> any of the following</label><label><input type="radio" name="mm" value="matchAll"> all messages</label><label title="Runs only if no earlier filter matched"><input type="radio" name="mm" value="finalCatchAll"> final catch-all</label></div><fieldset class="tbsection"><legend>Conditions</legend><div id="conds"></div></fieldset><fieldset class="tbsection"><legend>Perform these actions</legend><div id="acts"></div></fieldset>`}
function setMode(mode){const x=document.querySelector(`input[name="mm"][value="${mode||"all"}"]`)||document.querySelector('input[name="mm"][value="all"]');x.checked=true;const all=x.value==="matchAll"||x.value==="finalCatchAll";$("#conds").style.opacity=all?".4":"1";$("#conds").style.pointerEvents=all?"none":"auto"}
function wireMode(){document.querySelectorAll('input[name="mm"]').forEach(x=>x.onchange=()=>setMode(x.value))}
function openEdit(id){const r=findRule(id);if(!r)return;editingId=id;$("#dtitle").textContent="Edit Filter: "+friendly(r.name);$("#dbody").innerHTML=editorMarkup();$("#ename").value=r.name||"";$("#een").checked=r.enabled!==false;$("#conds").replaceChildren();$("#acts").replaceChildren();(r.conditions||[]).forEach(c=>$("#conds").append(condRow(c)));if(!$("#conds").children.length)$("#conds").append(condRow());(r.actions||[]).forEach(a=>$("#acts").append(actRow(a)));if(!$("#acts").children.length)$("#acts").append(actRow());setMode(r.finalCatchAll?"finalCatchAll":(r.matchMode||"all"));wireMode();$("#modal").classList.add("open")}
function openNewRule(){editingId="__NEW__";$("#dtitle").textContent="Add Filter";$("#dbody").innerHTML=editorMarkup();$("#ename").value="New Rule";$("#een").checked=false;$("#conds").replaceChildren(condRow());$("#acts").replaceChildren(actRow());setMode("all");wireMode();$("#modal").classList.add("open")}
function collectEditorRule(existing){
 const mode=document.querySelector('input[name="mm"]:checked')?.value||"all";
 const conditions=(mode==="matchAll"||mode==="finalCatchAll")?[]:[...$("#dbody").querySelectorAll(".cond")].map(r=>{const field=r.querySelector(".f").value,operator=r.querySelector(".o").value,value=r.querySelector(".v").value;const c={field,operator,value};if(operator==="inAddressBook"||operator==="notInAddressBook")c.addressBookName=value;if(operator==="inMailingList"||operator==="notInMailingList")c.mailingListName=value;return c});
 const actions=[...$("#dbody").querySelectorAll(".act")].map(r=>{const type=r.querySelector(".t").value,value=r.querySelector(".v")?.value||"";if(type==="move"||type==="copy")return{type,folderId:value};if(type==="tag")return{type,tagKey:value};if(type==="priority"||type==="junk")return{type,value};return{type}});
 return{id:existing?.id||crypto.randomUUID(),name:$("#ename").value.trim()||"New Rule",enabled:$("#een").checked,matchMode:mode,finalCatchAll:mode==="finalCatchAll",conditions,actions}
}
function validateRuleDraft(draft,mode="save"){
 if(!draft.name.trim())return"Enter a filter name.";
 if(draft.matchMode!=="matchAll"&&draft.matchMode!=="finalCatchAll"){if(!draft.conditions.length)return"Add a condition.";for(let i=0;i<draft.conditions.length;i++){const c=draft.conditions[i];if(!String(c.value||"").trim())return`Condition ${i+1} is incomplete.`;if(c.operator==="regex"){try{new RegExp(c.value)}catch(e){return`Invalid regex in condition ${i+1}.`}}}}
 if(!draft.actions.length)return"Add an action.";for(let i=0;i<draft.actions.length;i++){const a=draft.actions[i];if((a.type==="move"||a.type==="copy")&&!a.folderId)return`Action ${i+1} needs a folder.`;if(a.type==="tag"&&!a.tagKey)return`Action ${i+1} needs a tag.`}
 return""
}
function storedRuleValidation(rule,mode="run"){
 const d={name:rule?.name||"Unnamed",matchMode:rule?.finalCatchAll?"finalCatchAll":rule?.matchMode||"all",conditions:rule?.conditions||[],actions:rule?.actions||[]},basic=validateRuleDraft(d,mode);if(basic)return basic;
 if(mode==="simulate"||mode==="run"){const c=d.conditions.find(x=>!fieldDef(x.field)[2]);if(c)return`"${fieldDef(c.field)[0]}" is shown for Thunderbird compatibility but engine support is pending.`;const a=d.actions.find(x=>!(ACTIONS.find(y=>y[0]===x.type)?.[2]));if(a)return`Action "${ACTIONS.find(y=>y[0]===a.type)?.[1]||a.type}" is shown for Thunderbird compatibility but engine support is pending.`}
 return""
}

function resolveSelectedRuleIds() {
  selectedIds = new Set([...selectedIds].filter(id => !!findRule(id)));
  if (!selectedIds.size) {
    document.querySelectorAll("#rows .rule.sel").forEach(row => {
      if (row.dataset.id && findRule(row.dataset.id)) selectedIds.add(String(row.dataset.id));
    });
  }
  if (!selectedIds.size && selectedId && findRule(selectedId)) selectedIds.add(String(selectedId));
  selectedId = selectedIds.values().next().value || null;
  return [...selectedIds];
}

async function runSelected(simulate) {
  const ids = resolveSelectedRuleIds();
  if (!ids.length) return show("Please highlight one or more filters by clicking their rows first.");
  const folderId = $("#folder").value;
  if (!folderId) return show("Choose a Thunderbird folder or account first.");
  const accountMode=String(folderId).startsWith("__ACCOUNT__:");
  if(accountMode && !simulate) {
    show("Safety stop — account-level selection is simulation-only. Choose one specific folder to Run Filter.");
    return;
  }

  const chosen = ids.map(findRule).filter(r => r && r.enabled !== false);
  const skippedDisabled = ids.length - chosen.length;
  if (!chosen.length) return show("None of the highlighted filters are enabled. Check Enabled first, then highlight the filter(s) to run.");
  if (skippedDisabled) {
    selectedIds = new Set(chosen.map(r => String(r.id)));
    selectedId = selectedIds.values().next().value || null;
    render();
  }
  for (const r of chosen) {
    const problem = storedRuleValidation(r, simulate ? "simulate" : "run");
    if (problem) {
      show(`Safety stop — ${r.name}: ${problem}`);
      alert(`${r.name}: ${problem}`);
      return;
    }
  }

  if (!simulate) {
    const names = chosen.map(r=>r.name).join(", ");
    if (!confirm(`Run ${chosen.length} highlighted filter(s) on the selected folder?\n\n${names}\n\nMessages may be moved or changed.`)) return;
  }

  show(simulate
    ? `Diagnostic simulation — testing each message against all ${chosen.length} highlighted filter(s)…`
    : `Running ${chosen.length} highlighted filter(s) in rule order…`);
  activeSimulationToken=crypto.randomUUID();
  simulationStartedAt=Date.now();
  activeProgressMode=simulate ? "Simulation" : "Manual Run";
  setSimulationProgress({processed:0,total:simulate ? (Number($("#scanLimit")?.value||50)||0) : 0,folder:"Preparing…"});
  const result = await messenger.runtime.sendMessage({
    type: simulate ? (accountMode ? "simulateAccount" : "simulateFolder") : "runFolder",
    progressToken: activeSimulationToken,
    folderId: accountMode ? null : folderId,
    accountId: accountMode ? String(folderId).slice("__ACCOUNT__:".length) : null,
    folderName: $("#folder").selectedOptions[0]?.textContent || "",
    ruleIds: chosen.map(r=>r.id),
    maxMessages: simulate ? (Number($("#scanLimit")?.value||50)||null) : null
  });

  finishSimulationProgress();
  const folderLabel = $("#folder").selectedOptions[0]?.textContent || "selected folder";
  const byRule = result?.matches && typeof result.matches === "object"
    ? Object.entries(result.matches).sort((a,b)=>b[1]-a[1]).map(([name,n]) => `${name}: ${n}`).join(" · ")
    : "";
  const catchalls = chosen.filter(r=>r.finalCatchAll||r.matchMode==="finalCatchAll").map(r=>r.name);
  const catchallNote = simulate && catchalls.length ? ` · Final catch-all (intentional): ${catchalls.join(", ")}` : "";
  const totalInFolder = result?.folderCount ?? "?";
  const byFolder = result?.byFolder && typeof result.byFolder==="object"
    ? Object.entries(result.byFolder).filter(([,v])=>v?.matched>0).map(([name,v])=>`${name}: ${v.matched}`).join(" · ")
    : "";
  show(`${simulate ? "Diagnostic simulation" : "Run"} complete — ${folderLabel} · ${chosen.length} filter(s) · ${accountMode ? "account messages found" : "folder total"} ${totalInFolder} · scanned ${result?.count ?? 0} · matched ${result?.matchedMessages ?? 0} · no match ${result?.noMatch ?? 0} · errors ${result?.errors ?? 0}${byRule ? " · Matches by filter: " + byRule : ""}${byFolder ? " · Matches by folder: " + byFolder : ""}${catchallNote}${simulate ? " · DIAGNOSTIC ONLY — 0 messages modified." : ""}.`);
  lastSimulationDiagnostic = simulate && Array.isArray(result?.diagnostic) ? result.diagnostic : [];
  diagnosticView = "matches";
  renderSimulationDetails();
}


let unmatchedSenders=[], unmatchedSelected=new Set();
async function loadUnmatched(){
  const r=await messenger.runtime.sendMessage({type:"getUnmatchedSenders"});
  unmatchedSenders=Array.isArray(r?.senders)?r.senders:[];
  renderUnmatched();
}
function renderUnmatched(){
  const q=String($("#unmatchedSearch")?.value||"").toLowerCase();
  const shown=unmatchedSenders.filter(x=>`${x.name||""} ${x.email||""} ${(x.recentSubjects||[]).join(" ")}`.toLowerCase().includes(q));
  $("#unmatchedCount").textContent=`${unmatchedSenders.length} sender(s) · ${unmatchedSelected.size} selected`;
  $("#unmatchedRows").innerHTML=shown.length?shown.map(x=>`<label style="display:grid;grid-template-columns:28px minmax(220px,1fr) 90px 170px;gap:10px;align-items:start;padding:9px 4px;border-bottom:1px solid #e2e7ec"><input class="umSel" type="checkbox" data-email="${esc(x.email)}" ${unmatchedSelected.has(String(x.email).toLowerCase())?"checked":""}><span><b>${esc(x.name||x.email)}</b><br><span style="color:#526273">${esc(x.email)}</span><br><span style="font-size:12px;color:#667">${esc((x.recentSubjects||[]).slice(0,2).join(" · "))}</span></span><span>${Number(x.count||0)} msg</span><span style="font-size:12px">${esc((x.folders||[]).join(", "))}</span></label>`).join(""):'<div style="padding:30px;text-align:center;color:#667">No unmatched senders captured yet.</div>';
  document.querySelectorAll(".umSel").forEach(cb=>cb.onchange=()=>{const e=String(cb.dataset.email).toLowerCase();cb.checked?unmatchedSelected.add(e):unmatchedSelected.delete(e);renderUnmatched();});
}
async function openUnmatched(){
  $("#unmatchedRule").innerHTML='<option value="">Choose filter...</option>'+rules.map(r=>`<option value="${esc(r.id)}">${esc(friendly(r.name))}${r.enabled===false?" (disabled)":""}</option>`).join("");
  $("#unmatchedModal").style.display="block"; await loadUnmatched();
}

async function exportSenderAddresses(){
  if(!folders.length) await refreshFolders(false);
  const choices=folders.filter(f=>!String(f.id||"").startsWith("__ACCOUNT__:"));
  if(!choices.length) return show("No Thunderbird folders are available.");
  const current=$("#folder")?.value||"";
  const wrap=document.createElement("div");
  wrap.style.cssText="position:fixed;inset:0;background:#0007;z-index:10040;padding:4vh 5vw";
  wrap.innerHTML=`<div style="max-width:900px;margin:auto;background:white;border-radius:10px;overflow:hidden"><div style="padding:14px 16px;background:#edf3f8;border-bottom:1px solid #b8c7d9;display:flex;align-items:center;gap:10px"><b style="font-size:20px">Export Sender Addresses</b><span style="flex:1"></span><button id="esaClose">Close</button></div><div style="padding:18px;display:grid;gap:12px"><label><b>Thunderbird folder</b><br><select id="esaFolder" style="width:100%;margin-top:6px;padding:8px"><option value="">Choose one folder…</option>${choices.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}</select></label><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button id="esaScan">Scan Folder</button><span id="esaStatus">Select a folder, then Scan Folder.</span></div><div id="esaResults" style="display:none"><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input id="esaSearch" placeholder="Search email, name, ExcludedBook status..." style="flex:1"><button id="esaTxt">Save TXT</button><button id="esaCsv">Save CSV</button></div><div id="esaSummary" style="margin-bottom:8px"></div><div style="max-height:52vh;overflow:auto;border:1px solid #ccd6e0"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead style="position:sticky;top:0;background:white"><tr><th>Email</th><th>Name</th><th>Messages</th><th>ExcludedBook</th><th>Last message</th></tr></thead><tbody id="esaRows"></tbody></table></div></div></div></div>`;
  document.body.append(wrap);
  const sel=wrap.querySelector("#esaFolder"); if(current && [...sel.options].some(o=>o.value===current)) sel.value=current;
  let data=[];
  const render=()=>{const q=String(wrap.querySelector("#esaSearch")?.value||"").toLowerCase();const visible=data.filter(x=>`${x.email} ${x.name||""} ${x.inExcludedBook?"excludedbook yes":"excludedbook no"}`.toLowerCase().includes(q));wrap.querySelector("#esaRows").innerHTML=visible.map(x=>`<tr><td>${esc(x.email)}</td><td>${esc(x.name||"")}</td><td>${x.count||0}</td><td>${x.inExcludedBook?"YES":"No"}</td><td>${x.lastDate?esc(new Date(x.lastDate).toLocaleString()):""}</td></tr>`).join("")||'<tr><td colspan="5">No matching sender addresses.</td></tr>';wrap.querySelector("#esaSummary").textContent=`${visible.length} shown · ${data.length} unique sender addresses · ${data.filter(x=>x.inExcludedBook).length} in ExcludedBook`;return visible;};
  wrap.querySelector("#esaClose").onclick=()=>wrap.remove();
  wrap.querySelector("#esaSearch")?.addEventListener("input",render);
  wrap.querySelector("#esaScan").onclick=async()=>{if(!sel.value)return show("Choose a Thunderbird folder first.");wrap.querySelector("#esaStatus").textContent="Scanning messages…";const r=await messenger.runtime.sendMessage({type:"exportFolderSenders",folderId:sel.value});if(!r?.ok){wrap.querySelector("#esaStatus").textContent="Scan failed: "+(r?.error||"unknown error");return;}data=r.senders||[];wrap.querySelector("#esaStatus").textContent=`Scan complete — ${r.messageCount} messages · ${r.uniqueCount} unique senders · ${r.excludedCount} in ExcludedBook.`;wrap.querySelector("#esaResults").style.display="block";render();};
  wrap.querySelector("#esaTxt").onclick=()=>{const v=render();saveTextFile(`MailOrganizer-SenderAddresses-${fileStamp()}.txt`,v.map(x=>x.email).join("\r\n")+"\r\n");};
  wrap.querySelector("#esaCsv").onclick=()=>{const v=render(), cols=["email","name","count","inExcludedBook","lastDate"];const csv=[cols.join(","),...v.map(x=>cols.map(k=>'"'+String(x[k]??"").replaceAll('"','""')+'"').join(","))].join("\r\n");saveTextFile(`MailOrganizer-SenderAddresses-${fileStamp()}.csv`,csv,"text/csv");};
}

function bindStaticControls() {
  $("#search").addEventListener("input", render);
  $("#refreshFolders")?.addEventListener("click",()=>refreshFolders(true));
  $("#unmatched")?.addEventListener("click",openUnmatched);
  $("#exportSenders")?.addEventListener("click",exportSenderAddresses);
  $("#closeUnmatched")?.addEventListener("click",()=>{$("#unmatchedModal").style.display="none";});
  $("#unmatchedSearch")?.addEventListener("input",renderUnmatched);
  $("#unmatchedSelectAll")?.addEventListener("click",()=>{const q=String($("#unmatchedSearch").value||"").toLowerCase();unmatchedSenders.filter(x=>`${x.name||""} ${x.email||""} ${(x.recentSubjects||[]).join(" ")}`.toLowerCase().includes(q)).forEach(x=>unmatchedSelected.add(String(x.email).toLowerCase()));renderUnmatched();});
  $("#unmatchedClear")?.addEventListener("click",()=>{unmatchedSelected.clear();renderUnmatched();});
  async function selectedUnmatched(){return unmatchedSenders.filter(x=>unmatchedSelected.has(String(x.email).toLowerCase()));}
  async function chooseAddressBook(){const books=await messenger.runtime.sendMessage({type:"getAddressBooks"});const writable=(books||[]).filter(b=>!b.readOnly);if(!writable.length){show("No writable Thunderbird address books are available.");return null;}const menu=writable.map((b,i)=>`${i+1}. ${b.name}`).join("\n");const pick=prompt(`Choose Address Book by number:\n\n${menu}`,"1");if(pick===null)return null;const n=Number(pick);return writable[n-1]||null;}
  $("#unmatchedAddressBook")?.addEventListener("click",async()=>{const senders=await selectedUnmatched();if(!senders.length)return show("Select one or more unmatched senders first.");const book=await chooseAddressBook();if(!book)return;const r=await messenger.runtime.sendMessage({type:"addSendersToAddressBook",bookId:book.id,senders});unmatchedSelected.clear();await loadUnmatched();show(`${r.processed} selected · ${r.created} added to ${book.name} · ${r.existing} already present · ${r.failed} failed.`);});
  $("#unmatchedNewBook")?.addEventListener("click",async()=>{const senders=await selectedUnmatched();if(!senders.length)return show("Select one or more unmatched senders first.");const name=prompt("Name for the new Thunderbird Address Book:","");if(!name?.trim())return;const r=await messenger.runtime.sendMessage({type:"createAddressBookWithSenders",name:name.trim(),senders});unmatchedSelected.clear();await loadUnmatched();show(`Created Address Book ${r.bookName} · ${r.created} contact(s) added · ${r.failed} failed.`);});
  $("#unmatchedNewList")?.addEventListener("click",async()=>{const senders=await selectedUnmatched();if(!senders.length)return show("Select one or more unmatched senders first.");const book=await chooseAddressBook();if(!book)return;const name=prompt(`Name for the new Mailing List in ${book.name}:`,"");if(!name?.trim())return;const r=await messenger.runtime.sendMessage({type:"createMailingListWithSenders",bookId:book.id,name:name.trim(),senders});unmatchedSelected.clear();await loadUnmatched();show(`Created Mailing List ${r.listName} · ${r.membersAdded} member(s) added · ${r.failed} failed.`);});
  $("#unmatchedExclude")?.addEventListener("click",async()=>{const senders=unmatchedSenders.filter(x=>unmatchedSelected.has(String(x.email).toLowerCase()));if(!senders.length)return show("Select one or more unmatched senders first.");const r=await messenger.runtime.sendMessage({type:"addToExcludedBook",senders});unmatchedSelected.clear();await loadUnmatched();show(`ExcludedBook updated — ${r.created} new contact(s); ${r.remaining} unmatched remain.`);});
  $("#unmatchedAddRule")?.addEventListener("click",async()=>{const ruleId=$("#unmatchedRule").value;if(!ruleId)return show("Choose the filter to update.");const emails=[...unmatchedSelected];if(!emails.length)return show("Select one or more unmatched senders first.");let r=await messenger.runtime.sendMessage({type:"assignUnmatchedToRule",ruleId,emails});if(r?.needsModeChange){const ok=confirm(`${r.ruleName} is an ALL filter. Adding these senders requires changing it to ANY, which changes the filter's meaning.\n\nChange this filter to ANY and add the sender(s)?`);if(!ok)return show("No changes made — filter remains ALL.");r=await messenger.runtime.sendMessage({type:"assignUnmatchedToRule",ruleId,emails,allowModeChange:true});}if(!r?.ok)return show("Could not update the filter.");
    const selectedRecords=unmatchedSenders.filter(x=>emails.includes(String(x.email||"").toLowerCase()));
    const messageIds=[...new Set(selectedRecords.flatMap(x=>(x.seenKeys||[]).filter(k=>String(k).startsWith("id:")).map(k=>Number(String(k).slice(3))).filter(Number.isFinite)))];
    let mailResult=null;
    if(messageIds.length && confirm(`${r.added} sender(s) were added to ${r.ruleName}.\n\nProcess ${messageIds.length} captured existing message(s) with this filter now?\n\nChoose Cancel to update the filter only.`)){
      mailResult=await messenger.runtime.sendMessage({type:"processCapturedMessagesForRule",ruleId,messageIds});
    }
    unmatchedSelected.clear();const st=await messenger.storage.local.get({rules:[]});rules=structuredClone(st.rules||[]);await loadUnmatched();render();
    show(`${r.requested ?? r.added} selected · ${r.added} added to ${r.ruleName} · ${r.alreadyPresent||0} already present · ${r.remaining} unmatched remain.${mailResult?` Captured mail: ${mailResult.processed} processed · ${mailResult.matched} matched · ${mailResult.failed} failed.`:" Existing mail was not processed."}`);});
  $("#unmatchedRemove")?.addEventListener("click",async()=>{const emails=[...unmatchedSelected];if(!emails.length)return show("Select one or more unmatched senders first.");if(!confirm(`Remove ${emails.length} selected sender(s) from the Unmatched list? This does not delete or move any mail.`))return;const r=await messenger.runtime.sendMessage({type:"removeUnmatchedSenders",emails});unmatchedSelected.clear();await loadUnmatched();show(`Removed ${r.removed} sender(s) from Unmatched; ${r.remaining} remain.`);});
  $("#detailMatches")?.addEventListener("click",()=>{ diagnosticView="matches"; renderSimulationDetails(); });
  $("#detailNonMatches")?.addEventListener("click",()=>{ diagnosticView="nonmatches"; renderSimulationDetails(); });
  $("#detailAll")?.addEventListener("click",()=>{ diagnosticView="all"; renderSimulationDetails(); });
  $("#openDiagReport")?.addEventListener("click",openDiagnosticReport);
  $("#closeDiagReport")?.addEventListener("click",()=>{ $("#diagReport").style.display="none"; });
  $("#reportMatches")?.addEventListener("click",()=>{ diagnosticReportView="matches"; renderDiagnosticReport(); });
  $("#reportNonMatches")?.addEventListener("click",()=>{ diagnosticReportView="nonmatches"; renderDiagnosticReport(); });
  $("#reportAll")?.addEventListener("click",()=>{ diagnosticReportView="all"; renderDiagnosticReport(); });
  $("#reportSearch")?.addEventListener("input",renderDiagnosticReport);
  $("#reportFilter")?.addEventListener("change",renderDiagnosticReport);
  $("#reportFolder")?.addEventListener("change",renderDiagnosticReport);
  $("#copyDiagReport")?.addEventListener("click",async()=>{ try{await navigator.clipboard.writeText($("#diagReportText")?.textContent||"");show("Diagnostic report copied to clipboard.");}catch(e){show("Could not copy diagnostic report: "+(e.message||e));} });
  $("#saveDiagReport")?.addEventListener("click",()=>saveTextFile(`MailOrganizer-Diagnostic-${fileStamp()}.txt`,$("#diagReportText")?.textContent||""));
  $("#saveSimInfo")?.addEventListener("click",()=>{const parts=[$("#status")?.textContent||"",$("#simProgressText")?.textContent||"",$("#simProgressStats")?.textContent||"",$("#simDetails")?.textContent||""].filter(Boolean);saveTextFile(`MailOrganizer-Simulation-${fileStamp()}.txt`,parts.join("\r\n\r\n"));});
  $("#diagReport")?.addEventListener("click",e=>{ if(e.target?.id==="diagReport") e.currentTarget.style.display="none"; });
  $("#selectAll").addEventListener("click", () => {
    // Select All means all ENABLED filters currently shown by the search.
    selectedIds.clear();
    document.querySelectorAll("#rows .rule").forEach(row => {
      const r = findRule(row.dataset.id);
      if (r && r.enabled !== false) selectedIds.add(String(row.dataset.id));
    });
    selectedId = selectedIds.values().next().value || null;
    selectionAnchorId = selectedId;
    render();
  });
  $("#clearSelection").addEventListener("click", () => {
    selectedIds.clear();
    selectedId = null;
    selectionAnchorId = null;
    render();
  });
  $("#goTop")?.addEventListener("click", () => scrollToRuleEdge("top"));
  $("#goBottom")?.addEventListener("click", () => scrollToRuleEdge("bottom"));
  $("#moveTop")?.addEventListener("click", () => moveHighlightedToEdge("top"));
  $("#moveBottom")?.addEventListener("click", () => moveHighlightedToEdge("bottom"));

  $("#home").addEventListener("click", () => {
    editingId = null;
    closeMenu();
    $("#modal").classList.remove("open");
    $("#prefs").classList.remove("open");
    hideStatus();
    render();
  });

  $("#add").addEventListener("click", openNewRule);

  $("#save").addEventListener("click", async () => {
    await persist();
    show("Rules saved.");
  });

  $("#backup").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ version:"0.1.72", rules }, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MailOrganizer-rules-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });

  $("#enableAll").addEventListener("click", async () => {
    if (!confirm(`Enable all ${rules.length} filters?`)) return;
    rules.forEach(r => r.enabled = true);
    await persist();
    render();
  });

  $("#disableAll").addEventListener("click", async () => {
    if (!confirm(`Disable all ${rules.length} filters?`)) return;
    rules.forEach(r => r.enabled = false);
    selectedIds.clear(); selectedId = null; selectionAnchorId = null;
    await persist();
    render();
  });

  $("#simulate").addEventListener("click", () => runSelected(true));
  $("#cancelSimulation")?.addEventListener("click", async()=>{if(!activeSimulationToken)return;setSimulationProgress({processed:0,total:0,folder:"Cancelling…",cancelled:true});await messenger.runtime.sendMessage({type:"cancelSimulation",token:activeSimulationToken});});
  $("#run").addEventListener("click", () => runSelected(false));

  $("#cancel").addEventListener("click", () => {
    editingId = null;
    $("#modal").classList.remove("open");
  });

  $("#saveEdit").addEventListener("click", async () => {
    const existing = editingId === "__NEW__" ? null : findRule(editingId);
    const draft = collectEditorRule(existing);
    const problem = validateRuleDraft(draft, "save");
    if (problem) { show("Cannot save — " + problem); alert(problem); return; }
    if (existing) Object.assign(existing, draft);
    else {
      rules.push(draft);
      selectedId = draft.id;
    }
    await persist();
    editingId = null;
    $("#modal").classList.remove("open");
    render();
    show(existing ? "Filter saved." : "New filter added.");
  });

  $("#preferences").addEventListener("click", () => {
    $("#prefFont").value = String(prefs.fontSize);
    $("#prefSide").value = prefs.checkboxSide;
    $("#prefTheme").value = prefs.theme || "blueTeal";
    applyTheme($("#prefTheme").value);
    $("#prefs").classList.add("open");
  });

  $("#prefCancel").addEventListener("click", () => { $("#prefs").classList.remove("open"); applyTheme(prefs.theme || "blueTeal"); });
  $("#prefTheme")?.addEventListener("change", e => applyTheme(e.target.value));

  $("#prefSave").addEventListener("click", async () => {
    prefs = {
      fontSize: Number($("#prefFont").value),
      checkboxSide: $("#prefSide").value,
      theme: $("#prefTheme").value
    };
    await messenger.storage.local.set({ mo168Prefs: prefs });
    $("#prefs").classList.remove("open");
    applyPrefs();
  });

  // Keep risky legacy pages locked until migrated into the clean controller.
  $("#import").addEventListener("click", () => show("Thunderbird Import is temporarily locked while it is migrated into the clean UI."));
  $("#advanced").addEventListener("click", () => { const m=$("#advancedMenu"); if(m){m.style.display="flex";} });
  $("#advancedClose")?.addEventListener("click", () => { const m=$("#advancedMenu"); if(m)m.style.display="none"; });

  $("#liveReadiness")?.addEventListener("click", async()=>{
    await refreshFolders(false);
    const r=await messenger.runtime.sendMessage({type:"getLiveReadiness"});
    const e=(r.errors||[]), w=(r.warnings||[]);
    const lines=[`LIVE READINESS — ${r.ok?"PASS":"BLOCKED"} · ${r.enabledRules} enabled rule(s) · ${r.folderCount} Thunderbird folder(s) verified · Real Incoming: ${r.realIncoming?"ON":"OFF"} · Incoming Test: ${r.incomingTestMode?"ON":"OFF"}`];
    if(e.length) lines.push("ERRORS: "+e.join(" | "));
    if(w.length) lines.push("WARNINGS: "+w.join(" | "));
    if(!e.length&&!w.length) lines.push("No action/destination problems detected.");
    show(lines.join("\n"));
  });
  $("#incomingLive")?.addEventListener("click", async()=>{
    const st=await messenger.storage.local.get({settings:{enabled:false,incomingTestMode:false},rules:[]});
    const turnOn=!st.settings?.enabled;
    if(turnOn){
      await refreshFolders(false);
      const ready=await messenger.runtime.sendMessage({type:"getLiveReadiness"});
      if(!ready.ok){
        const problems=(ready.errors||[]).join(" | ")||"Readiness check failed.";
        show("LIVE INCOMING BLOCKED — "+problems);
        return;
      }
      const warnings=(ready.warnings||[]);
      const warningText=warnings.length ? `Warnings:\n- ${warnings.join("\n- ")}\n\n` : "";
      const msg=`Enable LIVE Incoming processing?\n\n${ready.enabledRules} enabled filters will process NEW incoming mail in top-to-bottom order. Move/Copy/Tag/Star/Delete actions are REAL. Stop/Move/Delete ends processing for that message.\n\n${warningText}You can stop it immediately with this same button.`;
      if(!confirm(msg)) return;
    } else if(!confirm("STOP live Incoming processing now?")) return;
    const r=await messenger.runtime.sendMessage({type:"setIncomingLiveMode",enabled:turnOn});
    if(!r?.ok){show("LIVE INCOMING BLOCKED — "+((r?.errors||[]).join(" | ")||r?.error||"Unknown readiness error"));return;}
    $("#incomingLive").textContent=`Incoming Live: ${r.enabled?"ON":"OFF"}`;
    $("#incomingTest").textContent="Incoming Test: OFF";
    $("#incomingPill").textContent=r.enabled?"Incoming: LIVE":"Incoming: OFF";
    show(r.enabled?"LIVE Incoming is ON — new mail will now be processed by enabled filters in displayed order.":"LIVE Incoming is OFF — Mail Organizer will not modify newly arriving mail automatically.");
  });

  $("#incomingTest")?.addEventListener("click", async()=>{
    const st=await messenger.storage.local.get({settings:{enabled:false,incomingTestMode:false}});
    const turnOn=!st.settings?.incomingTestMode;
    if(turnOn && !confirm(`Turn on Incoming Test Mode?

Newly received messages will be evaluated in live rule order and logged, but Mail Organizer will NOT move, copy, delete, tag, star, or otherwise modify them.

Real Incoming remains OFF.`)) return;
    const r=await messenger.runtime.sendMessage({type:"setIncomingTestMode",enabled:turnOn});
    $("#incomingTest").textContent=`Incoming Test: ${r.enabled?"ON":"OFF"}`;
    $("#incomingPill").textContent=r.enabled?"Incoming: TEST":"Incoming: OFF";
    show(r.enabled?"Incoming Test Mode ON — watching NEW mail only. No messages will be modified. Real Incoming remains OFF.":"Incoming Test Mode OFF — no incoming mail is being evaluated by Mail Organizer.");
  });

  $("#filterActivity")?.addEventListener("click", async()=>{
    const r=await messenger.runtime.sendMessage({type:"getFilterActivity"});
    const stats=r?.filterStats||{}, ex=r?.excludedAddressStats||{}, ruleList=r?.rules||rules;
    const today=new Date().toISOString().slice(0,10);
    const byId=new Map(ruleList.map(x=>[String(x.id),x]));
    const rows=Object.values(stats).sort((a,b)=>String(b.lastMatched||"").localeCompare(String(a.lastMatched||"")));
    const fmt=x=>x?new Date(x).toLocaleString():"—";
    let old=document.getElementById("filterActivityModal"); if(old)old.remove();
    const wrap=document.createElement("div");wrap.id="filterActivityModal";wrap.style.cssText="position:fixed;inset:0;background:#0006;z-index:5000;padding:4vh 4vw;box-sizing:border-box";
    const filterRows=rows.length?rows.map(x=>{const rr=byId.get(String(x.ruleId));const q=[x.ruleName,rr?.enabled===false?"Disabled":"Enabled",fmt(x.lastMatched),x.lastFolder].join(" ").toLowerCase();return `<tr class="activityData" data-search="${esc(q)}"><td>${esc(x.ruleName)}</td><td>${rr?.enabled===false?"Disabled":"Enabled"}</td><td style="text-align:right">${Number(x.dailyCounts?.[today]||0)}</td><td style="text-align:right">${Number(x.totalMatches||0)}</td><td>${esc(fmt(x.lastMatched))}</td><td>${esc(x.lastFolder||"")}</td></tr>`}).join(""):'<tr><td colspan="6">No filter matches have been recorded yet. Statistics begin with version 0.1.87.10.</td></tr>';
    const exRows=Object.values(ex).sort((a,b)=>Number(b.totalMatches||0)-Number(a.totalMatches||0)).map(x=>`<tr class="activityData" data-search="${esc([x.email,fmt(x.lastMatched)].join(" ").toLowerCase())}"><td>${esc(x.email)}</td><td style="text-align:right">${Number(x.dailyCounts?.[today]||0)}</td><td style="text-align:right">${Number(x.totalMatches||0)}</td><td>${esc(fmt(x.lastMatched))}</td></tr>`).join("");
    wrap.innerHTML=`<div style="height:92vh;background:white;border-radius:9px;display:flex;flex-direction:column;overflow:hidden"><div style="padding:13px 16px;background:#edf3f8;border-bottom:1px solid #b8c7d9;display:flex;gap:10px;align-items:center"><b style="font-size:20px">Filter Activity Report</b><span style="color:#526273">Matches recorded by real Manual Run and Incoming Live</span><span style="flex:1"></span><button id="activitySave">Save to File</button><button id="activityReset">Reset Statistics</button><button id="activityClose">Close</button></div><div style="padding:9px 16px;border-bottom:1px solid #d4dde7;display:flex;gap:8px"><input id="activitySearch" placeholder="Search filter, sender, folder, date/time..." style="flex:1"><span id="activityCount"></span></div><div style="padding:14px 16px;overflow:auto"><h3 style="margin-top:0">By Filter</h3><table style="width:100%;border-collapse:collapse"><thead><tr><th>Filter</th><th>State</th><th>Today</th><th>Total</th><th>Last matched</th><th>Last folder</th></tr></thead><tbody>${filterRows}</tbody></table><h3>ExcludedBook — by sender</h3><table style="width:100%;border-collapse:collapse"><thead><tr><th>Email address</th><th>Today</th><th>Total</th><th>Last matched</th></tr></thead><tbody>${exRows||'<tr><td colspan="4">No ExcludedBook matches recorded yet.</td></tr>'}</tbody></table></div></div>`;
    document.body.appendChild(wrap);wrap.querySelectorAll("th,td").forEach(c=>{c.style.borderBottom="1px solid #dbe2e8";c.style.padding="7px 8px";c.style.textAlign=c.style.textAlign||"left";});
    const activityApply=()=>{const q=wrap.querySelector("#activitySearch").value.trim().toLowerCase();let shown=0;wrap.querySelectorAll("tr.activityData").forEach(tr=>{const ok=!q||(tr.dataset.search||"").includes(q);tr.style.display=ok?"":"none";if(ok)shown++;});wrap.querySelector("#activityCount").textContent=`${shown} row(s) shown`;};
    wrap.querySelector("#activitySearch").oninput=activityApply;activityApply();
    wrap.querySelector("#activitySave").onclick=()=>{const visible=[...wrap.querySelectorAll("tr.activityData")].filter(tr=>tr.style.display!=="none");const lines=["Mail Organizer Filter Activity",`Saved: ${new Date().toLocaleString()}`,"",...visible.map(tr=>[...tr.children].map(td=>td.textContent.trim()).join("\t"))];saveTextFile(`MailOrganizer-FilterActivity-${fileStamp()}.txt`,lines.join("\r\n"));};
    wrap.querySelector("#activityClose").onclick=()=>wrap.remove();wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
    wrap.querySelector("#activityReset").onclick=async()=>{if(!confirm("Reset ALL Mail Organizer filter activity statistics? This does not change filters or messages."))return;await messenger.runtime.sendMessage({type:"resetFilterActivity"});wrap.remove();show("Filter activity statistics reset.");};
  });

  $("#activityLog")?.addEventListener("click", async()=>{
    const r=await messenger.runtime.sendMessage({type:"getActivityLog"});
    const entries=(r?.log||[]);
    let old=document.getElementById("activityLogModal"); if(old)old.remove();
    const wrap=document.createElement("div"); wrap.id="activityLogModal"; wrap.style.cssText="position:fixed;inset:0;background:#0006;z-index:5100;padding:3vh 3vw;box-sizing:border-box";
    const fmt=x=>x?new Date(x).toLocaleString():"—";
    const row=e=>`<tr data-status="${esc(e.status||"")}" data-search="${esc([e.mode,e.rule,e.action,e.destination,e.author,e.subject,e.detail,e.status].join(" ").toLowerCase())}"><td>${esc(fmt(e.time))}</td><td>${esc(e.mode||"")}</td><td>${esc(e.rule||"")}</td><td>${esc(e.action||"")}</td><td>${esc(e.destination||"")}</td><td>${esc(e.author||"")}</td><td>${esc(e.subject||"")}</td><td><b>${esc(e.status||"")}</b></td><td>${esc(e.detail||"")}</td></tr>`;
    wrap.innerHTML=`<div style="height:94vh;background:white;border-radius:9px;display:flex;flex-direction:column;overflow:hidden"><div style="padding:12px 15px;background:#edf3f8;border-bottom:1px solid #b8c7d9;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-size:20px">Activity Log</b><span style="color:#526273">Actual operations and results</span><span style="flex:1"></span><button id="logExport">Save to File</button><button id="logClear">Clear Log</button><button id="logClose">Close</button></div><div style="padding:9px 15px;display:flex;gap:8px;border-bottom:1px solid #d4dde7"><select id="logStatus"><option value="">All results</option><option value="SUCCESS">Success</option><option value="FAILED">Failed</option></select><input id="logSearch" placeholder="Search filter, sender, subject, action, destination, error..." style="flex:1;min-width:320px"><span id="logCount"></span></div><div style="padding:0 15px 15px;overflow:auto;flex:1"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead style="position:sticky;top:0;background:white"><tr><th>Date/time</th><th>Mode</th><th>Filter</th><th>Action</th><th>Destination/Tag</th><th>Sender</th><th>Subject</th><th>Result</th><th>Detail</th></tr></thead><tbody id="logRows">${entries.map(row).join("")||'<tr><td colspan="9">No log entries yet.</td></tr>'}</tbody></table></div></div>`;
    document.body.appendChild(wrap); wrap.querySelectorAll("th,td").forEach(c=>{c.style.borderBottom="1px solid #dbe2e8";c.style.padding="6px 7px";c.style.textAlign="left";c.style.verticalAlign="top";});
    const apply=()=>{const st=wrap.querySelector("#logStatus").value,q=wrap.querySelector("#logSearch").value.trim().toLowerCase();let shown=0;wrap.querySelectorAll("#logRows tr[data-status]").forEach(tr=>{const ok=(!st||tr.dataset.status===st)&&(!q||(tr.dataset.search||"").includes(q));tr.style.display=ok?"":"none";if(ok)shown++;});wrap.querySelector("#logCount").textContent=`${shown} shown · ${entries.length} stored`;};
    wrap.querySelector("#logStatus").onchange=apply; wrap.querySelector("#logSearch").oninput=apply; apply();
    wrap.querySelector("#logClose").onclick=()=>wrap.remove(); wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
    wrap.querySelector("#logClear").onclick=async()=>{if(!confirm("Clear the Mail Organizer Activity Log? Filter statistics are not affected."))return;await messenger.runtime.sendMessage({type:"clearActivityLog"});wrap.remove();show("Activity Log cleared.");};
    wrap.querySelector("#logExport").onclick=()=>{const cols=["time","mode","rule","action","destination","author","subject","status","detail"];const visible=[...wrap.querySelectorAll("#logRows tr[data-status]")].filter(tr=>tr.style.display!=="none");const visibleSet=new Set(visible.map(tr=>tr.dataset.search+"|"+tr.dataset.status));const filtered=entries.filter(e=>{const key=[e.mode,e.rule,e.action,e.destination,e.author,e.subject,e.detail,e.status].join(" ").toLowerCase()+"|"+(e.status||"");return visibleSet.has(key);});const csv=[cols.join(","),...filtered.map(e=>cols.map(k=>'"'+String(e[k]??"").replaceAll('"','""')+'"').join(","))].join("\r\n");saveTextFile(`MailOrganizer-ActivityLog-${fileStamp()}.csv`,csv,"text/csv");};
  });

  $("#diagnostics").addEventListener("click", async () => {
    const st = await messenger.storage.local.get({rules:[], settings:{enabled:false}});
    const stored = Array.isArray(st.rules) ? st.rules : [];
    const uq=(await messenger.storage.local.get({moUnmatchedSenders:[]})).moUnmatchedSenders||[];
    show(`STATE DIAGNOSTICS — Stored: ${stored.length} · UI: ${rules.length} · Enabled stored: ${stored.filter(r => r.enabled !== false).length} · Enabled UI: ${rules.filter(r => r.enabled !== false).length} · Unmatched queue: ${uq.length} · Incoming: ${st.settings?.enabled ? "ON" : "OFF"}.`);
  });

  document.addEventListener("click", e => {
    if (!e.target.closest("#contextMenu") && !e.target.closest(".menu")) closeMenu();
  });

  $("#contextMenu").addEventListener("click", async e => {
    const cmd = e.target.dataset.cmd;
    if (!cmd) return;
    closeMenu();

    const r = findRule(menuRuleId);
    if (!r) return show("Menu error: filter not found.");
    const i = rules.indexOf(r);

    if (r.systemRole === "excluded" && ["up","down","top","bottom","duplicate","delete"].includes(cmd)) return show("Excluded Senders is a protected system filter and stays first.");
    if (cmd === "edit") return openEdit(menuRuleId);

    if (cmd === "run") {
      selectedId = menuRuleId;
      render();
      return show(`Highlighted "${friendly(r.name)}". Choose a folder, then Simulate or Run Filter.`);
    }

    if (cmd === "up") {
      if (i <= 0) return show("This filter is already first.");
      [rules[i-1], rules[i]] = [rules[i], rules[i-1]];
    } else if (cmd === "down") {
      if (i >= rules.length - 1) return show("This filter is already last.");
      [rules[i+1], rules[i]] = [rules[i], rules[i+1]];
    } else if (cmd === "top") {
      const firstMovable = rules.findIndex(x => x.systemRole !== "excluded");
      if (i <= firstMovable) return show("This filter is already at the top.");
      rules.splice(i, 1);
      rules.splice(Math.max(0, firstMovable), 0, r);
    } else if (cmd === "bottom") {
      if (i >= rules.length - 1) return show("This filter is already at the bottom.");
      rules.splice(i, 1);
      rules.push(r);
    } else if (cmd === "duplicate") {
      const copy = structuredClone(r);
      copy.id = crypto.randomUUID();
      copy.name = (r.name || "Rule") + " Copy";
      copy.enabled = false;
      rules.splice(i + 1, 0, copy);
      selectedId = copy.id;
    } else if (cmd === "toggle") {
      r.enabled = !(r.enabled !== false);
    } else if (cmd === "delete") {
      if (!confirm(`Delete filter "${r.name || "Unnamed"}"?`)) return;
      rules.splice(i, 1);
      selectedId = null;
    } else {
      return;
    }

    await persist();
    render();
  });
}


function scrollToRuleEdge(which) {
  const rows = [...document.querySelectorAll("#rows .rule")];
  if (!rows.length) return show("No filters are currently shown.");
  const row = which === "bottom" ? rows[rows.length - 1] : rows[0];
  row.scrollIntoView({behavior:"smooth", block: which === "bottom" ? "end" : "start"});
}

async function moveHighlightedToEdge(which) {
  const ids = resolveSelectedRuleIds();
  if (!ids.length) return show("Highlight one or more filters first.");
  const wanted = new Set(ids.map(String));
  const moving = rules.filter(r => wanted.has(String(r.id)));
  if (!moving.length) return show("No highlighted filters found.");

  // Excluded Senders is protected and remains the first system filter.
  const protectedFirst = rules.filter(r => r.systemRole === "excluded");
  const movable = moving.filter(r => r.systemRole !== "excluded");
  if (!movable.length) return show("Excluded Senders is protected and stays first.");
  const movableIds = new Set(movable.map(r => String(r.id)));
  const rest = rules.filter(r => !movableIds.has(String(r.id)) && r.systemRole !== "excluded");
  rules = which === "bottom"
    ? [...protectedFirst, ...rest, ...movable]
    : [...protectedFirst, ...movable, ...rest];
  await persist();
  render();
  const targetId = String(which === "bottom" ? movable[movable.length-1].id : movable[0].id);
  requestAnimationFrame(() => document.querySelector(`#rows .rule[data-id="${CSS.escape(targetId)}"]`)?.scrollIntoView({behavior:"smooth", block:"center"}));
  show(`Moved ${movable.length} highlighted filter(s) to the ${which}.`);
}

function wiringCheck() {
  const required = [
    ["Home", "#home"], ["Add Rule", "#add"], ["Save", "#save"], ["Backup", "#backup"],
    ["Preferences", "#preferences"], ["Simulate", "#simulate"], ["Run", "#run"],
    ["Menu", "#contextMenu"], ["Editor", "#modal"]
  ];
  const missing = required.filter(([,sel]) => !$(sel)).map(([name]) => name);
  setSelfTest(missing.length === 0, missing.length ? `Missing: ${missing.join(", ")}` : "Controls bound");
}

async function refreshFolders(showStatus=true){
  const mainFolder=document.querySelector("#folder");
  const keepMain=mainFolder?.value||"";
  try{
    const result=await messenger.runtime.sendMessage({type:"getFolders"});
    folders=Array.isArray(result?.folders)?result.folders:[];
    if(mainFolder){
      mainFolder.innerHTML='<option value="">Choose one folder...</option>'+folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
      if([...mainFolder.options].some(o=>o.value===keepMain)) mainFolder.value=keepMain;
    }
    // Refresh any Move/Copy destination selectors in an open editor without losing their current choice.
    document.querySelectorAll("#acts .act").forEach(row=>{
      const type=row.querySelector(".t")?.value;
      const sel=row.querySelector("select.v");
      if(!sel || (type!=="move" && type!=="copy")) return;
      const keep=sel.value;
      sel.innerHTML='<option value="">Choose Folder…</option>'+folders.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
      if([...sel.options].some(o=>o.value===keep)) sel.value=keep;
      else if(keep){const o=document.createElement("option");o.value=keep;o.textContent="Saved destination (not currently found)";sel.append(o);sel.value=keep;}
    });
    if(showStatus) show(`Folders refreshed — ${folders.length} Thunderbird folder/account choices loaded.`);
    return folders;
  }catch(e){
    if(showStatus) show("Folder refresh error: "+(e.message||e));
    return [];
  }
}

async function startup() {
  bindStaticControls();

  // Always display the installed extension version from manifest.json.
  // This prevents the UI label from drifting out of sync with the package version.
  const manifest = messenger.runtime.getManifest();
  const version = manifest?.version || "?";
  const versionLabel = $("#versionLabel");
  if (versionLabel) versionLabel.textContent = `v${version}`;
  document.title = `Mail Organizer ${version}`;

  const st = await messenger.storage.local.get({
    rules: [],
    settings: {enabled:false,incomingTestMode:false},
    mo168Prefs: {fontSize:14, checkboxSide:"right", theme:"blueTeal"},
    moUnmatchedSenders: []
  });

  rules = Array.isArray(st.rules) ? structuredClone(st.rules) : [];
  let membershipMigrated=0;
  for(const r of rules) if(migrateLegacyMembershipConditions(r)) membershipMigrated++;
  if(membershipMigrated) await messenger.storage.local.set({rules:structuredClone(rules),mo875MembershipMigration:{date:new Date().toISOString(),rules:membershipMigrated}});
  let ex=rules.find(r=>r?.systemRole==="excluded");
  if(!ex){ex={id:"mo-system-excluded",name:"Excluded Senders",enabled:true,systemRole:"excluded",order:-100000,matchMode:"all",conditions:[{field:"from",operator:"inAddressBook",value:"ExcludedBook",addressBookName:"ExcludedBook"}],actions:[{type:"stop"}]};rules.unshift(ex);await messenger.storage.local.set({rules:structuredClone(rules)});}
  else {rules=rules.filter(r=>r!==ex);rules.unshift(ex);}
  startupStoredCount = rules.length;
  prefs = {...prefs, ...(st.mo168Prefs || {})};
  customHeaders = Array.isArray(st.moCustomHeaders) ? st.moCustomHeaders : [];

  const incomingLiveOn=!!st.settings?.enabled;
  const incomingTestOn=!!st.settings?.incomingTestMode && !incomingLiveOn;
  $("#incomingPill").textContent = incomingLiveOn ? "Incoming: LIVE" : (incomingTestOn ? "Incoming: TEST" : "Incoming: OFF");
  if($("#incomingTest")) $("#incomingTest").textContent=`Incoming Test: ${incomingTestOn?"ON":"OFF"}`;
  if($("#incomingLive")) $("#incomingLive").textContent=`Incoming Live: ${incomingLiveOn?"ON":"OFF"}`;

  try {
    tbAddressBooks = await messenger.runtime.sendMessage({type:"getAddressBooks"});
    if(!Array.isArray(tbAddressBooks)) tbAddressBooks=[];
  } catch(e) {
    tbAddressBooks=[];
    console.warn("Address book loading error",e);
  }

  await refreshFolders(false);

  render();
  wiringCheck();
  show(incomingLiveOn ? `LIVE Incoming ON — enabled filters will process new mail in displayed order.` : `Incoming OFF${incomingTestOn ? "; Incoming Test Mode ON (no modifications)" : ""}. Use Live Readiness before enabling live processing.`);
}

startup().catch(e => {
  console.error(e);
  setSelfTest(false, e.message || String(e));
  show("Startup error: " + (e.message || e));
});
function fileStamp(){return new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);}
function saveTextFile(name,text,type="text/plain"){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

