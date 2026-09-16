// Harrison Titans dashboard analytics/UI.
// Data is loaded first by supabase-loader.js and exposed as window.RAW.
const RAW = window.RAW;
if (!RAW || !Array.isArray(RAW.history)) {
  throw new Error("Dashboard data was not loaded correctly.");
}

const ALIAS = {"Sunaiz":"Shunaiz","Manali":"Manalee"};
const norm = n => ALIAS[n] || n;
const fmt = n => (Number.isFinite(n) ? (Math.round(n*10)/10).toLocaleString() : "—");
const pct = n => Number.isFinite(n) ? `${(n*100).toFixed(1)}%` : "—";
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

const players = [...new Set([...(RAW.players||[]).map(norm), ...Object.keys(RAW.stats||{}).map(norm)])].sort();
const matches = (RAW.history||[]).map((m,i)=>({...m,_id:i,_date:new Date(m.date)})).sort((a,b)=>a._date-b._date);

function inningsSides(m){
  return m.batFirst==="A"
    ? [{bat:"A",field:"B",inn:m.innings1},{bat:"B",field:"A",inn:m.innings2}]
    : [{bat:"B",field:"A",inn:m.innings1},{bat:"A",field:"B",inn:m.innings2}];
}
function playerSide(m,p){
  p=norm(p);
  const inA=(m.teamA||[]).map(norm).includes(p), inB=(m.teamB||[]).map(norm).includes(p);
  if(inA && !inB) return "A"; if(inB && !inA) return "B";
  if(inA && inB) return "F";
  return null;
}
function winningSide(m){
  if(!m.winner || /tie/i.test(m.winner)) return null;
  if(m.winner===`${m.capA}'s Team`) return "A";
  if(m.winner===`${m.capB}'s Team`) return "B";
  return null;
}
function allDeliveries(matchSubset=matches){
  const out=[];
  matchSubset.forEach(m=>{
    inningsSides(m).forEach((x,idx)=>{
      const logs=x.inn?.ballLog||[];
      logs.forEach((b,j)=>out.push({
        ...b,matchId:m._id,date:m._date,innings:idx+1,batSide:x.bat,fieldSide:x.field,
        striker:norm(b.striker),nonStriker:norm(b.nonStriker),bowler:norm(b.bowler),
        desc:b.desc||"",seq:j
      }));
    });
  });
  return out;
}
const deliveries=allDeliveries();

function matchPlayerStat(m,p){
  p=norm(p); let runs=0,balls=0,fours=0,sixes=0,wickets=0,runsGiven=0,ballsBowled=0,catches=0;
  inningsSides(m).forEach(x=>{
    const inn=x.inn||{};
    (inn.batsmen||[]).forEach(b=>{if(norm(b.name)===p){runs+=+b.runs||0;balls+=+b.balls||0;fours+=+b.fours||0;sixes+=+b.sixes||0;}});
    (inn.bowlers||[]).forEach(b=>{if(norm(b.name)===p){wickets+=+b.wickets||0;runsGiven+=+b.runs||0;ballsBowled+=+b.balls||0;}});
    (inn.fielding||[]).forEach(f=>{if(norm(f.name)===p && f.type==="catch") catches++;});
  });
  const side=playerSide(m,p), ws=winningSide(m);
  const appeared=(m.teamA||[]).map(norm).includes(p)||(m.teamB||[]).map(norm).includes(p)||runs+balls+wickets+ballsBowled+catches>0;
  let result=side==="F"?"floater":(!ws?"tie":side===ws?"win":side?"loss":"");
  return {player:p,matchId:m._id,date:m._date,runs,balls,fours,sixes,wickets,runsGiven,ballsBowled,catches,side,result,appeared};
}
const playerMatches={};
players.forEach(p=>playerMatches[p]=matches.map(m=>matchPlayerStat(m,p)).filter(x=>x.appeared));

