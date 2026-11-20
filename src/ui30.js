"use strict";
// MO .30 UI-only enhancement. Existing filtering handlers remain unchanged.
(()=>{
const $=s=>document.querySelector(s);
const groups={
 File:[["Save Rules","save"],["Backup Rules","backup"],["Import Thunderbird Filters","import"],["Export Filters JSON","exportRules"],["Preferences","preferences"]],
 Rules:[["Add Rule","add"],["Add Search Condition","addSearchCondition"],["Select All","selectAll"],["Clear Selection","clearSelection"],["Move to Top","moveTop"],["Move to Bottom","moveBottom"],["Enable All","enableAll"],["Disable All","disableAll"]],
 Run:[["Run Filter","run"],["Simulate All Matches","simulate"],["Run Account Inboxes","multiAccountRun"],["Incoming Live On / Off","incomingLive"],["Incoming Test On / Off","incomingTest"]],
 Reports:[["Activity Log","activityLog"],["Filter Activity","filterActivity"],["Unmatched Senders","unmatched"],["Export Sender Addresses","exportSenders"]],
 Tools:[["Diagnostics","diagnostics"],["Live Readiness","liveReadiness"],["Create Thunderbird Folder","createTBFolder"],["Refresh Folders","refreshFolders"],["Advanced","advanced"]],
 Navigation:[["Home / Filters","home"],["Go to Top","goTop"],["Go to Bottom","goBottom"]]
};
const menu=$("#mo30MenuBar");
for(const [name,actions] of Object.entries(groups)){
 const details=document.createElement("details"),summary=document.createElement("summary"),items=document.createElement("div");
 summary.textContent=name+" ▾";items.className="mo30Dropdown";details.append(summary,items);
 for(const [label,id] of actions){
  const button=document.createElement("button");button.type="button";button.textContent=label;
  button.addEventListener("click",()=>{details.open=false;document.getElementById(id)?.click();});
  items.append(button);
 }
 menu.append(details);
 details.addEventListener("toggle",()=>{if(details.open)menu.querySelectorAll("details").forEach(d=>{if(d!==details)d.open=false;});});
}
document.addEventListener("click",e=>{if(!menu.contains(e.target))menu.querySelectorAll("details").forEach(d=>d.open=false);});
const app=$("#app");
try{
 const saved=JSON.parse(localStorage.getItem("mo30Window")||"null");
 if(saved){
  const w=Math.min(window.innerWidth-20,Math.max(680,Number(saved.w)||1050));
  const h=Math.min(window.innerHeight-20,Math.max(440,Number(saved.h)||760));
  app.style.width=w+"px";app.style.height=h+"px";
 }
}catch{}
if(typeof ResizeObserver!=="undefined"){
 let last="";
 new ResizeObserver(()=>{
  const r=app.getBoundingClientRect(),now=Math.round(r.width)+"x"+Math.round(r.height);
  if(now===last)return;last=now;
  try{localStorage.setItem("mo30Window",JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)}));}catch{}
 }).observe(app);
}
const panel=$(".panel"),notice=$("#mo30Notice"),body=$("#mo30NoticeBody"),title=$("#mo30NoticeTitle");
const progress=$("#simProgress"),status=$("#status"),details=$("#simDetails"),detailControls=$("#simDetailControls");
if(panel&&progress&&status){
 // Status and progress are before the scrollable filter list, not below the window.
 const list=$(".list");
 panel.insertBefore(progress,list);
 panel.insertBefore(status,list);
 panel.insertBefore(notice,list);
}
$("#mo30Dismiss")?.addEventListener("click",()=>{notice.classList.remove("show");});
function showNotice(heading,description){
 title.textContent=heading;body.textContent=description;notice.classList.add("show");
}
let running=false,previousStatus="",previousDetails="";
for(const id of ["run","simulate","multiAccountRun"]){
 document.getElementById(id)?.addEventListener("click",()=>{
  running=true;showNotice("Operation started","Progress and results will appear here. The message will remain visible until dismissed.");
 });
}
const observer=new MutationObserver(()=>{
 const text=(status?.textContent||"").trim();
 const diagnostic=(details?.textContent||"").trim();
 const visible=!!status?.classList.contains("show");
 if(visible&&text&&text!==previousStatus){
  previousStatus=text;
  if(running||/complete|finished|failed|error|processed|moved|cancelled/i.test(text)){
   showNotice("Mail Organizer results",text);
   if(/complete|finished|failed|error|cancelled/i.test(text))running=false;
  }
 }
 if(diagnostic&&diagnostic!==previousDetails&&running){
  previousDetails=diagnostic;
  showNotice("Run details available",(status?.textContent||"").trim()+" — Open Diagnostic Report for full details.");
 }
});
observer.observe(panel,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["class","style"]});
// Keep diagnostic controls in a visible, scrollable region after the filter list.
if(detailControls&&details){detailControls.style.flexShrink="0";details.style.flexShrink="0";}
})();