function aggregateFor(matchSubset){
  const ids=new Set(matchSubset.map(m=>m._id));
  const out={};
  players.forEach(p=>{
    const arr=(playerMatches[p]||[]).filter(x=>ids.has(x.matchId));
    const a={player:p,matches:arr.length,runs:0,balls:0,fours:0,sixes:0,wickets:0,runsGiven:0,ballsBowled:0,catches:0,wins:0,losses:0,ties:0,floaters:0,motm:0};
    arr.forEach(x=>{["runs","balls","fours","sixes","wickets","runsGiven","ballsBowled","catches"].forEach(k=>a[k]+=x[k]); if(x.result==="win")a.wins++;else if(x.result==="loss")a.losses++;else if(x.result==="tie")a.ties++;else if(x.result==="floater")a.floaters++;});
    matchSubset.forEach(m=>{if(norm(m.starPerformer?.name)===p)a.motm++;});
    a.sr=a.balls?100*a.runs/a.balls:0;
    a.avg=arr.filter(x=>x.runs||x.balls).length?a.runs/arr.filter(x=>x.runs||x.balls).length:0;
    a.econ=a.ballsBowled?6*a.runsGiven/a.ballsBowled:0;
    a.bowlSR=a.wickets?a.ballsBowled/a.wickets:0;
    a.winPct=(a.wins+a.losses+a.ties)?a.wins/(a.wins+a.losses+a.ties):0;
    out[p]=a;
  });
  return out;
}
const career=aggregateFor(matches);

function recentAggregate(n=5){
  const last=matches.slice(-n); return aggregateFor(last);
}
const recent5=recentAggregate(5);

function percentileScore(values,v,invert=false){
  const valid=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!valid.length)return 0;
  let less=valid.filter(x=>x<v).length, equal=valid.filter(x=>x===v).length;
  let s=(less+0.5*equal)/valid.length*100;
  return invert?100-s:s;
}
function playerScores(p){
  const c=career[p], r=recent5[p];
  const cs=Object.values(career).filter(x=>x.matches>0);
  const batVolume=percentileScore(cs.map(x=>x.runs/Math.max(1,x.matches)),c.runs/Math.max(1,c.matches));
  const batRate=percentileScore(cs.map(x=>x.sr),c.sr);
  const batting=.58*batVolume+.42*batRate;
  const wicketRate=percentileScore(cs.map(x=>x.wickets/Math.max(1,x.matches)),c.wickets/Math.max(1,c.matches));
  const econ=percentileScore(cs.filter(x=>x.ballsBowled).map(x=>x.econ),c.econ,true);
  const bowling=c.ballsBowled?(.68*wicketRate+.32*econ):0;
  const fielding=percentileScore(cs.map(x=>x.catches/Math.max(1,x.matches)),c.catches/Math.max(1,c.matches));
  const win=percentileScore(cs.map(x=>x.winPct),c.winPct);
  const recentRuns=percentileScore(cs.map(x=>(recent5[x.player]?.runs||0)/Math.max(1,recent5[x.player]?.matches||1)),(r.runs||0)/Math.max(1,r.matches||1));
  const recentW=percentileScore(cs.map(x=>(recent5[x.player]?.wickets||0)/Math.max(1,recent5[x.player]?.matches||1)),(r.wickets||0)/Math.max(1,r.matches||1));
  const form=.55*recentRuns+.45*recentW;
  const impact=.35*batting+.35*bowling+.10*fielding+.10*win+.10*form;
  return {batting,bowling,fielding,win,form,impact};
}
const scores=Object.fromEntries(players.map(p=>[p,playerScores(p)]));

function matchup(batter,bowler,matchSubset=matches){
  batter=norm(batter);bowler=norm(bowler);
  const ids=new Set(matchSubset.map(m=>m._id));
  const ds=deliveries.filter(d=>ids.has(d.matchId)&&d.striker===batter&&d.bowler===bowler);
  let runs=0,balls=0,dismissals=0,dots=0,fours=0,sixes=0;
  const byMatch={};
  ds.forEach(d=>{
    const extra=!!d.extra || ["wide","noball"].includes(d.type);
    const legal=d.type!=="wide" && d.type!=="noball";
    const batterRuns=extra?0:(+d.runs||0);
    runs+=batterRuns;
    if(legal)balls++;
    if(legal && batterRuns===0 && d.type!=="wicket")dots++;
    if(batterRuns===4)fours++; if(batterRuns===6)sixes++;
    if(d.type==="wicket" && !/^RO/i.test(d.desc||"")) dismissals++;
    byMatch[d.matchId]=(byMatch[d.matchId]||0)+batterRuns;
  });
  return {batter,bowler,runs,balls,dismissals,dots,fours,sixes,sr:balls?100*runs/balls:0,byMatch};
}
function victimsFor(bowler){
  const map={};
  deliveries.filter(d=>d.bowler===norm(bowler)&&d.type==="wicket"&&!/^RO/i.test(d.desc||"")&&d.striker).forEach(d=>map[d.striker]=(map[d.striker]||0)+1);
  return Object.entries(map).sort((a,b)=>b[1]-a[1]);
}

let charts={};
if (window.ChartDataLabels) Chart.register(ChartDataLabels);

function chart(id,type,data,options={}){
  if(charts[id])charts[id].destroy();
  const el=document.getElementById(id); if(!el)return;

  const isHorizontal = options.indexAxis==="y";
  const baseScales = type==="doughnut" ? {} : {
    x:{ticks:{color:"#98a5c0"},grid:{color:"rgba(38,53,82,.45)"}},
    y:{ticks:{color:"#98a5c0"},grid:{color:"rgba(38,53,82,.45)"}}
  };

  const dataLabelOptions = {
    display:(ctx)=>{
      const v=ctx.dataset.data[ctx.dataIndex];
      return v!==null && v!==undefined && Number(v)!==0;
    },
    color:"#eef3ff",
    font:{weight:"700",size:11},
    formatter:(value)=>{
      if(value===null || value===undefined || Number(value)===0) return "";
      const n=Number(value);
      return Number.isInteger(n) ? n.toLocaleString() : (Math.round(n*10)/10).toLocaleString();
    },
    anchor:isHorizontal ? "end" : (type==="line" ? "end" : "end"),
    align:isHorizontal ? "right" : (type==="line" ? "top" : "top"),
    offset:isHorizontal ? 4 : 3,
    clamp:true,
    clip:false
  };

  const mergedPlugins = {
    legend:{labels:{color:"#cbd5e1"}},
    tooltip:{mode:"index",intersect:false},
    datalabels:dataLabelOptions,
    ...(options.plugins||{})
  };

  const mergedScales = {
    ...baseScales,
    ...(options.scales||{})
  };

  charts[id]=new Chart(el,{
    type,
    data,
    options:{
      responsive:true,
      maintainAspectRatio:false,
      layout:{padding:{top:18,right:isHorizontal?32:12}},
      ...options,
      plugins:mergedPlugins,
      scales:mergedScales
    }
  });
}
function localDateKey(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function populateOverviewDates(){
  const el=document.getElementById("overviewDate");
  const dates=[...new Set(matches.map(m=>localDateKey(m._date)))].sort().reverse();
  el.innerHTML=`<option value="all">All dates</option>`+dates.map(k=>{
    const d=new Date(k+"T12:00:00");
    return `<option value="${k}">${d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"})}</option>`;
  }).join("");
}
function selectedWindow(){
  const v=document.getElementById("overviewDate").value;
  return v==="all"?matches:matches.filter(m=>localDateKey(m._date)===v);
}
function renderOverview(){
  const ms=selectedWindow(), ag=aggregateFor(ms), vals=Object.values(ag).filter(x=>x.matches);
  const totalRuns=vals.reduce((s,x)=>s+x.runs,0), totalW=vals.reduce((s,x)=>s+x.wickets,0);
  const topRun=[...vals].sort((a,b)=>b.runs-a.runs)[0], topW=[...vals].sort((a,b)=>b.wickets-a.wickets)[0];
  const high=ms.flatMap(m=>inningsSides(m).flatMap(x=>x.inn?.batsmen||[])).sort((a,b)=>(b.runs||0)-(a.runs||0))[0];
  const kpis=[
    ["Matches",ms.length,"Selected date"],["Runs",totalRuns,"Player-attributed"],["Wickets",totalW,"Bowler-attributed"],
    ["High score",high?`${norm(high.name)} ${high.runs}`:"—","Single innings"],["Most runs",topRun?`${topRun.player} ${topRun.runs}`:"—","Selected date"],["Most wickets",topW?`${topW.player} ${topW.wickets}`:"—","Selected date"]
  ];
  document.getElementById("overviewKpis").innerHTML=kpis.map(x=>`<div class="card kpi"><div class="label">${x[0]}</div><div class="value">${x[1]}</div><div class="note">${x[2]}</div></div>`).join("");
  const topRuns=[...vals].sort((a,b)=>b.runs-a.runs).slice(0,10);
  chart("runsChart","bar",{labels:topRuns.map(x=>x.player),datasets:[{label:"Runs",data:topRuns.map(x=>x.runs),borderWidth:1}]},{indexAxis:"y"});
  const topWk=[...vals].sort((a,b)=>b.wickets-a.wickets).slice(0,10);
  chart("wicketsChart","bar",{labels:topWk.map(x=>x.player),datasets:[{label:"Wickets",data:topWk.map(x=>x.wickets),borderWidth:1}]},{indexAxis:"y"});
  const form=players.filter(p=>career[p].matches).map(p=>({p,s:scores[p].form})).sort((a,b)=>b.s-a.s).slice(0,8);
  document.getElementById("formLeaderboard").innerHTML=form.map((x,i)=>`<div class="scorebar"><span>${i+1}. ${x.p}</span><div class="track"><div class="fill" style="width:${x.s}%"></div></div><b>${Math.round(x.s)}</b></div>`).join("");
  const leaders=Object.values(career).filter(x=>x.matches).sort((a,b)=>scores[b.player].impact-scores[a.player].impact);
  document.getElementById("careerTable").innerHTML=`<thead><tr><th>Player</th><th>Mat</th><th>Runs</th><th>SR</th><th>Wkts</th><th>Econ</th><th>Catches</th><th>MOTM</th><th>Impact</th></tr></thead><tbody>${leaders.map(x=>`<tr><td><b>${x.player}</b></td><td>${x.matches}</td><td>${x.runs}</td><td>${fmt(x.sr)}</td><td>${x.wickets}</td><td>${x.ballsBowled?fmt(x.econ):"—"}</td><td>${x.catches}</td><td>${x.motm}</td><td><b>${Math.round(scores[x.player].impact)}</b></td></tr>`).join("")}</tbody>`;
}
function populateSelect(id,selected){
  const el=document.getElementById(id); if(!el)return;
  el.innerHTML=players.filter(p=>career[p].matches).map(p=>`<option ${p===selected?"selected":""}>${p}</option>`).join("");
}
function playerNarrative(p){
  const c=career[p],s=scores[p],r=recent5[p];
  const strengths=[],weak=[];
  if(s.batting>=70)strengths.push(`Batting impact is in the upper tier of the group (${Math.round(s.batting)}/100).`);
  if(c.sr>=200)strengths.push(`Scores very quickly: career strike rate ${fmt(c.sr)}.`);
  if(s.bowling>=70)strengths.push(`Strong wicket-taking/containment profile (${Math.round(s.bowling)}/100 bowling score).`);
  if(s.fielding>=70)strengths.push(`Above-average fielding contribution.`);
  if(s.form>=70)strengths.push(`Recent last-5 form is strong.`);
  if(s.batting<35)weak.push(`Batting impact has been below the group median so far.`);
  if(c.ballsBowled && s.bowling<35)weak.push(`Bowling impact trails the stronger wicket-taking options.`);
  if(s.form<35)weak.push(`Recent last-5 form is cooler than career level.`);
  if(c.matches<8)weak.push(`Small sample size: only ${c.matches} recorded appearances, so conclusions are unstable.`);
  if(!strengths.length)strengths.push(`Balanced profile without one dominant statistical category.`);
  if(!weak.length)weak.push(`No major statistical weakness stands out; matchup-specific weaknesses matter more.`);
  return {strengths,weak,recent:`Last 5: ${r.runs} runs, ${r.wickets} wickets, ${r.catches} catches.`};
}
function renderPlayer(){
  const p=document.getElementById("playerSelect").value, c=career[p], s=scores[p], arr=playerMatches[p];
  document.getElementById("playerSummary").innerHTML=`<div class="player-header"><div><span class="pill">Player</span><div class="big-name">${p}</div><div class="sub">${c.matches} appearances · projected impact ${Math.round(s.impact)}/100</div></div><span class="tag">${s.form>=70?"🔥 In form":s.form<35?"📉 Cool form":"➖ Stable form"}</span></div>
  <div class="metric-row"><div class="mini"><b>${c.runs}</b><span>Runs</span></div><div class="mini"><b>${fmt(c.sr)}</b><span>Strike rate</span></div><div class="mini"><b>${c.wickets}</b><span>Wickets</span></div><div class="mini"><b>${c.catches}</b><span>Catches</span></div><div class="mini"><b>${c.motm}</b><span>MOTM</span></div></div>`;
  chart("playerRunsChart","line",{labels:arr.map(x=>new Date(x.date).toLocaleDateString(undefined,{month:"short",day:"numeric"})),datasets:[{label:"Runs",data:arr.map(x=>x.runs),tension:.25,fill:false}]});
  chart("playerWicketsChart","bar",{labels:arr.map(x=>new Date(x.date).toLocaleDateString(undefined,{month:"short",day:"numeric"})),datasets:[{label:"Wickets",data:arr.map(x=>x.wickets)}]});
  const bars=[["Batting",s.batting],["Bowling",s.bowling],["Fielding",s.fielding],["Winning",s.win],["Recent form",s.form],["Overall impact",s.impact]];
  document.getElementById("strengthBars").innerHTML=bars.map(x=>`<div class="scorebar"><span>${x[0]}</span><div class="track"><div class="fill" style="width:${x[1]}%"></div></div><b>${Math.round(x[1])}</b></div>`).join("");
  const n=playerNarrative(p);
  document.getElementById("playerInsights").innerHTML=`<div class="insight"><strong>Strengths</strong><p>${n.strengths.join(" ")}</p></div><div class="insight"><strong>Watch-outs</strong><p>${n.weak.join(" ")}</p></div><div class="insight"><strong>Recent form</strong><p>${n.recent}</p></div>`;
}
function renderH2H(){
  const batter=document.getElementById("batterSelect").value,bowler=document.getElementById("bowlerSelect").value;
  document.getElementById("batterName").textContent=batter;document.getElementById("bowlerName").textContent=bowler;
  const m=matchup(batter,bowler);
  const metrics=[["Runs",m.runs],["Balls",m.balls],["Strike rate",fmt(m.sr)],["Dismissals",m.dismissals],["Dots",m.dots]];
  document.getElementById("h2hMetrics").innerHTML=metrics.map(x=>`<div class="mini"><b>${x[1]}</b><span>${x[0]}</span></div>`).join("");
  const ids=Object.keys(m.byMatch).map(Number).sort((a,b)=>matches.find(x=>x._id===a)._date-matches.find(x=>x._id===b)._date);
  chart("h2hTrendChart","line",{labels:ids.map(id=>matches.find(x=>x._id===id)._date.toLocaleDateString(undefined,{month:"short",day:"numeric"})),datasets:[{label:"Runs",data:ids.map(id=>m.byMatch[id]),tension:.25}]});
  chart("shotChart","bar",{labels:["Dots","1s/2s/3s","4s","6s"],datasets:[{label:"Balls / scoring events",data:[m.dots,Math.max(0,m.balls-m.dots-m.fours-m.sixes),m.fours,m.sixes]}]});
  renderMatrix();
}
function renderMatrix(){
  const active=players.filter(p=>career[p].matches>=2);
  let html=`<table><thead><tr><th>Batter ↓ / Bowler →</th>${active.map(p=>`<th>${p}</th>`).join("")}</tr></thead><tbody>`;
  active.forEach(b=>{
    html+=`<tr><td><b>${b}</b></td>`;
    active.forEach(w=>{
      if(b===w){html+=`<td>—</td>`;return;}
      const x=matchup(b,w); const cls=x.runs>=30?"hot":"";
      html+=`<td class="${cls}" data-b="${esc(b)}" data-w="${esc(w)}" title="${x.runs} runs, ${x.dismissals} dismissals">${x.balls?x.runs:"—"}</td>`;
    });
    html+=`</tr>`;
  });
  html+=`</tbody></table>`;
  document.getElementById("rivalryMatrix").innerHTML=html;
  document.querySelectorAll("#rivalryMatrix td[data-b]").forEach(td=>td.onclick=()=>{
    document.getElementById("batterSelect").value=td.dataset.b;document.getElementById("bowlerSelect").value=td.dataset.w;renderH2H();
  });
}
function renderBowling(){
  const p=document.getElementById("bowlingPlayerSelect").value,c=career[p],v=victimsFor(p);
  chart("victimsChart","bar",{labels:v.slice(0,10).map(x=>x[0]),datasets:[{label:"Dismissals",data:v.slice(0,10).map(x=>x[1])}]},{indexAxis:"y"});
  document.getElementById("bowlingSummary").innerHTML=`<div class="big-name">${p}</div><div class="metric-row" style="grid-template-columns:repeat(2,1fr)"><div class="mini"><b>${c.wickets}</b><span>Wickets</span></div><div class="mini"><b>${c.ballsBowled?fmt(c.econ):"—"}</b><span>Economy</span></div><div class="mini"><b>${c.wickets?fmt(c.bowlSR):"—"}</b><span>Balls / wicket</span></div><div class="mini"><b>${c.runsGiven}</b><span>Runs conceded</span></div></div>${v[0]?`<div class="insight"><strong>Favourite victim: ${v[0][0]}</strong><p>${v[0][1]} bowler-attributed dismissals in the recorded ball logs.</p></div>`:""}`;
  const leaders=Object.values(career).filter(x=>x.ballsBowled).sort((a,b)=>b.wickets-a.wickets);
  document.getElementById("bowlingTable").innerHTML=`<thead><tr><th>Bowler</th><th>Matches</th><th>Wickets</th><th>Runs</th><th>Balls</th><th>Economy</th><th>Balls/Wkt</th></tr></thead><tbody>${leaders.map(x=>`<tr><td><b>${x.player}</b></td><td>${x.matches}</td><td>${x.wickets}</td><td>${x.runsGiven}</td><td>${x.ballsBowled}</td><td>${fmt(x.econ)}</td><td>${x.wickets?fmt(x.bowlSR):"—"}</td></tr>`).join("")}</tbody>`;
}
function renderMatches(){
  const recent=[...matches].sort((a,b)=>b._date-a._date);
  document.getElementById("matchList").innerHTML=recent.map(m=>`<div class="match"><div class="date">${m._date.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"})}<br>${m.overs||""} overs</div><div><div class="score">${esc(m.i1Score||"")} → ${esc(m.i2Score||"")}</div><div class="note">${esc((m.teamA||[]).map(norm).join(", "))}<br>vs ${esc((m.teamB||[]).map(norm).join(", "))}</div></div><div class="result"><b>${esc(m.winner||"Result unavailable")}</b><div class="note">${esc(m.margin||"")}${m.starPerformer?.name?` · ⭐ ${esc(norm(m.starPerformer.name))}`:""}</div></div></div>`).join("");
}
function topMatchupInsights(){
  const notes=[];
  players.forEach(b=>players.forEach(w=>{
    if(b===w)return; const x=matchup(b,w);
    if(x.balls>=8) notes.push({...x});
  }));
  const dominance=[...notes].sort((a,b)=>b.sr-a.sr).slice(0,3);
  const nemesis=[...notes].filter(x=>x.dismissals).sort((a,b)=>b.dismissals-a.dismissals||a.sr-b.sr).slice(0,3);
  return {dominance,nemesis};
}
function renderInsights(){
  const ranked=players.filter(p=>career[p].matches>=3).map(p=>({p,...scores[p],c:career[p],r:recent5[p]})).sort((a,b)=>b.impact-a.impact);
  const form=[...ranked].sort((a,b)=>b.form-a.form);
  const batting=[...ranked].sort((a,b)=>b.batting-a.batting);
  const bowling=[...ranked].sort((a,b)=>b.bowling-a.bowling);
  document.getElementById("insightCards").innerHTML=[
   ["🔥 In-form",form.slice(0,3).map(x=>`${x.p} (${Math.round(x.form)})`).join("<br>"),"Last-5 combined batting and bowling signal"],
   ["🏏 Batting threats",batting.slice(0,3).map(x=>`${x.p} (${Math.round(x.batting)})`).join("<br>"),"Career scoring volume + rate"],
   ["🎯 Bowling threats",bowling.slice(0,3).map(x=>`${x.p} (${Math.round(x.bowling)})`).join("<br>"),"Wicket rate + economy"]
  ].map(x=>`<div class="card"><div class="eyebrow">${x[0]}</div><div style="font-size:22px;font-weight:850;line-height:1.6;margin:8px 0">${x[1]}</div><div class="note">${x[2]}</div></div>`).join("");
  const top=ranked.slice(0,10);
  chart("impactChart","bar",{labels:top.map(x=>x.p),datasets:[{label:"Projected impact",data:top.map(x=>x.impact)}]},{indexAxis:"y",scales:{x:{min:0,max:100,ticks:{color:"#98a5c0"},grid:{color:"rgba(38,53,82,.45)"}},y:{ticks:{color:"#98a5c0"},grid:{color:"rgba(38,53,82,.45)"}}}});
  const mi=topMatchupInsights();
  const blocks=[];
  mi.dominance.forEach(x=>blocks.push(`<div class="insight"><strong>${x.batter} attacks ${x.bowler}</strong><p>${x.runs} runs from ${x.balls} balls, SR ${fmt(x.sr)}, ${x.dismissals} dismissal(s).</p></div>`));
  mi.nemesis.forEach(x=>blocks.push(`<div class="insight"><strong>${x.bowler} has a matchup edge over ${x.batter}</strong><p>${x.dismissals} recorded dismissals; batter SR ${fmt(x.sr)} in this matchup.</p></div>`));
  document.getElementById("matchupInsights").innerHTML=blocks.slice(0,6).join("")||`<div class="note">More ball-by-ball history is needed for stable matchup signals.</div>`;
}
function teamMetrics(team){
  const vals=team.map(p=>scores[p]); return {
    impact:vals.reduce((s,x)=>s+x.impact,0),batting:vals.reduce((s,x)=>s+x.batting,0),
    bowling:vals.reduce((s,x)=>s+x.bowling,0),form:vals.reduce((s,x)=>s+x.form,0)
  };
}
function combinations(arr,k){
  const out=[]; function rec(start,cur){if(cur.length===k){out.push([...cur]);return;} for(let i=start;i<=arr.length-(k-cur.length);i++){cur.push(arr[i]);rec(i+1,cur);cur.pop();}}rec(0,[]);return out;
}
function buildTeamsEven(sel){
  const nA=Math.floor(sel.length/2), allScore=sel.reduce((s,p)=>s+scores[p].impact,0);
  let combos=combinations(sel,nA);
  if(combos.length>25000) combos=combos.filter((_,i)=>i%Math.ceil(combos.length/25000)===0);
  let best=null;
  combos.forEach(a=>{
    const set=new Set(a),b=sel.filter(p=>!set.has(p)); const A=teamMetrics(a),B=teamMetrics(b);
    const dI=Math.abs(A.impact-B.impact)/(allScore||1);
    const dB=Math.abs(A.batting-B.batting)/(A.batting+B.batting||1);
    const dW=Math.abs(A.bowling-B.bowling)/(A.bowling+B.bowling||1);
    const dF=Math.abs(A.form-B.form)/(A.form+B.form||1);
    const loss=.4*dI+.25*dB+.25*dW+.10*dF;
    if(!best||loss<best.loss)best={a,b,A,B,loss};
  });
  return best;
}

function floaterFitScore(p){
  const s=scores[p], c=career[p];
  const versatility = 100 - Math.abs(s.batting-s.bowling)*0.45;
  const reliability = Math.min(100, (c.matches/15)*100);
  const formStability = 100 - Math.abs(s.form-s.impact)*0.5;
  return 0.45*s.impact + 0.25*versatility + 0.15*reliability + 0.15*formStability;
}

function buildTeams(sel){
  if(sel.length%2===0){
    const best=buildTeamsEven(sel);
    return {...best,floater:null,floaterFit:null};
  }

  let bestOverall=null;
  sel.forEach(floater=>{
    const remaining=sel.filter(p=>p!==floater);
    const best=buildTeamsEven(remaining);
    if(!best)return;
    const fit=floaterFitScore(floater);
    const adjustedLoss=best.loss + ((100-fit)/100)*0.06;
    if(!bestOverall || adjustedLoss<bestOverall.adjustedLoss){
      bestOverall={...best,floater,floaterFit:fit,adjustedLoss};
    }
  });
  return bestOverall;
}

function renderTeamBuilder(){
  document.getElementById("playerChecks").innerHTML=players.filter(p=>career[p].matches).map((p,i)=>`<label class="check"><input type="checkbox" value="${esc(p)}" ${i<10?"checked":""}><span>${p}</span><span class="tag" style="margin-left:auto">${Math.round(scores[p].impact)}</span></label>`).join("");
}
function generateTeams(){
  const sel=[...document.querySelectorAll("#playerChecks input:checked")].map(x=>x.value);
  if(sel.length<6){
    document.getElementById("teamResult").innerHTML=`<div class="card" style="margin-top:16px"><span class="bad">Select at least 6 players.</span></div>`;
    return;
  }

  const x=buildTeams(sel);
  if(!x)return;

  const balance=Math.max(0,100-x.loss*250);
  const avg=(v,n)=>v/Math.max(1,n);

  const floaterBlock = x.floater ? `
    <div class="card" style="margin-top:16px;border-color:rgba(167,139,250,.55)">
      <div class="section-title"><h3>🔄 Recommended floater</h3><span>Odd-number player pool</span></div>
      <div class="player-header">
        <div>
          <div class="big-name">${x.floater}</div>
          <div class="sub">Chosen because this player gives the best combination of historical impact, role versatility and team balance.</div>
        </div>
        <span class="tag">Floater fit ${Math.round(x.floaterFit)}/100</span>
      </div>
      <div class="metric-row" style="grid-template-columns:repeat(4,1fr)">
        <div class="mini"><b>${Math.round(scores[x.floater].impact)}</b><span>Impact</span></div>
        <div class="mini"><b>${Math.round(scores[x.floater].batting)}</b><span>Batting</span></div>
        <div class="mini"><b>${Math.round(scores[x.floater].bowling)}</b><span>Bowling</span></div>
        <div class="mini"><b>${Math.round(scores[x.floater].form)}</b><span>Recent form</span></div>
      </div>
      <div class="insight">
        <strong>How to use the floater</strong>
        <p>Let ${x.floater} bat/bowl for whichever side is statistically weaker in the relevant discipline, rather than assigning the floater permanently to one team.</p>
      </div>
    </div>` : "";

  document.getElementById("teamResult").innerHTML=`
    ${floaterBlock}
    <div class="team-grid">
      <div class="team"><h3>Team A</h3><ul>${x.a.sort((p,q)=>scores[q].impact-scores[p].impact).map(p=>`<li><b>${p}</b> <span class="note">impact ${Math.round(scores[p].impact)}</span></li>`).join("")}</ul></div>
      <div class="team"><h3>Team B</h3><ul>${x.b.sort((p,q)=>scores[q].impact-scores[p].impact).map(p=>`<li><b>${p}</b> <span class="note">impact ${Math.round(scores[p].impact)}</span></li>`).join("")}</ul></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="section-title"><h3>Balance score</h3><span>${x.floater ? "Excludes floater from permanent team totals" : "Higher is closer"}</span></div>
      <div style="font-size:36px;font-weight:900">${balance.toFixed(1)}%</div>
      <div class="balance">
        <div class="mini"><b>${fmt(avg(x.A.batting,x.a.length))} / ${fmt(avg(x.B.batting,x.b.length))}</b><span>Batting A / B</span></div>
        <div class="mini"><b>${fmt(avg(x.A.bowling,x.a.length))} / ${fmt(avg(x.B.bowling,x.b.length))}</b><span>Bowling A / B</span></div>
        <div class="mini"><b>${fmt(avg(x.A.form,x.a.length))} / ${fmt(avg(x.B.form,x.b.length))}</b><span>Form A / B</span></div>
        <div class="mini"><b>${fmt(avg(x.A.impact,x.a.length))} / ${fmt(avg(x.B.impact,x.b.length))}</b><span>Impact A / B</span></div>
      </div>
    </div>`;
}

document.querySelectorAll("#nav button").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("#nav button").forEach(x=>x.classList.toggle("active",x===b));
 document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===b.dataset.view));
 if(b.dataset.view==="overview")renderOverview();
 if(b.dataset.view==="players")renderPlayer();
 if(b.dataset.view==="h2h")renderH2H();
 if(b.dataset.view==="bowling")renderBowling();
 if(b.dataset.view==="matches")renderMatches();
 if(b.dataset.view==="insights")renderInsights();
});
document.getElementById("overviewDate").onchange=renderOverview;
populateSelect("playerSelect","Kshitij");
populateSelect("batterSelect","Harish");
populateSelect("bowlerSelect","Swapnil");
populateSelect("bowlingPlayerSelect","Ruchir");
document.getElementById("playerSelect").onchange=renderPlayer;
document.getElementById("batterSelect").onchange=renderH2H;
document.getElementById("bowlerSelect").onchange=renderH2H;
document.getElementById("bowlingPlayerSelect").onchange=renderBowling;
document.getElementById("generateTeams").onclick=generateTeams;
document.getElementById("selectAll").onclick=()=>document.querySelectorAll("#playerChecks input").forEach(x=>x.checked=true);
document.getElementById("clearAll").onclick=()=>document.querySelectorAll("#playerChecks input").forEach(x=>x.checked=false);

renderTeamBuilder();
populateOverviewDates();
renderOverview();
renderPlayer();
renderH2H();
renderBowling();
renderMatches();
renderInsights();
