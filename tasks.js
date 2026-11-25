/* Tasks page for Realtor OS: Today, Plan, Ideas, Notes. Data lives in the os_docs table; numbers come from your contacts. */
(function(){
  var R=window.ROS;
  var app=document.getElementById('app');

  function todayEdm(){
    try{
      return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    }catch(e){
      return new Date().toISOString().slice(0,10);
    }
  }

  /* ---------- state: outcomes and placements, saved locally and, when available, in the shared database ---------- */
  var outcomes={},placements={},notes=[],draft='',analyzing={},sampleFn=null,dict=null,listening=false,dictBlocked=false,content=[],archOpen=false,ideas=[],later=[],laterKnown=false,flash='',doneOpen=false,openIdea=null,openTask=null,noClickUntil=0,composeOpen=false,nextOpen=false,nextRow=null,ideasAll=false,wayAud='investor',wayAdded={},delArm=null,askDraft={},genning={},reAsk={};
  var steps={},doing=null,pushes={},people=[],colSel='today',stepOpen=null,focusKey=null,kbLeft=null,upOpen=false,blNote='';
  var autoRead={s:'wait',code:''},ptrEl=null,ptrBusy=false,dbPull=null,osRef=null,cd=null,cdAt='',CD_URL='./',OS_DOC_URL='https://claude.ai/artifact/D9aSgJEv7WZWE8t2JUXfaw';
  var dbRef=null,synced=false,writing=false,dirty=false,failCount=0,retryT=null,lastSent='',savedT=null,saveMsg='',sentTs={},writeId=0,writeT=null;
  try{
    var raw=localStorage.getItem('ros3:state2');
    if(raw){var s0=JSON.parse(raw);outcomes=s0.outcomes||{};placements=s0.placements||{};notes=Array.isArray(s0.notes)?s0.notes:[];content=Array.isArray(s0.content)?s0.content:[];ideas=Array.isArray(s0.ideas)?s0.ideas:[];if(Array.isArray(s0.later)){later=s0.later;laterKnown=true;}
      steps=s0.steps&&typeof s0.steps==='object'?s0.steps:{};doing=s0.doing||null;pushes=s0.pushes&&typeof s0.pushes==='object'?s0.pushes:{};}
  }catch(e){}
  try{draft=localStorage.getItem('ros3:draft')||'';}catch(e){}
  /* Starter for the Later list. Used once, only while the saved document has no "later" list at all. */
  var LATER_SEED=[{id:'l-2step',title:'Add a 6-digit code to your login',note:'2-step sign-in. Claude builds it, you test it once.',ts:'2026-11-16T04:05:00.000Z'}];

  var today=todayEdm();
  var afterEnd=today>R.END;
  var viewing=R.clamp(today);
  var pinned=false;
  var D=null;

  function recompute(){
    D=R.derive(outcomes,placements,R.clamp(today));
    if(D.changed){placements=D.placements;}
  }
  function localSave(){
    try{localStorage.setItem('ros3:state2',JSON.stringify({outcomes:outcomes,placements:placements,notes:notes,content:content,ideas:ideas,later:later,steps:steps,doing:doing,pushes:pushes}));}catch(e){}
  }
  function buildPayload(){
    recompute();
    var t=new Date().toISOString();
    if(t<=lastSent){t=new Date(new Date(lastSent).getTime()+1).toISOString();}
    return {
      outcomes:outcomes,
      placements:placements,
      board:D.board.map(function(e){return {title:e.title,from:e.from,status:e.status,to:e.to,toIdx:e.toIdx,why:e.why};}),
      moves:D.moves,
      notes:notes,
      content:content,
      ideas:ideas,
      later:later,
      steps:steps,
      doing:doing,
      pushes:pushes,
      updated:t
    };
  }
  /* One write at a time. Changes made while a write is in flight are folded into the next one. */
  function renderSync(){
    var el=document.getElementById('syncpill');
    if(!el) return;
    var txt='',cls='sync';
    if(!dbRef){txt='';}
    else if(failCount>0){txt='Not synced yet. Kept on this phone, retrying';cls='sync bad';}
    else if(writing||dirty){txt='Saving…';}
    else if(saveMsg){txt=saveMsg;cls='sync ok';}
    el.className=cls;el.textContent=txt;
  }
  function flush(){
    if(!dbRef||writing||!dirty) return;
    writing=true;dirty=false;
    var payload=buildPayload();
    lastSent=payload.updated;sentTs[lastSent]=1;
    var myId=++writeId;
    var fail=function(){
      if(myId!==writeId||!writing) return;
      clearTimeout(writeT);
      writing=false;dirty=true;synced=false;failCount++;
      renderSync();renderFoot();
      clearTimeout(retryT);
      retryT=setTimeout(flush,Math.min(15000,1000*Math.pow(2,Math.min(failCount,4)-1)));
    };
    var p;
    try{p=Promise.resolve(dbRef.set(payload));}catch(e){p=Promise.reject(e);}
    renderSync();
    clearTimeout(writeT);
    writeT=setTimeout(fail,20000);
    p.then(function(){
      if(myId!==writeId||!writing) return;
      clearTimeout(writeT);
      writing=false;failCount=0;synced=true;
      if(dirty){flush();return;}
      saveMsg='Saved ✓';
      clearTimeout(savedT);savedT=setTimeout(function(){saveMsg='';renderSync();},3000);
      renderSync();renderFoot();
    }).catch(fail);
  }
  function persist(){
    recompute();
    localSave();
    if(dbRef){dirty=true;saveMsg='';flush();renderSync();}
  }
  function putOutcome(date,i,val){
    var a=(outcomes[date]||[null,null,null]).slice();
    a[i]=val;
    if(a.every(function(x){return !x;})) delete outcomes[date]; else outcomes[date]=a;
  }
  function setOutcome(date,i,val){
    var a=(outcomes[date]||[null,null,null]).slice();
    a[i]=val;
    if(a.every(function(x){return !x;})) delete outcomes[date]; else outcomes[date]=a;
    persist();
    render(i);
  }
  function doneCount(date){return (outcomes[date]||[]).filter(function(x){return x==='done';}).length;}

  function unwrap(s){
    if(!s) return null;
    if(s.outcomes!==undefined&&typeof s.data!=='function') return s;
    var ex=typeof s.exists==='function'?s.exists():s.exists;
    if(ex===false) return null;
    var v=typeof s.data==='function'?s.data():s.data;
    /* The database hands back frozen objects. Work on a private copy so ticks, notes and edits can change it. */
    if(!v||typeof v!=='object') return null;
    try{return JSON.parse(JSON.stringify(v));}catch(e){return null;}
  }
  /* The page keeps one JSON document (notes, ideas, content, outcomes) in the Realtor OS database, table os_docs, row "main".
     This adapter gives it the small set/get/onSnapshot surface the rest of the code already uses. */
  function snapOf(v){return {exists:!!v,data:function(){return v;},metadata:{fromCache:false}};}
  function makeRef(){
    return {
      set:function(v){return Store.putOsDoc('main',v);},
      get:function(){return Store.getOsDoc('main').then(snapOf);},
      onSnapshot:function(cb,err){
        Store.getOsDoc('main').then(function(v){cb(snapOf(v));},function(e){if(err) err(e);});
        Store.subscribeOsDoc('main',function(v){cb(snapOf(v));},function(st){if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'||st==='CLOSED'){if(err) err(st);}});
      }
    };
  }
  function attachDb(){
    dbRef=makeRef();
      var first=true;
      var cacheT=null;
      var onData=function(s,force){
        var addLocal=false;
        /* A copy saved on an earlier visit can arrive first. Wait briefly for the live one so old ticks do not come back. */
        if(!force&&first&&s&&s.metadata&&s.metadata.fromCache&&(notes.length||ideas.length||content.length||Object.keys(outcomes).length)){
          if(!cacheT){cacheT=setTimeout(function(){if(first) onData(s,true);},8000);}
          return;
        }
        var v=unwrap(s);
        /* Local changes not yet written, or an older echo of our own write: do not let it overwrite what is on screen. */
        if(v&&v.outcomes&&!first&&(writing||dirty||(v.updated&&v.updated!==lastSent&&sentTs[v.updated]))){return;}
        var before=first?'':JSON.stringify([outcomes,placements,notes,content,ideas,later,steps,doing,pushes]);
        if(v&&v.outcomes&&typeof v.outcomes==='object'){
          outcomes=v.outcomes;placements=v.placements||{};
          if(v.steps&&typeof v.steps==='object') steps=v.steps; else if(first&&Object.keys(steps).length) addLocal=true;
          if(v.pushes&&typeof v.pushes==='object') pushes=v.pushes; else if(first&&Object.keys(pushes).length) addLocal=true;
          if(v.doing!==undefined) doing=v.doing||null;
          var mergeIds=function(remote,local){
            var out=Array.isArray(remote)?remote.slice():[];
            if(first&&local.length){
              var seen={};out.forEach(function(n){seen[n.id]=1;});
              local.forEach(function(n){if(!seen[n.id]){out.push(n);addLocal=true;}});
            }
            return out;
          };
          notes=mergeIds(v.notes,notes).sort(function(a,b){return a.ts<b.ts?-1:1;});
          var ci=mergeIds(v.content,content);
          content=ci;
          var ii=mergeIds(v.ideas,ideas);
          if(addLocal) ii.sort(function(a,b){return a.ts<b.ts?1:-1;});
          ideas=ii;
          if(Array.isArray(v.later)){laterKnown=true;later=mergeIds(v.later,later);}
          else if(!laterKnown&&!later.length){later=LATER_SEED.map(function(x){return {id:x.id,title:x.title,note:x.note,ts:x.ts,done:false};});laterKnown=true;addLocal=true;}
          else if(later.length){addLocal=true;}
          localSave();
        } else if(first&&(Object.keys(outcomes).length||notes.length||ideas.length||content.length)){
          addLocal=true;
        }
        var wasFirst=first;
        first=false;synced=true;recompute();setTimeout(cdAuto,60);
        if(!wasFirst&&!addLocal&&before===JSON.stringify([outcomes,placements,notes,content,ideas,later,steps,doing,pushes])){renderFoot();return;}
        if(addLocal){persist();}
        if(!drag&&!noteFocused()){render();}else{pendingRender=true;}
      };
      dbPull=function(){
        return Promise.resolve(dbRef.get()).then(function(s){onData(s,true);});
      };
      dbRef.onSnapshot(onData,function(){synced=false;renderFoot();});
  }
  /* Realtor OS numbers are worked out here from the same contacts, with the same rules as the Today page there. */
  function localToday(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
  /* People due today, in the same order as the Clients list, with a phone number you saved. Used to name the steps of a reach task. */
  var TEMPS=['hot','warm','cold','stale'];
  function rankC(c){return (c.stage==='New'?0:1)*10+Math.max(TEMPS.indexOf(c.temp),0);}
  function fphone(p){var m=/^\+1(\d{3})(\d{3})(\d{4})$/.exec(p||'');return m?'('+m[1]+') '+m[2]+'-'+m[3]:(p||'');}
  function duePeople(list,td){
    return list.filter(function(c){return c.stage!=='Dead'&&c.next&&c.next<=td&&c.phone;})
      .sort(function(a,b){return rankC(a)-rankC(b)||String(a.next||'').localeCompare(String(b.next||''));})
      .slice(0,25).map(function(c){
        var nm=((c.first||'')+' '+(c.last||'')).trim()||c.email||fphone(c.phone)||'No name';
        return {id:c.id,name:nm,phone:fphone(c.phone)};
      });
  }
  var cdBusy=false;
  function loadCd(){
    if(cdBusy||!Store||!window.CDStats) return Promise.resolve();
    cdBusy=true;
    return Store.loadAll().then(function(res){
      var s=window.CDStats.compute(res.contacts||[],localToday());
      s.asOf=new Date().toISOString();
      var pl=duePeople(res.contacts||[],localToday()),plSig=JSON.stringify(pl),plSame=(plSig===JSON.stringify(people));
      people=pl;
      var same=JSON.stringify(s,function(k,v){return k==='asOf'?0:v;})===JSON.stringify(cd,function(k,v){return k==='asOf'?0:v;});
      cd=s;cdAt='';
      cdBusy=false;
      if(!same||!plSame){if(!drag&&!noteFocused()){render();}else{pendingRender=true;}}
      setTimeout(cdAuto,60);
    },function(){cdBusy=false;});
  }

  /* ---------- tiny DOM helper and icons ---------- */
  function h(tag,attrs,kids){
    var el=document.createElement(tag);
    if(attrs){Object.keys(attrs).forEach(function(k){
      if(k==='class') el.className=attrs[k];
      else if(k==='text') el.textContent=attrs[k];
      else if(k==='html') el.innerHTML=attrs[k];
      else el.setAttribute(k,attrs[k]);
    });}
    (kids||[]).forEach(function(c){ if(c) el.appendChild(c); });
    return el;
  }
  function fmtDate(d,opts){
    opts.timeZone='UTC';
    return new Intl.DateTimeFormat('en-US',opts).format(R.parse(d));
  }
  function longDate(d){return fmtDate(d,{weekday:'long',month:'short',day:'numeric'});}

  var CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var ARROW='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>';
  var CROSS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
  var QUESTION='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.6 9.2a3.6 3.6 0 1 1 5.4 3.1c-1.2.7-2 1.4-2 2.9"/><circle cx="12" cy="19" r="1.1" fill="#fff" stroke="none"/></svg>';
  var LEFT='<svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2L2 10l8 8"/></svg>';
  var RIGHT='<svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 2l8 8-8 8"/></svg>';

  function ring(count){
    var C=2*Math.PI*26;
    var off=C*(1-count/3);
    var prog=count>0?'<circle cx="32" cy="32" r="26" fill="none" class="rp" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+off.toFixed(2)+'" transform="rotate(-90 32 32)"/>':'';
    return '<svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="'+count+' of 3 done">'+
      '<circle class="rt" cx="32" cy="32" r="26"/>'+prog+
      '<text class="rx" x="32" y="37.5">'+count+'/3</text></svg>';
  }
  function grp(label,node){
    return h('section',{class:'grp'},[h('h2',{class:'sec',text:label}),node]);
  }

  /* ---------- rows ---------- */
  function missLine(info,i){
    var line=h('div',{class:'stline'});
    if(!info){line.appendChild(h('span',{class:'plain',text:'Back on the board'}));return line;}
    if(info.status==='placed'){
      line.appendChild(h('span',{class:'warn',text:'Back on the board'}));
      line.appendChild(h('button',{class:'lnk','data-act':'goto','data-d':info.to,text:'Moved to '+R.shortDay(info.to)+' ›'}));
    } else if(info.status==='absorbed'&&info.to){
      line.appendChild(h('span',{class:'warn',text:'Back on the board'}));
      line.appendChild(h('button',{class:'lnk','data-act':'goto','data-d':info.to,text:'Same task on '+R.shortDay(info.to)+' ›'}));
    } else if(info.status==='absorbed'){
      line.appendChild(h('span',{class:'plain',text:'Nothing to catch up'}));
    } else {
      line.appendChild(h('span',{class:'warn',text:'Needs Claude to place it'}));
    }
    line.appendChild(h('button',{class:'lnk','data-act':'undo','data-i':String(i),text:'Undo'}));
    return line;
  }
  var TI=window.TASK_INFO||{};
  function tinfo(title){
    var x=TI[title];
    if(x) return x;
    var m=/^(.*?[.!?:])\s+(.*)$/.exec(title||'');
    return m?{head:m[1].replace(/[.:]$/,''),desc:m[2]}:{head:(title||'').replace(/\.$/,''),desc:title||''};
  }
  function row(t,i,st){
    var info=D.missInfo[viewing+'#'+i];
    var x=tinfo(t.title);
    var open=(openTask===viewing+'#'+i);
    var tags=h('div',{class:'kicker'},[
      t.role?h('span',{class:'role',text:t.role}):null,
      h('span',{class:'tag t-'+String(t.tag||'').toLowerCase().replace(/[^a-z]/g,''),text:t.tag}),
      t.mins?h('span',{class:'mins',text:t.mins+' min'}):null,
      t.moved?h('span',{class:'chip-mv',text:'Moved from '+R.shortDay(t.from)}):null
    ]);
    var kids=[
      h('div',{class:'thead'},[h('p',{class:'title',id:'t'+i,text:x.head}),h('span',{class:'tchev','aria-hidden':'true',text:'›'})]),
      tags
    ];
    if(open){
      kids.push(h('div',{class:'tdesc'},[
        h('p',{class:'dtext',text:x.desc}),
        t.where?h('p',{class:'where',text:'Where: '+t.where}):null,
        t.hint?h('p',{class:'hint',text:t.hint}):null,
        (t.tag==='CRM'||t.tag==='DASH')?h('a',{class:'cdlink',href:CD_URL,text:'Open Realtor OS ›'}):null
      ]));
    }
    if(st==='done') kids.push(h('div',{class:'stline'},[h('span',{class:'ok',text:'Done'}),h('button',{class:'lnk','data-act':'undo','data-i':String(i),text:'Undo'})]));
    if(st==='missed') kids.push(missLine(info,i));
    var body=h('div',{class:'tbody'},kids);
    var num=h('div',{class:'num',text:String(i+1)});
    var front=h('div',{class:'front'+(st?' '+st:'')+(open?' open':''),tabindex:'0',role:'group','aria-expanded':open?'true':'false','aria-labelledby':'t'+i,'aria-describedby':'swipehelp'},[num,body]);
    return h('li',{class:'swipe','data-i':String(i)},[
      h('div',{class:'under u-done',html:CHECK+'<span>Done</span>'}),
      h('div',{class:'under u-miss',html:'<span>Didn’t do it</span>'+CROSS}),
      front
    ]);
  }

  function boardRow(e){
    var meta='From '+R.shortDay(e.from)+(e.mins?' · '+e.mins+' min':'');
    var right;
    if(e.status==='placed') right=h('button',{class:'go','data-act':'goto','data-d':e.to,text:R.shortDay(e.to)+' ›'});
    else if(e.status==='absorbed'&&e.to) right=h('button',{class:'go calm','data-act':'goto','data-d':e.to,text:'Covered '+R.shortDay(e.to)});
    else if(e.status==='absorbed') right=h('span',{class:'badge',text:'No catch-up'});
    else right=h('span',{class:'badge',text:'Needs Claude'});
    return h('li',{class:'brow'},[
      h('div',{class:'bmain'},[
        h('p',{class:'title',text:tinfo(e.title).head}),
        h('p',{class:'meta',text:meta}),
        h('p',{class:'why',text:e.why})
      ]),
      right
    ]);
  }

  var footEl=null;
  function footText(){
    return (synced?'Synced across your devices. ':'Saved on this device. ')+'Dates follow Edmonton time. A day turns green when all 3 are done. Pull down to refresh.';
  }
  /* ---- Today's plan card (Vacation week). Read only: it never writes the vacation document. ---- */
  var vwDoc=null,vwAt=0;
  function vwRefresh(){
    if(!window.VW||!window.VW.peek) return;
    vwAt=Date.now();
    try{window.VW.peek(function(d){vwDoc=d;vwPaint();});}catch(e){}
  }
  function vwCard(){return h('a',{class:'card vwcard',href:'vacation.html#today','data-vwcard':'1'});}
  function vwPaint(){
    var els=document.querySelectorAll('[data-vwcard]');
    if(!els.length||!window.VW) return;
    if(!vwDoc){vwRefresh();return;}
    for(var q=0;q<els.length;q++) vwPaintOne(els[q]);
  }
  function vwPaintOne(el){
    var V=window.VW,sm=V.todaySummary(vwDoc,V.tzNow());
    el.textContent='';
    el.appendChild(h('span',{class:'vwk',text:"Today's plan \u00b7 Vacation week"}));
    if(sm.kind==='none'){
      el.setAttribute('href','vacation.html#board');
      el.appendChild(h('strong',{class:'vwh',text:'No plan for today'}));
      el.appendChild(h('span',{class:'vwm',text:'The vacation week runs Nov 18 to 29. Open the board.'}));
      return;
    }
    el.setAttribute('href','vacation.html#today');
    if(sm.kind==='family'){
      el.appendChild(h('strong',{class:'vwh',text:'Family day, nothing scheduled'}));
      el.appendChild(h('span',{class:'vwm',text:sm.title}));
      return;
    }
    var pc=sm.total?Math.round(sm.done*100/sm.total):0,nx=sm.next;
    el.appendChild(h('strong',{class:'vwh',text:sm.title}));
    el.appendChild(h('span',{class:'vwm'},[h('b',{class:'vwn',text:sm.done+' of '+sm.total+' done'})]));
    el.appendChild(h('span',{class:'vwbar',role:'progressbar','aria-label':'Today\u2019s progress','aria-valuemin':'0','aria-valuemax':String(sm.total),'aria-valuenow':String(sm.done)},[h('i',{style:'width:'+pc+'%'})]));
    if(nx) el.appendChild(h('span',{class:'vwx'},[h('span',{class:'vwpill',text:'Next up'}),h('span',{class:'vwxt',text:V.fmtRange(nx)+' \u00b7 '+nx.title})]));
    else el.appendChild(h('span',{class:'vwx'},[h('span',{class:'vwxt',text:sm.done===sm.total?'Everything planned for today is done.':'Nothing left to do right now.'})]));
  }
  setInterval(vwPaint,60000);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&Date.now()-vwAt>60000) vwRefresh();});

  /* Today tab: the plan tasks for the real today, with their state on the Board. Read only here. */
  function dayPlan(){
    var td=todayEdm();
    if(td<R.START||td>R.END) return [];
    var arr=D.eff[td]||[],oc=outcomes[td]||[],dk=doingNow(),out=[];
    arr.forEach(function(t,i){
      var st=oc[i];
      if(st==='missed') return;
      var ti=tinfo(t.title);out.push({title:ti.head,state:st==='done'?'done':(dk&&keyOf(t)===dk?'doing':'todo'),mins:t.mins||null,role:t.role||'',tag:t.tag||'',full:t.title,desc:ti.desc&&ti.desc!==ti.head?ti.desc:'',steps:getSteps(t).map(function(x){return {t:x.t,m:x.m||0,d:x.d?1:0};})});
    });
    return out;
  }
  function renderFoot(){if(footEl) footEl.textContent=footText();}

  /* ---------- page tabs: Today, Plan, Ideas, Notes ---------- */
  var TABS=['today','day','plan','ideas','notes'];
  var curTab='day';
  function tabIn(name,el){if(el&&el.setAttribute) el.setAttribute('data-sec',name);return el;}
  function emptyCard(t,p){return h('div',{class:'card empty'},[h('h2',{text:t}),h('p',{text:p})]);}
  function tabHead(title,sub){return h('header',{class:'title-row'},[h('div',{},[h('h1',{text:title}),h('p',{class:'sub',text:sub})])]);}
  function setTab(name,keepScroll){
    if(TABS.indexOf(name)<0) name='day';
    curTab=name;
    document.body.setAttribute('data-tab',name);
    var bs=document.querySelectorAll('.subnav button');
    for(var i=0;i<bs.length;i++){var on=bs[i].getAttribute('data-tab')===name;bs[i].setAttribute('aria-pressed',on?'true':'false');bs[i].classList.toggle('on',on);}
    try{var hh='#'+(HASHES[name]||'board');if(location.hash!==hh) history.replaceState(null,'',hh);}catch(e){}
    if(!keepScroll) window.scrollTo(0,0);
    if(name==='today') kbScroll();
  }
  function setTheme(t){
    document.documentElement.setAttribute('data-theme',t);
    try{localStorage.setItem('cd.theme',t);}catch(e){}
    var m=document.querySelector('meta[name="theme-color"]');if(m) m.setAttribute('content',t==='light'?'#F5F3EE':'#0A0D14');
    var b=document.getElementById('themeBtn');if(b) b.setAttribute('aria-label',t==='light'?'Switch to dark mode':'Switch to light mode');
  }
  var HASHES={today:'board',day:'today',plan:'plan',ideas:'ideas',notes:'notes'};
  function tabFromHash(){var h0=String(location.hash||'').replace('#','');for(var k in HASHES){if(HASHES[k]===h0) return k;}return 'day';}
  function buildChrome(){
    var strip=h('div',{class:'strip'},[
      h('span',{class:'logo','aria-hidden':'true',html:'<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9H4z"/><path d="M9 15l2.2 2.2L15 12.8"/></svg>'}),
      h('span',{class:'brand',text:'Realtor OS'}),
      h('span',{class:'sp'}),
      h('button',{class:'ib',id:'themeBtn',type:'button','aria-label':'Switch to light mode',html:'<svg class="ic-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg><svg class="ic-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'}),
      h('a',{class:'ib more-gear',href:'index.html#more','aria-label':'Settings',html:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>'})
    ]);
    app.parentNode.insertBefore(strip,app);
    document.getElementById('themeBtn').addEventListener('click',function(){setTheme(document.documentElement.getAttribute('data-theme')==='light'?'dark':'light');});
    setTheme(document.documentElement.getAttribute('data-theme')==='light'?'light':'dark');
    setTab(tabFromHash(),true);
  }
  window.addEventListener('hashchange',function(){var t=tabFromHash();if(t!==curTab){setTab(t);render();}});

  function render(focusIdx){
    pendingRender=false;
    if(doing&&doing.d<R.clamp(today)){doing=null;focusKey=null;}
    var plan=R.planFor(viewing);
    var tasks=D.eff[viewing];
    var oc=outcomes[viewing]||[];
    var count=doneCount(viewing);
    var missed=oc.filter(function(x){return x==='missed';}).length;
    var isToday=(viewing===R.clamp(today))&&!afterEnd;
    app.textContent='';

    var prev=h('button',{class:'tb',id:'prev','aria-label':'Previous day',html:LEFT});
    var jump=h('button',{class:'tb dayc',id:'jump','aria-label':isToday?'Today':'Back to today'},[h('span',{text:isToday?'Today':R.shortDay(viewing)}),isToday?null:h('small',{text:'Back to today'})]);
    var next=h('button',{class:'tb',id:'next','aria-label':'Next day',html:RIGHT});
    if(viewing<=R.START) prev.disabled=true;
    if(viewing>=R.END) next.disabled=true;
    if(isToday) jump.disabled=true;
    app.appendChild(h('div',{class:'bar-top'},[h('div',{class:'bar-in'},[prev,jump,next])]));

    var wrap=h('div',{class:'wrap'});
    app.appendChild(wrap);
    wrap.appendChild(h('div',{class:'subnav',role:'tablist','aria-label':'Task sections'},[['day','Today'],['today','Board'],['plan','Plan'],['ideas','Ideas'],['notes','Notes']].map(function(c){
      return h('button',{type:'button',role:'tab','data-tab':c[0],'aria-pressed':curTab===c[0]?'true':'false',class:curTab===c[0]?'on':'',text:c[1]});
    })));

    wrap.appendChild(tabIn('today',h('header',{class:'title-row'},[
      h('div',{},[
        h('h1',{text:fmtDate(viewing,{weekday:'long'})}),
        h('p',{class:'sub',text:(isToday?'Today · ':'')+fmtDate(viewing,{month:'long',day:'numeric'})})
      ]),
      h('div',{class:'ring',html:ring(count)})
    ])));
    wrap.appendChild(tabIn('today',vwCard()));
    wrap.appendChild(tabIn('day',window.TDAY?window.TDAY.view({plan:dayPlan(),openBoard:function(){setTab('today');render();},afterPaint:vwPaint}):h('div')));
    vwPaint();
    wrap.appendChild(tabIn('plan',tabHead('Plan','Next 10 days and the full calendar')));
    wrap.appendChild(tabIn('ideas',tabHead('Ideas','Ways to prospect, and content to post')));
    wrap.appendChild(tabIn('notes',tabHead('Notes','Capture a thought')));
    if(viewing<=today){var cmp=composeBlock();cmp.classList.add('cmp');wrap.appendChild(tabIn('today notes',cmp));}
    var msg=null;
    if(count===3) msg='All 3 done. That is the day.';
    else if(missed>0&&count+missed===3) msg='Nothing left for this day. The rest is back on the board.';
    if(msg) wrap.appendChild(tabIn('today',h('div',{class:'status'},[h('p',{class:'donemsg',text:msg})])));

    if(afterEnd){
      wrap.appendChild(tabIn('today',h('div',{class:'banner',text:'The plan is finished. Ask Claude for a January plan whenever you want one.'})));
    }

    var nsEl=numbersStrip();nsEl.classList.add('nsw');wrap.appendChild(tabIn('today',nsEl));
    wrap.appendChild(tabIn('today',boardSection()));
    var nxg=nextGroup();if(nxg) wrap.appendChild(tabIn('plan',nxg));
    wrap.appendChild(tabIn('plan',laterGroup()));
    var wg=wayGroup(),ig=ideaGroup(),cg=contentGroup();
    if(wg) wrap.appendChild(tabIn('ideas',wg));
    if(ig) wrap.appendChild(tabIn('ideas',ig));
    if(cg) wrap.appendChild(tabIn('ideas',cg));
    if(!wg&&!ig&&!cg) wrap.appendChild(tabIn('ideas',emptyCard('No ideas yet','Add one with the + line on Today or Notes and it will show up here.')));
    if(viewing<=today){var ng=noteGroup();if(ng){ng.id='note-sec';wrap.appendChild(tabIn('notes',ng));} else wrap.appendChild(tabIn('notes',emptyCard('No notes yet','Tap “Add a note or idea” above. Claude reads new notes within the hour and files them.')));}


    if(plan.pace){
      var n=R.workingDaysLeft(viewing);
      wrap.appendChild(tabIn('plan',h('div',{class:'card'},[
        h('h2',{text:'Pace check'}),
        h('p',{text:'Working days left: '+n+' (Mon–Sat, minus Dec 25–26).'}),
        h('p',{text:'Tell Claude how many contacts are not yet reached. Divide by '+n+' for your daily number.'})
      ])));
    }

    wrap.appendChild(tabIn('notes',h('div',{class:'card'},[
      h('h2',{text:'Need a hand?'}),
      h('p',{text:'Tap the daily notification, or open any chat with Claude and send this. Claude walks you through one tiny step at a time.'}),
      h('div',{class:'say'},[
        h('code',{text:'Today’s 3, go'}),
        h('button',{class:'pill',id:'copy',text:'Copy'})
      ]),
      h('p',{text:'A task you swipe left goes back on the board and gets a new day on the calendar.'})
    ])));

    var cal=h('div',{class:'cal'});
    'MTWTFSS'.split('').forEach(function(l){cal.appendChild(h('div',{class:'dh',text:l}));});
    var d='2026-11-09';
    while(d<='2027-01-03'){
      if(d<R.START||d>R.END){
        cal.appendChild(h('div',{class:'cell gap'}));
      } else {
        var ph=R.phaseOf(d);
        var full=doneCount(d)===3;
        var moved=D.eff[d].some(function(t){return t.moved;});
        var cls='cell'+(ph.id==='vac'?' vac':'')+(full?' full':'')+(d===today?' today':'')+(d===viewing?' sel':'');
        var dayNum=Number(d.slice(8));
        var mon=(dayNum===1||d===R.START)?h('small',{text:fmtDate(d,{month:'short'})}):null;
        cal.appendChild(h('button',{class:cls,'data-d':d,'aria-label':longDate(d)+(full?', all done':'')+(moved?', has a moved task':'')},[mon,h('span',{text:String(dayNum)}),moved?h('i',{class:'dot'}):null]));
      }
      d=R.add(d,1);
    }
    var legend=h('ul',{class:'legend'},[
      h('li',{},[h('b',{text:'Nov 14–20'}),h('span',{text:'Foundation and course enrolment'})]),
      h('li',{},[h('b',{text:'Nov 21–29'}),h('span',{text:'Vacation and commercial licence study'})]),
      h('li',{},[h('b',{text:'Nov 30–Dec 9'}),h('span',{text:'Warm contacts first'})]),
      h('li',{},[h('b',{text:'Dec 10–20'}),h('span',{text:'Everyone else'})]),
      h('li',{},[h('b',{text:'Dec 21–31'}),h('span',{text:'Finish and year-end'})]),
      h('li',{},[h('b',{html:'<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--blue);margin-right:6px;vertical-align:middle"></span>Dot'}),h('span',{text:'A task moved here from another day'})])
    ]);
    var calG=grp('The whole plan',h('div',{class:'cal-card'},[cal,legend]));if(calG&&calG.classList) calG.classList.add('plan-cal');
    wrap.appendChild(tabIn('plan',calG));
    footEl=h('p',{class:'foot',text:footText()});
    wrap.appendChild(tabIn('today notes',footEl));
    renderSync();

    if(typeof focusIdx==='number'){
      var f=app.querySelector('.swipe[data-i="'+focusIdx+'"] .front');
      if(f&&f.focus) f.focus({preventScroll:true});
    }
    kbScroll();
    renderFocus();
  }

  /* ================= Board: Backlog | Today | Doing | Done =================
     One card per task. Every card has small steps (about 2 minutes each). Start opens one step at a time.
     Only one card can be Doing. A task pushed twice shrinks to its first step. Steps, Doing and push counts are saved in the same document. */
  var ST=window.ROSSTEPS;
  function keyOf(t){return t.oid||t.id;}
  function genSteps(t){return ST.forTask(t,people).map(function(x){return {t:x.t,m:x.m,d:0};});}
  function getSteps(t){var e=steps[keyOf(t)];return (e&&e.s)?e.s:genSteps(t);}
  function matSteps(t){
    var k=keyOf(t);
    if(!steps[k]||!steps[k].s) steps[k]={s:genSteps(t)};
    return steps[k].s;
  }
  function nextIdx(arr){for(var i=0;i<arr.length;i++){if(!arr[i].d) return i;}return -1;}
  function stat(arr){var d=0,left=0;arr.forEach(function(x){if(x.d) d++; else left+=(x.m||0);});return {done:d,total:arr.length,left:left,all:d===arr.length&&arr.length>0};}
  function minsTxt(n){return n<=0?'':(n<=1?'1 min':'about '+n+' min');}
  function findTaskByKey(key){
    var arr=D.eff[viewing]||[];
    for(var i=0;i<arr.length;i++){if(keyOf(arr[i])===key) return {t:arr[i],i:i};}
    return null;
  }
  function doingNow(){
    if(!doing||doing.d!==viewing) return null;
    var f=findTaskByKey(doing.key);
    if(!f) return null;
    var oc=outcomes[viewing]||[];
    if(oc[f.i]) return null;
    return doing.key;
  }
  /* The first undone step, or for a task pushed twice, only the very first step. */
  function shrunk(t){return (pushes[keyOf(t)]||0)>=2;}
  function firstReal(arr){for(var i=0;i<arr.length;i++){if(!arr[i].p) return i;}return -1;}
  function shrunkDone(t,arr){var fr=firstReal(arr);return shrunk(t)&&fr>=0&&!!arr[fr].d;}
  function startTask(i){
    var t=(D.eff[viewing]||[])[i];if(!t) return;
    var arr=matSteps(t);
    if(!arr.length||!arr[0].p){arr.unshift({t:'Opened this card',m:0,d:1,p:1});}
    doing={key:keyOf(t),d:viewing};
    focusKey=keyOf(t);
    persist();render();
  }
  function stopTask(){doing=null;focusKey=null;persist();render();}
  function pushTask(i){
    var t=(D.eff[viewing]||[])[i];if(!t) return;
    var k=keyOf(t);
    pushes[k]=(pushes[k]||0)+1;
    if(doing&&doing.key===k) doing=null;
    if(focusKey===k) focusKey=null;
    setOutcome(viewing,i,'missed');
  }
  function finishTask(i){
    var t=(D.eff[viewing]||[])[i];if(!t) return;
    var k=keyOf(t);
    if(doing&&doing.key===k) doing=null;
    if(focusKey===k) focusKey=null;
    delete pushes[k];
    setOutcome(viewing,i,'done');
  }
  function tickStep(key,n){
    var f=findTaskByKey(key);if(!f) return;
    var arr=matSteps(f.t);
    if(arr[n]) arr[n].d=arr[n].d?0:1;
    persist();render();
  }
  function addStep(key,txt){
    var f=findTaskByKey(key);txt=String(txt||'').trim().slice(0,140);
    if(!f||!txt) return;
    matSteps(f.t).push({t:txt,m:2,d:0});
    persist();render();
  }

  function numbersStrip(){
    var kids=[];
    if(cd&&typeof cd.contacts==='number'){
      var pct=Math.max(0,Math.min(100,Number(cd.pct)||0));
      kids.push(h('div',{class:'ns-top'},[
        h('span',{class:'ns-main'},[h('b',{text:fmtN(cd.reached||0)}),h('span',{text:' of '+fmtN(cd.contacts)+' reached'})]),
        h('a',{class:'ns-link',href:'home.html',text:'All numbers ›'})
      ]));
      kids.push(h('div',{class:'bar'},[h('i',{style:'width:'+pct+'%'})]));
      kids.push(h('div',{class:'ns-chips'},[
        h('div',{},[h('b',{text:String(cd.dueToday||0)}),h('span',{text:'due'})]),
        h('div',{},[h('b',{text:String(cd.touchesToday||0)}),h('span',{text:'touches'})]),
        h('div',{},[h('b',{text:String(cd.emailsToday||0)}),h('span',{text:'emails'})])
      ]));
    } else {
      kids.push(h('div',{class:'ns-top'},[h('span',{class:'ns-main'},[h('span',{text:'Loading your numbers…'})]),h('a',{class:'ns-link',href:'home.html',text:'All numbers ›'})]));
    }
    return h('div',{class:'card nstrip'},kids);
  }

  function tagRow(t,extra){
    return h('div',{class:'kicker'},[
      t.role?h('span',{class:'role',text:t.role}):null,
      h('span',{class:'tag t-'+String(t.tag||'').toLowerCase().replace(/[^a-z]/g,''),text:t.tag}),
      t.mins?h('span',{class:'mins',text:t.mins+' min'}):null,
      t.moved?h('span',{class:'chip-mv',text:'Moved from '+R.shortDay(t.from)}):null,
      extra||null
    ]);
  }
  function stepsList(key,arr,editable){
    var ul=h('ul',{class:'kc-steps'});
    arr.forEach(function(x,n){
      var b=h('button',{class:'kc-ck'+(x.d?' on':''),'data-act':'st-tog','data-key':key,'data-n':String(n),'aria-label':(x.d?'Mark not done: ':'Mark done: ')+x.t,'aria-pressed':x.d?'true':'false',html:x.d?CHECK:''});
      if(!editable) b.disabled=true;
      ul.appendChild(h('li',{class:x.d?'done':''},[b,h('span',{class:'kc-st'},[h('span',{text:x.t}),x.m?h('small',{text:x.m+' min'}):null])]));
    });
    return ul;
  }
  function addStepRow(key){
    return h('div',{class:'ltadd'},[
      h('input',{type:'text',maxlength:'140',placeholder:'Add a step',enterkeyhint:'done',autocomplete:'off','data-stin':key}),
      h('button',{class:'lnk','data-act':'st-add','data-key':key,text:'Add'})
    ]);
  }
  function progressBlock(arr){
    var s=stat(arr);
    var pctd=s.total?Math.round(s.done*100/s.total):0;
    return h('div',{class:'kc-prog'},[
      h('div',{class:'bar','aria-hidden':'true'},[h('i',{style:'width:'+pctd+'%'})]),
      h('span',{class:'num',text:s.done+' of '+s.total+' steps'+(s.left>0?' · '+minsTxt(s.left)+' left':'')})
    ]);
  }

  function cardEl(t,i,col){
    var key=keyOf(t),x=tinfo(t.title),arr=getSteps(t),s=stat(arr),open=(stepOpen===key),pc=pushes[key]||0;
    var nx=nextIdx(arr),kids=[];
    kids.push(tagRow(t,pc>0?h('span',{class:'chip-push',text:'Pushed '+pc+'×'}):null));
    kids.push(h('p',{class:'kc-title',text:x.head}));
    if(col==='done'){
      kids.push(h('div',{class:'stline'},[h('span',{class:'ok',text:'Done'}),h('button',{class:'lnk','data-act':'undo','data-i':String(i),text:'Undo'})]));
      return h('li',{class:'kc done','data-key':key},kids);
    }
    if(shrunk(t)&&col!=='doing'&&!shrunkDone(t,arr)){
      var fr0=firstReal(arr),m0=fr0>=0?arr[fr0].m:0;
      kids.push(h('p',{class:'kc-shrink',text:'Pushed twice. Today, do only the first step'+(m0?' ('+m0+' min)':'')+'.'}));
    }
    var started=!!(arr.length&&arr[0].p);
    if(started||s.done>0||col==='doing') kids.push(progressBlock(arr));
    else kids.push(h('p',{class:'kc-meta',text:arr.length+' steps'+(s.left>0?' · '+minsTxt(s.left):'')}));
    if(nx>=0&&!s.all){
      kids.push(h('div',{class:'kc-next'},[h('span',{class:'kc-lbl',text:(started?'Next step':'First step')+(arr[nx].m?' · '+arr[nx].m+' min':'')}),h('span',{class:'kc-nt',text:arr[nx].t})]));
    } else if(s.all){
      kids.push(h('p',{class:'kc-allset',text:'All steps done. Finish it.'}));
    }
    var acts=h('div',{class:'kc-acts'});
    if(col==='today'){
      acts.appendChild(h('button',{class:'btnp','data-act':'bd-start','data-i':String(i),text:started?'Continue':'Start'}));
    } else {
      acts.appendChild(s.all?h('button',{class:'btnp','data-act':'bd-done','data-i':String(i),text:'Finish'}):h('button',{class:'btnp','data-act':'bd-focus','data-key':key,text:'Open step'}));
    }
    acts.appendChild(h('button',{class:'btng','data-act':'bd-open','data-key':key,'aria-expanded':open?'true':'false',text:open?'Hide steps':'Show steps'}));
    kids.push(acts);
    if(open){
      kids.push(stepsList(key,arr,true));
      kids.push(addStepRow(key));
      var more=h('div',{class:'kc-more'});
      if(x.desc&&x.desc!==x.head) more.appendChild(h('p',{class:'dtext',text:x.desc}));
      if(t.where) more.appendChild(h('p',{class:'where',text:'Where: '+t.where}));
      if(t.hint) more.appendChild(h('p',{class:'hint',text:t.hint}));
      kids.push(more);
      var sec=h('div',{class:'kc-sec'});
      if(col==='doing') sec.appendChild(h('button',{class:'lnk','data-act':'bd-stop',text:'Back to Today'}));
      if(!s.all&&(started||s.done>0)) sec.appendChild(h('button',{class:'lnk','data-act':'bd-done','data-i':String(i),text:'Mark the whole task done'}));
      sec.appendChild(h('button',{class:'lnk warnl','data-act':'bd-push','data-i':String(i),text:'Not today'}));
      kids.push(sec);
    } else {
      kids.push(h('div',{class:'kc-sec'},[h('button',{class:'lnk warnl','data-act':'bd-push','data-i':String(i),text:'Not today'})]));
    }
    return h('li',{class:'kc '+col+(shrunk(t)?' shr':''),'data-key':key},kids);
  }

  /* Backlog: everything that is not for this day. Pushed tasks, follow-ups due, the next days of the plan, and Later. */
  function backlogCards(){
    var out=[],n=0;
    if(cd&&cd.dueToday>0){
      out.push({g:'Follow-ups',el:h('li',{class:'bc people'},[
        h('p',{class:'kc-title',text:fmtN(cd.dueToday)+' people are due for a follow-up'}),
        h('p',{class:'meta',text:'Your reach tasks pick the first ones for you.'}),
        h('a',{class:'btng',href:CD_URL+'#today',text:'Open Clients ›'})
      ])});n++;
    }
    D.board.forEach(function(e){
      var line=e.status==='placed'?'Moved to '+R.shortDay(e.to):(e.status==='absorbed'&&e.to?'Comes back '+R.shortDay(e.to):(e.status==='absorbed'?'No catch-up needed':'Needs Claude to place it'));
      var kids=[h('p',{class:'kc-title',text:tinfo(e.title).head}),h('p',{class:'meta',text:'From '+R.shortDay(e.from)+(e.mins?' · '+e.mins+' min':'')+' · '+line}),h('p',{class:'why',text:e.why})];
      if(e.to) kids.push(h('button',{class:'btng','data-act':'goto','data-d':e.to,text:'Open '+R.shortDay(e.to)+' ›'}));
      out.push({g:'Pushed',el:h('li',{class:'bc pushed'},kids)});n++;
    });
    var up=nextTasks(),lim=upOpen?up.length:5;
    up.slice(0,lim).forEach(function(u){
      var key=keyOf(u.t),open=(stepOpen==='b:'+key),arr=getSteps(u.t),s=stat(arr);
      var kids=[h('p',{class:'kc-title',text:tinfo(u.t.title).head}),
        h('p',{class:'meta',text:R.shortDay(u.d)+' · '+u.t.tag+' · '+arr.length+' steps'+(s.left>0?' · '+minsTxt(s.left):'')})];
      if(open){
        kids.push(stepsList(key,arr,false));
        if(u.t.where) kids.push(h('p',{class:'where',text:'Where: '+u.t.where}));
      }
      kids.push(h('div',{class:'kc-acts'},[
        h('button',{class:'btng','data-act':'bd-bopen','data-key':'b:'+key,text:open?'Hide steps':'See steps'}),
        h('button',{class:'btng','data-act':'goto','data-d':u.d,text:'Open day ›'})
      ]));
      out.push({g:'Coming up',el:h('li',{class:'bc up'},kids)});n++;
    });
    if(up.length>5){
      out.push({g:'Coming up',el:h('li',{class:'bc'},[h('button',{class:'lnk','data-act':'bd-upmore',text:upOpen?'Show fewer':'Show '+(up.length-5)+' more days'})])});
    }
    later.filter(function(x){return !x.done;}).forEach(function(x){
      out.push({g:'Later',el:h('li',{class:'bc later'},[
        h('p',{class:'kc-title',text:x.title}),x.note?h('p',{class:'meta',text:x.note}):null,
        h('div',{class:'kc-acts'},[h('button',{class:'btng','data-act':'later-tog','data-id':x.id,text:'Mark done'}),h('button',{class:'lnk','data-act':'later-del','data-id':x.id,text:delArm===x.id?'Tap again':'Remove'})])
      ])});n++;
    });
    return {cards:out,count:n};
  }
  function backlogCol(){
    var b=backlogCards(),ul=h('ul',{class:'kc-list'}),last='';
    b.cards.forEach(function(c){
      if(c.g!==last){ul.appendChild(h('li',{class:'kc-grp',text:c.g}));last=c.g;}
      ul.appendChild(c.el);
    });
    if(!b.cards.length) ul.appendChild(h('li',{class:'kc-empty',text:'Nothing waiting.'}));
    ul.appendChild(h('li',{class:'kc-grp',text:'Add to Later'}));
    ul.appendChild(h('li',{class:'bc'},[h('div',{class:'ltadd'},[
      h('input',{id:'bl-later-in',type:'text',maxlength:'140',placeholder:'Add something for later',enterkeyhint:'done',autocomplete:'off'}),
      h('button',{class:'lnk','data-act':'later-add2',text:'Add'})
    ])]));
    ul.appendChild(h('li',{class:'bc'},[h('button',{class:'btng','data-act':'to-plan',text:'See the whole plan ›'})]));
    return {el:ul,count:b.count};
  }

  function boardSection(){
    var tasks=D.eff[viewing]||[],oc=outcomes[viewing]||[],dk=doingNow();
    var td=[],dg=[],dn=[];
    tasks.forEach(function(t,i){
      var st=oc[i];
      if(st==='done') dn.push([t,i]);
      else if(st==='missed') return;
      else if(dk&&keyOf(t)===dk) dg.push([t,i]);
      else td.push([t,i]);
    });
    var bl=backlogCol();
    function col(name,label,items,col2){
      var ul=col2||h('ul',{class:'kc-list'});
      if(!col2){
        items.forEach(function(p){ul.appendChild(cardEl(p[0],p[1],name));});
        if(!items.length){
          var msg={today:oc.some(function(v){return v==='done';})&&!items.length?'Nothing left for today.':'Nothing here.',doing:'Tap Start on a card. One at a time.',done:'Finished cards land here.'}[name]||'Nothing here.';
          ul.appendChild(h('li',{class:'kc-empty',text:msg}));
        }
      }
      return h('section',{class:'kcol c-'+name,'data-col':name,'aria-label':label},[ul]);
    }
    var cols=[col('backlog','Backlog',[],bl.el),col('today','Today',td),col('doing','Doing',dg),col('done','Done',dn)];
    var counts={backlog:bl.count,today:td.length,doing:dg.length,done:dn.length};
    var chips=h('div',{class:'kb-chips',role:'tablist'},[['backlog','Backlog'],['today','Today'],['doing','Doing'],['done','Done']].map(function(c){
      return h('button',{class:'kb-chip'+(colSel===c[0]?' on':''),type:'button','data-act':'kb-col','data-col':c[0],role:'tab','aria-selected':colSel===c[0]?'true':'false'},[h('span',{text:c[1]}),h('b',{class:'num',text:String(counts[c[0]])})]);
    }));
    var kb=h('div',{class:'kb',id:'kb'},cols);
    return h('section',{class:'grp kbwrap'},[chips,kb]);
  }
  function kbPad(kb){return parseFloat(window.getComputedStyle(kb).paddingLeft)||0;}
  function kbPos(kb,c){return c.offsetLeft-kb.offsetLeft-kbPad(kb);}
  function kbScroll(){
    var kb=document.getElementById('kb');if(!kb) return;
    if(kb.scrollWidth<=kb.clientWidth+2) return;
    var c=kb.querySelector('.kcol[data-col="'+colSel+'"]');
    if(c) kb.scrollLeft=(kbLeft!==null?kbLeft:kbPos(kb,c));
  }
  function kbPick(name,smooth){
    colSel=name;kbLeft=null;
    var chips=document.querySelectorAll('.kb-chip');
    for(var i=0;i<chips.length;i++){var on=chips[i].getAttribute('data-col')===name;chips[i].classList.toggle('on',on);chips[i].setAttribute('aria-selected',on?'true':'false');}
    var kb=document.getElementById('kb'),c=kb&&kb.querySelector('.kcol[data-col="'+name+'"]');
    if(kb&&c&&kb.scrollWidth>kb.clientWidth+2){try{kb.scrollTo({left:kbPos(kb,c),behavior:smooth?'smooth':'auto'});}catch(e){kb.scrollLeft=kbPos(kb,c);}}
  }

  /* ---------- focus screen: one step at a time ---------- */
  var foTimer=null,foTick=null;
  function foStop(){if(foTick){clearInterval(foTick);foTick=null;}foTimer=null;}
  function foClock(){
    var el=document.getElementById('fo-clock');if(!el||!foTimer) return;
    var left=Math.max(0,Math.round((foTimer.end-Date.now())/1000));
    var m=Math.floor(left/60),s=left%60;
    el.textContent=left>0?(m+':'+(s<10?'0':'')+s):'Time. Done, or keep going.';
    if(left<=0&&foTick){clearInterval(foTick);foTick=null;}
  }
  function renderFocus(){
    var old=document.getElementById('focus');
    if(old) old.remove();
    document.body.classList.remove('fo-open');
    if(!focusKey) {foStop();return;}
    var f=findTaskByKey(focusKey);
    if(!f){focusKey=null;foStop();return;}
    var t=f.t,arr=getSteps(t),s=stat(arr),n=nextIdx(arr),sh=shrunk(t),fr=firstReal(arr);
    var x=tinfo(t.title);
    var box=h('div',{class:'fo-box'});
    box.appendChild(h('div',{class:'fo-top'},[
      h('p',{class:'fo-kick',text:t.tag+' · '+x.head}),
      h('button',{class:'lnk','data-fo':'close',text:'Close'})
    ]));
    var dots=h('div',{class:'fo-dots','aria-hidden':'true'});
    arr.forEach(function(st,k){if(sh&&k>fr) return;dots.appendChild(h('i',{class:st.d?'on':(k===n?'cur':'')}));});
    box.appendChild(dots);
    if(s.all){
      box.appendChild(h('p',{class:'fo-step',text:'All steps done.'}));
      box.appendChild(h('button',{class:'btnp big','data-fo':'finish',text:'Finish this task'}));
    } else if(sh&&shrunkDone(t,arr)){
      box.appendChild(h('p',{class:'fo-step',text:'That is enough for now.'}));
      box.appendChild(h('p',{class:'fo-m',text:'You did the small version. That is real progress.'}));
      box.appendChild(h('button',{class:'btnp big','data-fo':'keep',text:'Keep going ('+(arr.length-fr-1)+' more)'}));
      box.appendChild(h('button',{class:'btng big','data-fo':'later',text:'Stop here, back to Today'}));
    } else {
      var idx=(sh&&fr>=0&&n>=0&&n<fr)?fr:n;
      box.appendChild(h('p',{class:'fo-count',text:sh?'Just this one':'Step '+(idx+1)+' of '+arr.length}));
      box.appendChild(h('p',{class:'fo-step',text:arr[idx].t}));
      if(sh) box.appendChild(h('p',{class:'fo-m',text:'Pushed twice, so only this step for now.'}));
      else if(arr[idx].m) box.appendChild(h('p',{class:'fo-m',text:'About '+arr[idx].m+' min'}));
      box.appendChild(h('p',{class:'fo-clock',id:'fo-clock','aria-live':'polite',text:''}));
      box.appendChild(h('button',{class:'btnp big','data-fo':'done',text:(idx===arr.length-1)?'Done. Finish':'Done. Next step'}));
      var row=h('div',{class:'fo-row'});
      row.appendChild(h('button',{class:'btng','data-fo':'timer',text:foTimer?'Restart timer':(arr[idx].m>=2?'Start a '+Math.min(arr[idx].m,5)+'-minute timer':'Start a 1-minute timer')}));
      if(!sh&&arr.length-n>1) row.appendChild(h('button',{class:'btng','data-fo':'skip',text:'Skip this step'}));
      box.appendChild(row);
    }
    box.appendChild(h('button',{class:'lnk warnl fo-push','data-fo':'push',text:'Not today'}));
    var ov=h('div',{id:'focus',class:'fo',role:'dialog','aria-modal':'true','aria-label':'Focus: '+x.head},[box]);
    document.body.appendChild(ov);
    document.body.classList.add('fo-open');
    foClock();
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('#focus [data-fo]');
    if(!b||!focusKey) return;
    var a=b.getAttribute('data-fo'),f=findTaskByKey(focusKey);
    if(!f){focusKey=null;renderFocus();return;}
    var arr=matSteps(f.t),n=nextIdx(arr);
    if(shrunk(f.t)){var fr2=firstReal(arr);if(fr2>=0&&n>=0&&n<fr2) n=fr2;}
    if(a==='close'){foStop();focusKey=null;renderFocus();return;}
    if(a==='done'){if(n>=0) arr[n].d=1;foStop();persist();render();return;}
    if(a==='skip'){if(n>=0){var sk=arr.splice(n,1)[0];arr.push(sk);}foStop();persist();render();return;}
    if(a==='timer'){var mm=(n>=0&&arr[n].m>=2)?Math.min(arr[n].m,5):1;foStop();foTimer={end:Date.now()+mm*60000};foTick=setInterval(foClock,1000);foClock();renderFocus();return;}
    if(a==='finish'){foStop();finishTask(f.i);return;}
    if(a==='keep'){delete pushes[keyOf(f.t)];foStop();persist();render();return;}
    if(a==='later'){foStop();doing=null;focusKey=null;persist();render();return;}
    if(a==='push'){foStop();pushTask(f.i);return;}
  });


  /* ---------- notes: what you did that was not on the list ---------- */
  function noteFocused(){var a=document.activeElement;return listening||!!(a&&(a.id==='note-in'||a.id==='later-in'||a.id==='bl-later-in'||(a.hasAttribute&&(a.hasAttribute('data-askbox')||a.hasAttribute('data-stin')))));}
  function noteTime(n){
    if(n.src==='chat') return 'Added from your chat with Claude';
    try{return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',hour:'numeric',minute:'2-digit'}).format(new Date(n.ts));}catch(e){return '';}
  }
  function stOf(n){return n.st||(n.ai?'done':'sent');}
  function stamp(ts){
    if(!ts) return '';
    try{return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(ts));}catch(e){return '';}
  }
  function isFresh(n){return !!n.doneAt&&(Date.now()-new Date(n.doneAt).getTime())<86400000;}
  function byWord(n){return n.by==='chat'?' in chat':(n.by==='daily'?' in the daily check':(n.by==='page'?' on this page':''));}
  function stepsEl(n){
    var st=stOf(n),lvl=st==='done'?3:(st==='read'?2:1),names=['Sent','Read by Claude','Processed'];
    return h('div',{class:'steps','aria-label':'Status: '+names[lvl-1]},names.map(function(nm,i){
      var cur=(lvl===2&&i===1);
      return h('span',{class:'stp'+(cur?' cur':(i<lvl?' on':'')),text:(i<lvl&&!cur?'✓ ':'')+nm});
    }));
  }
  function receiptLines(n){
    var out=[],ai=n.ai||{};
    if(n.readAt) out.push(h('small',{class:'rc',text:'✓ Read by Claude'+byWord(n)+' · '+stamp(n.readAt)}));
    (ai.receipt||[]).forEach(function(t){out.push(h('small',{class:'rc',text:'✓ '+t}));});
    if(n.arch&&n.doneAt) out.push(h('small',{class:'rc',text:'✓ Archived · '+stamp(n.doneAt)}));
    if(ai.note) out.push(h('small',{class:'ai',text:ai.note}));
    return out;
  }
  function noteRow(n,archived){
    var st=stOf(n),body=[h('p',{text:n.text}),h('small',{text:noteTime(n)})];
    body.push(stepsEl(n));
    if(analyzing[n.id]){}
    else if(st==='sent') body.push(h('small',{class:'ai',text:'Not read yet. Claude reads it when you tell Claude in a chat, or in your daily check.'}));
    else if(st==='read') body.push(h('small',{class:'ai',text:'Claude has read it and is working on it.'}));
    receiptLines(n).forEach(function(x){body.push(x);});
    aiLines(n).forEach(function(x){body.push(x);});
    return h('li',{class:isFresh(n)?'fresh':''},[
      h('div',{class:'nbody'},body),
      h('button',{class:'lnk','data-act':'note-del','data-id':n.id,text:'Remove'})
    ]);
  }
  var KINDS={
    reel:{tag:'REEL IDEA',steps:['Recorded','Edited','Posted'],word:'Reel'},
    carousel:{tag:'CAROUSEL IDEA',steps:['Written','Designed','Posted'],word:'carousel'},
    post:{tag:'POST IDEA',steps:['Written','Photo ready','Posted'],word:'post'},
    story:{tag:'STORY IDEA',steps:['Recorded','Edited','Posted'],word:'Story'},
    way:{tag:'PROSPECTING',steps:['Planned','Tried','Reviewed'],word:'prospecting idea'}
  };
  var CODE={RI:'reel',CI:'carousel',PI:'post',SI:'story'};
  function splitIdeas(txt){
    var found=[],rest=[];
    String(txt).split(/\r?\n/).forEach(function(ln){
      var m=/^\s*(RI|CI|PI|SI)\b[\s:\-\u2013\u2014.]*(\S.*)$/.exec(ln);
      if(m){found.push({kind:CODE[m[1]],text:m[2].trim()});return;}
      m=/^\s*(reel|carousel|post|story)\s+idea\b[\s:\-\u2013\u2014.]*(\S.*)$/i.exec(ln);
      if(m){found.push({kind:m[1].toLowerCase(),text:m[2].trim()});return;}
      m=/^\s*(ri|ci|pi|si)\s*[:\-\u2013\u2014]\s*(\S.*)$/i.exec(ln);
      if(m){found.push({kind:CODE[m[1].toUpperCase()],text:m[2].trim()});return;}
      m=/^(.*?[.;!?])\s+(RI|CI|PI|SI)\s*[:\-\u2013\u2014]\s*(\S.*)$/.exec(ln);
      if(m){rest.push(m[1]);found.push({kind:CODE[m[2]],text:m[3].trim()});return;}
      rest.push(ln);
    });
    return {found:found,rest:rest.join('\n').trim()};
  }
  function hasIdea(t){var k=t.toLowerCase();return ideas.some(function(i){return String(i.text).toLowerCase()===k;});}
  function findIdea(id){for(var i=0;i<ideas.length;i++){if(ideas[i].id===id) return ideas[i];}return null;}
  function ideaTog(id,k){
    var it=findIdea(id);if(!it||!/^(rec|edit|post)$/.test(k)) return;
    if(it[k]){it[k]=0;delete it[k+'At'];}else{it[k]=1;it[k+'At']=new Date().toISOString();}
    persist();render();
  }
  function ideaDel(id){ideas=ideas.filter(function(i){return i.id!==id;});if(openIdea===id) openIdea=null;persist();render();}
  function requestText(it){
    var k=KINDS[it.kind]||KINDS.reel;
    if(it.kind==='way') return 'Write the plan and opening message for my prospecting idea: "'+it.text+'"'+((it.ask&&it.ask.note)?' ('+it.ask.note+')':'')+'. Use my style rules and flag any details I still need to give you.';
    return 'Write the script for my '+k.tag.toLowerCase()+': "'+it.text+'"'+((it.ask&&it.ask.note)?' ('+it.ask.note+')':'')+'. Use my style rules and flag any details I still need to give you.';
  }
  function scriptPrompt(it){
    var kind=it.kind||'reel';
    var fmt={
      reel:'Write a POV walkthrough script for a single continuous take with no cuts: the spoken lines plus short on-screen text cues, about 30 to 45 seconds, with a hook in the first 2 seconds. Then an Instagram caption with a scroll-stopping first line, a closing line that asks viewers to DM one trigger word, and exactly 5 hashtags.',
      carousel:'Write an Instagram carousel: a cover slide with a scroll-stopping hook, then 6 to 8 slides (one idea each, a short headline and one or two lines), and a last slide that asks viewers to DM one trigger word. Then a caption with a hook line and exactly 5 hashtags.',
      post:'Write an Instagram post caption: a scroll-stopping first line, a short feeling-first body, a closing line that asks viewers to DM one trigger word, and exactly 5 hashtags. Add one line suggesting the image.',
      way:'This is a way to find new clients, not a piece of content. Write a short plan Shivam can start this week: who exactly to contact or where to show up, a 2 to 3 line opening message or call opener in plain, warm words, one follow-up message for 3 days later, and one number to track so he knows if it works. Keep it to what one person can do alone in about an hour. Do not invent statistics, names of people or organisations, or prices: if you need one, put it in [square brackets].',
      story:'Write a 3 to 5 frame Instagram Story sequence: for each frame the on-screen text and what to show or say, one sticker idea (poll, question or quiz), and a last frame that asks viewers to DM one trigger word.'
    }[kind]||'';
    return 'You write social content for Shivam, a Realtor with The Modern Real Estate Group at Real Broker in Calgary, Alberta (also Airdrie, Cochrane and Chestermere). His audience is first-time buyers, investors, luxury and estate buyers, acreage buyers and custom-home clients.\n\n'+
      'Idea ('+(KINDS[kind]||KINDS.reel).tag.toLowerCase()+'): '+it.text+'\n'+((it.ask&&it.ask.note)?'Extra notes from Shivam: '+it.ask.note+'\n':'')+'\n'+fmt+'\n\n'+
      'Rules: emotionally resonant, feeling-first language, never a list of features. Plain simple words. Never invent specs, prices, addresses or features: where you need a detail you do not have, put it in [square brackets] and list it at the end under "Missing details". RECA compliance: no unverifiable superlatives (no "best", "#1" or "guaranteed"). Plain text only, no markdown symbols. Write in English unless the extra notes ask for Punjabi or both.';
  }
  function genScript(it){
    if(typeof sampleFn!=='function') return;
    genning[it.id]=1;
    if(it.ask) it.ask.st='writing';
    persist();render();
    var p=null;
    try{p=sampleFn(scriptPrompt(it),{modelTier:'default',cache:false});}catch(e){p=null;}
    var fail=function(){delete genning[it.id];if(it.ask) it.ask.st='asked';persist();render();};
    if(!p){fail();return;}
    Promise.resolve(p).then(function(r){
      var t=String(r&&r.text||'').trim();
      if(!t){fail();return;}
      delete genning[it.id];
      it.script=t.slice(0,4000);it.scriptAt=new Date().toISOString();it.scriptBy='page';
      if(it.ask) it.ask.st='done';
      persist();render();
    }).catch(fail);
  }
  function askScript(id){
    var it=findIdea(id);if(!it) return;
    var ta=document.getElementById('ask-'+id);
    var extra=String(ta?ta.value:(askDraft[id]||'')).trim().slice(0,300);
    it.ask={ts:new Date().toISOString(),note:extra,st:'asked'};
    delete askDraft[id];delete reAsk[id];
    persist();render();
    genScript(it);
  }
  function copyText(bt,txt){
    try{navigator.clipboard.writeText(txt).then(function(){bt.textContent='Copied';},function(){bt.textContent='Copy failed';});}
    catch(err){bt.textContent='Copy failed';}
  }
  function ideaBody(i,k){
    var kids=[];
    var way=(i.kind==='way');
    if(way&&i.how) kids.push(h('p',{class:'how',text:i.how}));
    if(way) kids.push(h('button',{class:'pill wtoday'+(wayAdded[i.id]?' on':''),'data-act':'way-today','data-id':i.id,text:wayAdded[i.id]?'✓ Added to Today':'Add to Today'}));
    var steps=['rec','edit','post'];
    kids.push(h('div',{class:'chk'},steps.map(function(key,n){
      var on=!!i[key];
      return h('button',{class:'ck'+(on?' on':''),'data-act':'idea-tog','data-id':i.id,'data-k':key,role:'checkbox','aria-checked':on?'true':'false',text:k.steps[n]});
    })));
    var sec=h('div',{class:'script'},[h('h4',{text:way?'Plan and message':'Script'})]);
    if(genning[i.id]){
      sec.appendChild(h('small',{class:'ai',text:'Claude is writing the script…'}));
    } else {
      if(i.script){
        sec.appendChild(h('p',{class:'scriptbox',text:i.script}));
        sec.appendChild(h('small',{class:'rc',text:'✓ Script written by Claude'+(i.scriptBy==='chat'?' in chat':(i.scriptBy==='daily'?' in the daily check':' on this page'))+' · '+stamp(i.scriptAt)}));
        sec.appendChild(h('div',{class:'srow'},[
          h('button',{class:'lnk','data-act':'idea-copy','data-id':i.id,'data-w':'script',text:'Copy script'}),
          h('button',{class:'lnk','data-act':'idea-reask','data-id':i.id,text:'Ask again'})
        ]));
      }
      if(!i.script||reAsk[i.id]){
        var ta=h('textarea',{id:'ask-'+i.id,'data-askbox':'1','data-id':i.id,rows:'2',maxlength:'300',placeholder:'Optional: length, tone, language (English, Punjabi or both)','aria-label':'Notes for Claude about the script'});
        ta.value=askDraft[i.id]||'';
        sec.appendChild(ta);
        sec.appendChild(h('button',{class:'pill','data-act':'idea-ask','data-id':i.id,text:i.script?'Ask Claude to rewrite it':(way?'Ask Claude to write the plan and message':'Ask Claude to write the script')}));
        if(i.ask&&!i.script){
          sec.appendChild(h('small',{class:'rc',text:'✓ Asked Claude · '+stamp(i.ask.ts)}));
          sec.appendChild(h('small',{class:'ai',text:'Waiting. Claude writes it when you tell Claude in a chat, or in your daily check. The script shows up here.'}));
          sec.appendChild(h('button',{class:'lnk','data-act':'idea-copy','data-id':i.id,'data-w':'request',text:'Copy request to paste in a chat'}));
        }
      }
    }
    kids.push(sec);
    kids.push(h('button',{class:'lnk idel','data-act':'idea-del','data-id':i.id,text:(delArm===i.id?'Tap again to remove':'Remove this idea')}));
    return h('div',{class:'ibody'},kids);
  }
  function ideaRow(i){
    var k=KINDS[i.kind]||KINDS.reel,open=(openIdea===i.id);
    var n=(i.rec?1:0)+(i.edit?1:0)+(i.post?1:0);
    var head=h('button',{class:'ihead','data-act':'idea-open','data-id':i.id,'aria-expanded':open?'true':'false'},[
      h('span',{class:'imain'},[h('span',{class:'ititle',text:i.text}),h('span',{class:'itag '+(i.kind||'reel'),text:k.tag})]),
      h('span',{class:'iside'},[h('span',{text:n+'/3'}),h('span',{class:'chev'+(open?' up':''),text:'›'})])
    ]);
    var li=h('li',{class:'idea'+(open?' open':'')},[head]);
    if(open) li.appendChild(ideaBody(i,k));
    return li;
  }
  var WAY_AUD=[['investor','Investors'],['estate','Estate buyers'],['both','Both']];
  function wayGroup(){
    var all=ideas.filter(function(i){return i.kind==='way';});
    if(!all.length) return null;
    var fin=function(i){return i.rec&&i.edit&&i.post;};
    var left=all.filter(function(i){return !fin(i);}).length;
    var chips=h('div',{class:'wchips',role:'tablist','aria-label':'Who to prospect for'},WAY_AUD.map(function(a){
      var n=all.filter(function(i){return (i.aud||'both')===a[0]&&!fin(i);}).length,on=wayAud===a[0];
      return h('button',{class:'wchip'+(on?' on':''),role:'tab','aria-selected':on?'true':'false','data-act':'way-aud','data-v':a[0],text:a[1]+' · '+n});
    }));
    var mine=all.filter(function(i){return (i.aud||'both')===wayAud;}).sort(function(a,b){return (fin(a)?1:0)-(fin(b)?1:0);});
    var ul=h('ul',{class:'nlist ideas ways'});
    mine.forEach(function(i){ul.appendChild(ideaRow(i));});
    var kids=[h('p',{class:'wintro',text:'Ways to find investors and estate buyers. Tap one to see how, add it to Today, or ask Claude for a plan and message.'}),chips,mine.length?ul:h('p',{text:'Nothing here yet.'})];
    return grp('Prospecting ideas'+(left?' · '+left+' to try':''),h('div',{class:'card'},kids));
  }
  function ideaGroup(){
    var list=ideas.filter(function(i){return i.kind!=='way';});
    if(!list.length) return null;
    var fin=function(i){return i.rec&&i.edit&&i.post;};
    var todo=list.filter(function(i){return !fin(i);}),done=list.filter(fin);
    var kids=[];
    if(todo.length){
      var ul=h('ul',{class:'nlist ideas'});
      (ideasAll?todo:todo.slice(0,3)).forEach(function(i){ul.appendChild(ideaRow(i));});
      kids.push(ul);
      if(todo.length>3){
        kids.push(h('button',{class:'archhead','data-act':'ideas-all','aria-expanded':ideasAll?'true':'false'},[
          h('span',{text:ideasAll?'Show less':'All ideas · '+todo.length}),
          h('span',{class:'chev'+(ideasAll?' up':''),text:'›'})
        ]));
      }
    }
    else kids.push(h('p',{text:'Nothing waiting. Every idea is posted.'}));
    if(done.length){
      kids.push(h('button',{class:'archhead','data-act':'idea-done-toggle','aria-expanded':doneOpen?'true':'false'},[
        h('span',{text:'Posted · '+done.length}),h('span',{class:'chev'+(doneOpen?' up':''),text:'›'})]));
      if(doneOpen){var dl=h('ul',{class:'nlist ideas'});done.forEach(function(i){dl.appendChild(ideaRow(i));});kids.push(dl);}
    }
    return grp('Content ideas'+(todo.length?' · '+todo.length+' to do':''),h('div',{class:'card'},kids));
  }
  function fmtTime(t){
    var m=/^(\d{1,2}):(\d{2})$/.exec(String(t||''));if(!m) return '';
    var hh=Number(m[1]),ap=hh>=12?'pm':'am';hh=hh%12;if(hh===0) hh=12;
    return hh+':'+m[2]+' '+ap;
  }
  function contentGroup(){
    var end=R.add(viewing,13);
    var posts=content.filter(function(c){return c.date>=viewing&&c.date<=end;}).sort(function(a,b){return (a.date+(a.time||'99'))<(b.date+(b.time||'99'))?-1:1;});
    if(!posts.length) return null;
    var ul=h('ul',{class:'nlist crows'});
    posts.forEach(function(c){
      ul.appendChild(h('li',{},[h('div',{class:'nbody'},[
        h('p',{text:c.title}),
        h('small',{text:R.shortDay(c.date)+(c.time?' · '+fmtTime(c.time):'')+' · '+(c.kind||'Post')+(c.noteId?' · from your note':'')})
      ])]));
    });
    return grp('Content calendar',h('div',{class:'card'},[ul]));
  }
  function composeBlock(){
    var kids=[];
    if(composeOpen){
      var ta=h('textarea',{id:'note-in',rows:'3',maxlength:'600',placeholder:'Type a note. Start a line with RI, CI, PI or SI to save a Reel, carousel, post or story idea.','aria-label':'Add a note'});
      ta.value=draft;
      kids.push(h('div',{class:'card compose'},[
        ta,
        h('div',{class:'note-row'},[
          h('span',{id:'syncpill',class:'sync','aria-live':'polite'}),
          (dict&&!dictBlocked)?h('button',{class:'pill soft'+(listening?' on':''),'data-act':'note-mic','aria-label':listening?'Stop listening':'Speak your note',text:listening?'Stop':'Talk'}):null,
          h('button',{class:'lnk','data-act':'compose-close',text:'Close'}),
          h('button',{class:'pill','data-act':'note-save',text:'Save'})
        ])
      ]));
    } else {
      kids.push(h('button',{class:'addline','data-act':'compose-open','aria-label':'Add a note or idea'},[
        h('span',{class:'plus','aria-hidden':'true',text:'+'}),
        h('span',{class:'addtxt'+(draft?' has':''),text:draft?draft:'Add a note or idea'}),
        h('span',{id:'syncpill',class:'sync','aria-live':'polite'})
      ]));
    }
    if(flash) kids.push(h('small',{class:'rc flash',id:'flashline',text:'✓ '+flash}));
    return h('div',{class:'compose-wrap'},kids);
  }
  function noteGroup(){
    var inbox=notes.filter(function(n){return !n.arch;}).sort(function(a,b){return a.ts<b.ts?1:-1;});
    var arch=notes.filter(function(n){return n.arch;}).sort(function(a,b){return (a.doneAt||a.ts)<(b.doneAt||b.ts)?1:-1;});
    if(!inbox.length&&!arch.length) return null;
    var kids=[];
    if(inbox.length){
      var ul=h('ul',{class:'nlist'});
      inbox.forEach(function(n){ul.appendChild(noteRow(n,false));});
      kids.push(h('h3',{class:'nh',text:'Waiting for Claude · '+inbox.length}));
      var al0=autoLine();
      if(al0) kids.push(h('small',{class:'autoline',text:al0}));
      kids.push(ul);
    }
    if(arch.length){
      var fresh=arch.filter(isFresh).length;
      var open=!!archOpen;
      kids.push(h('button',{class:'archhead','data-act':'arch-toggle','aria-expanded':open?'true':'false'},[
        h('span',{text:'Archive · '+arch.length+(fresh?' · '+fresh+' new':'')}),
        h('span',{class:'chev'+(open?' up':''),text:'›'})
      ]));
      if(open){
        var al=h('ul',{class:'nlist'});
        arch.slice(0,8).forEach(function(n){al.appendChild(noteRow(n,true));});
        kids.push(al);
      }
    }
    return grp('Notes',h('div',{class:'card note-card'},kids));
  }
  /* ---------- Realtor OS numbers (read-only copy made by Claude) ---------- */
  function fmtN(n){try{return Number(n).toLocaleString('en-CA');}catch(e){return String(n);}}
  function cdWhen(iso){
    var t=Date.parse(iso);if(!t) return '';
    try{return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(t));}catch(e){return '';}
  }
  function cdGroup(){
    var body;
    if(cd&&typeof cd.contacts==='number'){
      var pct=Math.max(0,Math.min(100,Number(cd.pct)||0));
      var reached=Number(cd.reached)||0,left=Math.max(0,cd.contacts-reached);
      var C=2*Math.PI*42,off=C*(1-pct/100);
      var gauge='<svg class="gauge" viewBox="0 0 100 100" role="img" aria-label="'+pct+' percent reached"><circle class="gt" cx="50" cy="50" r="42"/>'+
        (reached>0?'<circle class="gf" cx="50" cy="50" r="42" transform="rotate(-90 50 50)" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+off.toFixed(2)+'"/>':'<circle class="gd" cx="50" cy="8" r="4.5"/>')+
        '<text x="50" y="57">'+pct+'%</text></svg>';
      body=[
        h('div',{class:'hero-top'},[
          h('div',{html:gauge}),
          h('div',{class:'hero-txt'},[
            h('div',{class:'hlbl',text:'Reached at least once'}),
            h('p',{class:'cdbig'},[h('b',{class:'big',text:fmtN(reached)}),h('span',{class:'big'},[h('small',{text:' of '+fmtN(cd.contacts)})])]),
            h('div',{class:'hsub',text:fmtN(left)+' still to reach'})
          ])
        ]),
        h('div',{class:'tiles'},[
          h('div',{},[h('b',{text:String(cd.touchesToday||0)}),h('span',{text:'touches today'})]),
          h('div',{},[h('b',{text:String(cd.emailsToday||0)}),h('span',{text:'emails today'})]),
          h('div',{},[h('b',{text:String(cd.dueToday||0)}),h('span',{text:'follow-ups due'})])
        ]),
        h('p',{class:'cdnote',text:cd.asOf?'Live from Realtor OS · '+cdWhen(cd.asOf):''})
      ];
    } else {
      body=[
        h('p',{class:'cdline',text:'Loading your Realtor OS numbers…'})
      ];
    }
    body.push(h('div',{class:'cdlinks'},[
      h('a',{class:'cdlink',href:CD_URL,text:'Open Realtor OS'}),
      h('a',{class:'cdlink',href:CD_URL+'#more',text:'Scorecard'}),
      h('a',{class:'cdlink',href:OS_DOC_URL,target:'_blank',rel:'noopener',text:'How it connects'})
    ]));
    return grp('Realtor OS',h('div',{class:'card cd-card'},body));
  }
  /* ---------- Task 1 ticks itself when Realtor OS shows the calls and messages were logged ---------- */
  function edmDay(iso){
    var t=Date.parse(iso);if(!t) return '';
    try{return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));}catch(e){return '';}
  }
  function reachTarget(title){
    var m=/^Call or WhatsApp your (\d+) /i.exec(title)||/^Call (\d+) people/i.exec(title)||/^WhatsApp (\d+) people/i.exec(title)||/^Send (\d+) (personal holiday )?WhatsApps/i.exec(title);
    return m?Number(m[1]):0;
  }
  function cdAuto(){
    if(!synced||!cd||typeof cd.touchesToday!=='number'||!cd.asOf) return;
    var d=today;
    if(edmDay(cd.asOf)!==d) return;
    var tasks=D.eff[d]||[],oc=outcomes[d]||[],changed=false;
    tasks.forEach(function(t,i){
      var N=reachTarget(String(t&&t.title||''));
      if(!N||oc[i]||cd.touchesToday<N) return;
      var id='ncd'+d+'s'+(i+1);
      if(findNote(id)) return;
      putOutcome(d,i,'done');
      var nowIso=new Date().toISOString();
      notes.push({id:id,date:d,text:'Realtor OS shows '+cd.touchesToday+' calls and messages logged today.',ts:nowIso,src:'cd',st:'done',by:'cd',readAt:nowIso,doneAt:nowIso,arch:true,
        ai:{summary:'Ticked from Realtor OS',scoreboard:'',applied:[{date:d,slot:i+1,title:String(t.title||'').slice(0,90),prev:null}],suggested:[],
            receipt:['Ticked done: '+shortTitle(tinfo(t.title).head)+'. Realtor OS logged '+cd.touchesToday+' calls and messages today; the task needs '+N+'.']}});
      changed=true;
    });
    if(changed){persist();render();}
  }
  function nextTasks(){
    var out=[],d=R.add(viewing,1);
    while(d<=R.END&&out.length<10){
      var arr=D.eff[d]||[],oc=outcomes[d]||[];
      for(var i=0;i<arr.length&&out.length<10;i++){if(oc[i]!=='done') out.push({d:d,i:i,t:arr[i]});}
      d=R.add(d,1);
    }
    return out;
  }
  /* Later: things parked for the future. They are not part of the daily 3. */
  function laterAdd(id){
    var el=document.getElementById(id||'later-in');
    var txt=String(el?el.value:'').trim().slice(0,140);
    if(!txt) return;
    later.unshift({id:'l'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),title:txt,note:'',ts:new Date().toISOString(),done:false});
    laterKnown=true;persist();render();
  }
  function laterGroup(){
    var kids=[];
    if(later.length){
      var ul=h('ul',{class:'later'});
      later.forEach(function(x){
        ul.appendChild(h('li',{class:'lt'+(x.done?' done':'')},[
          h('button',{class:'ltck','data-act':'later-tog','data-id':x.id,'aria-label':x.done?'Mark not done':'Mark done',text:x.done?'\u2713':''}),
          h('span',{class:'ltx'},[h('b',{text:x.title}),x.note?h('small',{text:x.note}):null]),
          h('button',{class:'lnk ltdel','data-act':'later-del','data-id':x.id,'aria-label':'Remove',text:(delArm===x.id?'Tap again':'Remove')})
        ]));
      });
      kids.push(ul);
    }
    kids.push(h('div',{class:'ltadd'},[
      h('input',{id:'later-in',type:'text',maxlength:'140',placeholder:'Add something for later',enterkeyhint:'done',autocomplete:'off'}),
      h('button',{class:'lnk','data-act':'later-add',text:'Add'})
    ]));
    return grp('Later',h('div',{class:'card'},kids));
  }
  function nextGroup(){
    var list=nextTasks();
    if(!list.length) return null;
    var kids=[h('button',{class:'nxhead','data-act':'next-toggle','aria-expanded':nextOpen?'true':'false'},[
      h('span',{text:'Next '+list.length}),
      h('span',{class:'chev'+(nextOpen?' up':''),'aria-hidden':'true',text:'›'})
    ])];
    if(nextOpen){
      var ul=h('ul',{class:'nxlist'});
      list.forEach(function(x){
        var key=x.d+'#'+x.i,open=(nextRow===key),info=tinfo(x.t.title);
        var li=h('li',{class:'nxitem'+(open?' open':'')},[
          h('button',{class:'nxrow','data-act':'next-open','data-key':key,'aria-expanded':open?'true':'false'},[
            h('span',{class:'nxday',text:R.shortDay(x.d)}),
            h('span',{class:'nxmain'},[
              h('span',{class:'nxtitle',text:info.head}),
              h('span',{class:'nxmeta',text:x.t.tag+(x.t.mins?' · '+x.t.mins+' min':'')})
            ]),
            h('span',{class:'tchev','aria-hidden':'true',text:'›'})
          ])
        ]);
        if(open){
          li.appendChild(h('div',{class:'nxbody'},[
            h('p',{class:'dtext',text:info.desc}),
            x.t.where?h('p',{class:'where',text:'Where: '+x.t.where}):null,
            x.t.hint?h('p',{class:'hint',text:x.t.hint}):null,
            h('button',{class:'lnk','data-act':'goto','data-d':x.d,text:'Open '+R.shortDay(x.d)+' ›'})
          ]));
        }
        ul.appendChild(li);
      });
      kids.push(ul);
    }
    return h('div',{class:'card nx'},kids);
  }
  function boxSet(live){
    var ta=document.getElementById('note-in');
    if(ta) ta.value=draft+(live?((draft&&!/\s$/.test(draft))?' ':'')+live:'');
  }
  function attachDictation(){}
  function micClick(){
    if(!dict) return;
    if(listening){try{dict.stop();}catch(e){}return;}
    var ta=document.getElementById('note-in');
    if(ta) draft=ta.value;
    var p;
    try{p=dict.start();}catch(e){return;}
    if(p&&p.catch) p.catch(function(err){
      if(err&&err.code==='not_granted'){dictBlocked=true;render();}
    });
  }
  function attachSample(){autoRead={s:'off',code:''};}
  function arErr(err){
    var c=err&&err.code?String(err.code):'';
    if(c==='not_granted') autoRead={s:'denied',code:c};
    else if(c==='rate_limited') autoRead={s:'limit',code:c};
    else autoRead={s:'err',code:c||'error'};
  }
  function autoLine(){return 'Claude reads waiting notes about once an hour, 7am to 10pm.';}
  function retryWaiting(){
    if(!sampleFn||!sampleFn.json) return;
    var n=0;
    notes.forEach(function(x){if(x.st==='sent'&&!x.arch&&!analyzing[x.id]&&n<2){n++;analyzeNote(x);}});
  }
  function shortTitle(t){t=String(t||'');return t.length>60?t.slice(0,58)+'…':t;}
  function aiLines(n){
    var out=[];
    if(analyzing[n.id]){out.push(h('small',{class:'ai',text:'Claude is reading this…'}));return out;}
    var ai=n.ai; if(!ai) return out;
    if(ai.applied&&ai.applied.length){
      if(!(ai.receipt&&ai.receipt.length)) ai.applied.forEach(function(a){
        out.push(h('small',{class:'ai ok',text:'Marked done: '+shortTitle(a.title)+' ('+R.shortDay(a.date)+')'}));
      });
      out.push(h('button',{class:'lnk sm','data-act':'note-undo','data-id':n.id,text:'Undo'}));
    }
    (ai.suggested||[]).forEach(function(a,k){
      out.push(h('small',{class:'ai',text:'Might match: '+shortTitle(a.title)+' ('+R.shortDay(a.date)+')'}));
      out.push(h('button',{class:'lnk sm','data-act':'note-apply','data-id':n.id,'data-k':String(k),text:'Mark done'}));
    });
    if(ai.scoreboard&&!(ai.receipt&&ai.receipt.length)) out.push(h('small',{class:'ai',text:'For your scoreboard: '+ai.scoreboard}));
    return out;
  }
  function ctxLines(){
    var out=[],d0=R.add(R.clamp(today),-1);
    for(var k=0;k<9;k++){
      var d=R.add(d0,k);
      if(d<R.START||d>R.END) continue;
      var arr=D.eff[d]||[],oc=outcomes[d]||[];
      arr.forEach(function(t,i){out.push(d+' slot '+(i+1)+' ['+(t.tag||'')+'] '+t.title+' ('+(oc[i]||'open')+')');});
    }
    return out.join('\n');
  }
  function findNote(id){for(var i=0;i<notes.length;i++){if(notes[i].id===id) return notes[i];}return null;}
  function analyzeNote(n){
    if(!sampleFn||!sampleFn.json) return;
    analyzing[n.id]=1;
    n.st='read';n.readAt=new Date().toISOString();n.by='page';
    persist();render();
    var prompt='You log work for a Calgary realtor. He wrote this note on '+n.date+':\n"'+n.text.replace(/"/g,"'")+'"\n\n'+
      'His planned tasks (date, slot, tag, title, status):\n'+ctxLines()+'\n\n'+
      'Reply with JSON only: {"matches":[{"date":"YYYY-MM-DD","slot":1,"confidence":"high"}],"summary":"under 12 words","scoreboard":"","posts":[{"date":"YYYY-MM-DD","time":"HH:MM","kind":"Reel","title":"under 8 words"}]}\n'+
      'Rules: a match means the note clearly says he did that same task, not something related. Use "high" only when it is clearly the same action, otherwise "medium". Only list tasks whose status is open or missed. Never match a task the note does not mention. "scoreboard" is one short line with any counts he reported (contacts reached, replies, appointments, listings, buyers) exactly as stated, else an empty string. Do not invent numbers. "posts" lists social posts he says he scheduled or will publish on a clear date (kind is Reel, Carousel, Post or Story; time is 24-hour or an empty string; the year is 2026 unless he says otherwise); use an empty list when none.';
    var p=null;
    try{p=sampleFn.json(prompt,{modelTier:'quick',cache:false});}catch(e){p=null;}
    var undo=function(){delete analyzing[n.id];var m=findNote(n.id)||n;m.st='sent';delete m.readAt;delete m.by;persist();render();};
    if(!p){autoRead={s:'off',code:''};undo();return;}
    Promise.resolve(p).then(function(v){autoRead={s:'on',code:''};applyAnalysis(n.id,v);}).catch(function(err){arErr(err);undo();});
  }
  function applyAnalysis(id,v){
    var n=findNote(id);
    delete analyzing[id];
    if(!n){render();return;}
    var ai={summary:String(v&&v.summary||'').slice(0,120),scoreboard:String(v&&v.scoreboard||'').slice(0,160),applied:[],suggested:[]};
    var ms=(v&&Array.isArray(v.matches))?v.matches:[],used={};
    ms.forEach(function(m){
      var d=String(m&&m.date||''),i=Number(m&&m.slot)-1;
      if(!(d>=R.START&&d<=R.END)||!(i>=0&&i<3)||used[d+'#'+i]) return;
      var t=(D.eff[d]||[])[i]; if(!t) return;
      var cur=(outcomes[d]||[])[i]||null;
      if(cur==='done') return;
      used[d+'#'+i]=1;
      var ent={date:d,slot:i+1,title:String(t.title||'').slice(0,90),prev:cur};
      if(m.confidence==='high'){putOutcome(d,i,'done');ai.applied.push(ent);}
      else{ai.suggested.push(ent);}
    });
    var rc=[];
    ai.applied.forEach(function(a){rc.push('Ticked done: '+shortTitle(a.title)+' ('+R.shortDay(a.date)+')');});
    var np=0;
    ((v&&Array.isArray(v.posts))?v.posts:[]).slice(0,6).forEach(function(c){
      var d=String(c&&c.date||''),t=String(c&&c.title||'').trim().slice(0,70);
      if(!(d>='2026-01-01'&&d<='2027-12-31')||!t) return;
      var tm=/^\d{1,2}:\d{2}$/.test(String(c.time||''))?String(c.time):'';
      var kind=/^(Reel|Carousel|Post|Story)$/.test(String(c.kind||''))?c.kind:'Post';
      content.push({id:'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),date:d,time:tm,kind:kind,title:t,noteId:n.id});np++;
    });
    if(np) rc.push(np+(np===1?' post':' posts')+' added to your Content calendar');
    if(ai.scoreboard) rc.push('Counts noted for your scoreboard: '+ai.scoreboard);
    if(!rc.length) rc.push('Nothing on your plan changed. Kept as a log entry.');
    ai.receipt=rc;
    n.ai=ai;n.st='done';n.doneAt=new Date().toISOString();n.arch=true;
    persist();render();
  }
  function noteApply(id,k){
    var n=findNote(id);if(!n||!n.ai||!n.ai.suggested) return;
    var a=n.ai.suggested[k];if(!a) return;
    putOutcome(a.date,a.slot-1,'done');
    n.ai.suggested.splice(k,1);
    (n.ai.applied=n.ai.applied||[]).push(a);
    persist();render();
  }
  function noteUndo(id){
    var n=findNote(id);if(!n||!n.ai||!n.ai.applied) return;
    n.ai.applied.forEach(function(a){putOutcome(a.date,a.slot-1,a.prev||null);});
    n.ai.applied=[];
    persist();render();
  }
  function saveNote(){
    var ta=document.getElementById('note-in');
    var txt=String(ta?ta.value:draft).trim();
    if(!txt){composeOpen=false;render();return;}
    flash='';composeOpen=false;
    setTimeout(function(){flash='';var fe=document.getElementById('flashline');if(fe&&fe.parentNode) fe.parentNode.removeChild(fe);},7000);
    var sp=splitIdeas(txt);
    if(sp.found.length){
      var added=[];
      sp.found.forEach(function(f){
        var t=f.text.slice(0,140);
        if(t&&!hasIdea(t)){ideas.unshift({id:'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),kind:f.kind,text:t,ts:new Date().toISOString(),rec:0,edit:0,post:0});added.push(t+' ('+KINDS[f.kind].word+')');}
      });
      flash=added.length?(added.length>2?'Added '+added.length+' ideas to Content ideas':'Added to Content ideas: '+added.join(' · ')):'That idea is already in Content ideas.';
      txt=sp.rest;
      if(!txt){draft='';try{localStorage.removeItem('ros3:draft');}catch(e){}persist();render();return;}
    }
    var d=viewing<=today?viewing:today;
    var nn={id:'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),date:d,text:txt.slice(0,600),ts:new Date().toISOString(),st:'sent'};
    notes.push(nn);
    if(notes.length>300) notes=notes.slice(-300);
    draft='';try{localStorage.removeItem('ros3:draft');}catch(e){}
    if(sampleFn&&sampleFn.json){analyzeNote(nn);}else{persist();render();}
  }
  function delNote(id){
    notes=notes.filter(function(n){return n.id!==id;});
    persist();render();
  }

  /* ---------- practice swipe (not saved, not part of the plan) ---------- */
  var testState=[null,null,null],testHidden=true;
  try{testHidden=localStorage.getItem('ros3:testShow')!=='1';}catch(e){}
  var TESTS=[
    {title:'Swipe me right. That means done.',where:'Practice only. Nothing here is saved.'},
    {title:'Swipe me left. That means you did not do it.',where:'It would go back on the board.'},
    {title:'Swipe me either way, then tap Undo.',where:''}
  ];
  function testRow(t,i,st){
    var kicker=h('div',{class:'kicker'},[
      h('span',{class:'role',text:'Practice'}),
      h('span',{class:'tag t-test',text:'TEST'})
    ]);
    var stline=null;
    if(st==='done'){
      stline=h('div',{class:'stline'},[h('span',{class:'ok',text:'Done'}),h('button',{class:'lnk','data-act':'t-undo','data-i':String(i),text:'Undo'})]);
    } else if(st==='missed'){
      stline=h('div',{class:'stline'},[
        h('span',{class:'warn',text:'Back on the board'}),
        h('span',{class:'plain',text:'Would move to Sun, Nov 15'}),
        h('button',{class:'lnk','data-act':'t-undo','data-i':String(i),text:'Undo'})
      ]);
    }
    var body=h('div',{class:'tbody'},[
      h('div',{class:'thead'},[h('p',{class:'title',id:'x'+i,text:t.title})]),
      kicker,
      t.where?h('p',{class:'where',text:t.where}):null,
      stline
    ]);
    var stat=h('div',{class:'num',text:String(i+1)});
    var front=h('div',{class:'front'+(st?' '+st:''),tabindex:'0',role:'group','aria-labelledby':'x'+i},[stat,body]);
    return h('li',{class:'swipe','data-i':String(i)},[
      h('div',{class:'under u-done',html:CHECK+'<span>Done</span>'}),
      h('div',{class:'under u-miss',html:'<span>Didn’t do it</span>'+CROSS}),
      front
    ]);
  }
  function testGroup(){
    var ul=h('ul',{class:'list','data-sandbox':'1'});
    TESTS.forEach(function(t,i){ul.appendChild(testRow(t,i,testState[i]||''));});
    var g=grp('Practice swipe',ul);
    g.appendChild(h('p',{class:'note-t',text:'Try it here. These are fake tasks, so nothing is saved and your plan does not change.'}));
    g.appendChild(h('div',{class:'acts'},[
      h('button',{class:'lnk','data-act':'t-reset',text:'Reset'}),
      h('button',{class:'lnk','data-act':'t-hide',text:'Hide practice'})
    ]));
    return g;
  }
  function testSet(i,val){testState[i]=val;render();}

  /* ---------- swipe ---------- */
  var drag=null,pendingRender=false;
  app.addEventListener('pointerdown',function(e){
    var front=e.target.closest&&e.target.closest('.front');
    if(!front||e.target.closest('button')) return;
    if(e.pointerType==='mouse'&&e.button!==0) return;
    drag={el:front,li:front.parentNode,x:e.clientX,y:e.clientY,dx:0,locked:false,id:e.pointerId};
  });
  app.addEventListener('pointermove',function(e){
    if(!drag||e.pointerId!==drag.id) return;
    var dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(!drag.locked){
      if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.2){
        drag.locked=true;
        try{drag.el.setPointerCapture(e.pointerId);}catch(_){}
        drag.el.classList.add('drag');
      } else if(Math.abs(dy)>10){drag=null;return;}
      else return;
    }
    drag.dx=dx;
    drag.el.style.transform='translateX('+dx+'px)';
    drag.li.classList.toggle('right',dx>0);
    drag.li.classList.toggle('left',dx<0);
  });
  function endDrag(e){
    if(!drag||e.pointerId!==drag.id) return;
    var d0=drag;drag=null;
    if(!d0.locked) return;
    noClickUntil=Date.now()+400;
    d0.el.classList.remove('drag');
    var i=Number(d0.li.getAttribute('data-i'));
    var th=Math.min(110,d0.el.offsetWidth*0.3);
    if(d0.dx>=th||d0.dx<=-th){
      var val=d0.dx>0?'done':'missed';
      d0.el.style.transform='translateX('+(d0.dx>0?'110%':'-110%')+')';
      var sb=d0.li.parentNode.hasAttribute('data-sandbox');
      setTimeout(function(){pendingRender=false;if(sb){testSet(i,val);}else{setOutcome(viewing,i,val);}},170);
    } else {
      d0.el.style.transform='';
      d0.li.classList.remove('left','right');
      if(pendingRender){pendingRender=false;render();}
    }
  }
  app.addEventListener('pointerup',endDrag);
  app.addEventListener('pointercancel',endDrag);

  app.addEventListener('keydown',function(e){
    if(e.target&&e.target.id==='later-in'&&e.key==='Enter'){e.preventDefault();laterAdd();return;}
    if(e.target&&e.target.id==='bl-later-in'&&e.key==='Enter'){e.preventDefault();laterAdd('bl-later-in');return;}
    if(e.target&&e.target.hasAttribute&&e.target.hasAttribute('data-stin')&&e.key==='Enter'){e.preventDefault();addStep(e.target.getAttribute('data-stin'),e.target.value);return;}
    var front=e.target.closest&&e.target.closest('.front');
    if(!front||e.target!==front) return;
    var i=Number(front.parentNode.getAttribute('data-i'));
    var sb=front.parentNode.parentNode.hasAttribute('data-sandbox');
    var set=function(v){if(sb){testSet(i,v);}else{setOutcome(viewing,i,v);}};
    if(e.key==='ArrowRight'){e.preventDefault();set('done');}
    else if(e.key==='ArrowLeft'){e.preventDefault();set('missed');}
    else if((e.key==='Enter'||e.key===' ')&&!sb){e.preventDefault();var fk2=viewing+'#'+i;openTask=(openTask===fk2)?null:fk2;render(i);}
  });

  /* ---------- taps ---------- */
  app.addEventListener('input',function(e){
    if(e.target&&e.target.id==='note-in'){draft=e.target.value;try{localStorage.setItem('ros3:draft',draft);}catch(err){}}
    else if(e.target&&e.target.hasAttribute&&e.target.hasAttribute('data-askbox')){askDraft[e.target.getAttribute('data-id')]=e.target.value;}
  });
  app.addEventListener('focusout',function(e){
    if(e.target&&(e.target.id==='note-in'||e.target.id==='later-in'||e.target.id==='bl-later-in'||(e.target.hasAttribute&&(e.target.hasAttribute('data-askbox')||e.target.hasAttribute('data-stin'))))){
      setTimeout(function(){if(pendingRender&&!noteFocused()&&!drag){pendingRender=false;render();}},400);
    }
  });
  app.addEventListener('click',function(e){
    var t=e.target;
    var cell=t.closest&&t.closest('.cell[data-d]');
    if(cell){viewing=cell.getAttribute('data-d');pinned=true;setTab('today',true);render();window.scrollTo(0,0);return;}
    var fr=t.closest&&t.closest('.front');
    if(fr&&t.closest&&t.closest('a')) return;
    if(fr&&!t.closest('button')){
      if(Date.now()<noClickUntil) return;
      var fli=fr.parentNode;
      if(fli.parentNode&&fli.parentNode.hasAttribute('data-sandbox')) return;
      var fi=fli.getAttribute('data-i'),fk=viewing+'#'+fi;
      openTask=(openTask===fk)?null:fk;
      render(Number(fi));
      return;
    }
    var bt=t.closest&&t.closest('button');
    if(!bt) return;
    var act=bt.getAttribute('data-act');
    if(bt.closest&&bt.closest('.subnav')){setTab(bt.getAttribute('data-tab'));return;}
    if(act==='kb-col'){kbPick(bt.getAttribute('data-col'),true);}
    else if(act==='bd-start'){startTask(Number(bt.getAttribute('data-i')));}
    else if(act==='bd-focus'){focusKey=bt.getAttribute('data-key');renderFocus();}
    else if(act==='bd-open'){var ok=bt.getAttribute('data-key');stepOpen=(stepOpen===ok)?null:ok;render();}
    else if(act==='bd-bopen'){var bk=bt.getAttribute('data-key');stepOpen=(stepOpen===bk)?null:bk;render();}
    else if(act==='bd-stop'){stopTask();}
    else if(act==='bd-done'){finishTask(Number(bt.getAttribute('data-i')));}
    else if(act==='bd-push'){pushTask(Number(bt.getAttribute('data-i')));}
    else if(act==='bd-upmore'){upOpen=!upOpen;render();}
    else if(act==='st-tog'){tickStep(bt.getAttribute('data-key'),Number(bt.getAttribute('data-n')));}
    else if(act==='st-add'){var sk=bt.getAttribute('data-key'),si=bt.parentNode.querySelector('input');addStep(sk,si?si.value:'');}
    else if(act==='later-add2'){laterAdd('bl-later-in');}
    else if(act==='to-plan'){setTab('plan');}
    else if(act==='note-mic'){micClick();}
    else if(act==='note-save'){
      if(listening&&dict){try{Promise.resolve(dict.stop()).then(saveNote,saveNote);}catch(e){saveNote();}}
      else{saveNote();}
    }
    else if(act==='later-add'){laterAdd();}
    else if(act==='later-tog'){
      var lid=bt.getAttribute('data-id');
      later.forEach(function(x){if(x.id===lid) x.done=!x.done;});
      persist();render();
    }
    else if(act==='later-del'){
      var ldid=bt.getAttribute('data-id');
      if(delArm===ldid){delArm=null;later=later.filter(function(x){return x.id!==ldid;});persist();render();}
      else{
        delArm=ldid;bt.textContent='Tap again';
        setTimeout(function(){if(delArm===ldid){delArm=null;if(bt.isConnected) bt.textContent='Remove';}},4000);
      }
    }
    else if(act==='idea-tog'){ideaTog(bt.getAttribute('data-id'),bt.getAttribute('data-k'));}
    else if(act==='idea-del'){
      var did=bt.getAttribute('data-id');
      if(delArm===did){delArm=null;ideaDel(did);}
      else{
        delArm=did;bt.textContent='Tap again to remove';
        setTimeout(function(){if(delArm===did){delArm=null;if(bt.isConnected) bt.textContent='Remove this idea';}},4000);
      }
    }
    else if(act==='ideas-all'){ideasAll=!ideasAll;render();}
    else if(act==='way-aud'){wayAud=bt.getAttribute('data-v')||'investor';render();}
    else if(act==='way-today'){var wi=findIdea(bt.getAttribute('data-id'));if(wi&&window.TDAY&&TDAY.add){TDAY.add('Prospecting: '+wi.text,'',TDAY.todayStr());wayAdded[wi.id]=1;render();}}
    else if(act==='idea-done-toggle'){doneOpen=!doneOpen;render();}
    else if(act==='idea-open'){var oid=bt.getAttribute('data-id');openIdea=(openIdea===oid)?null:oid;render();}
    else if(act==='idea-ask'){askScript(bt.getAttribute('data-id'));}
    else if(act==='idea-reask'){reAsk[bt.getAttribute('data-id')]=1;render();}
    else if(act==='idea-copy'){var cit=findIdea(bt.getAttribute('data-id'));if(cit) copyText(bt,bt.getAttribute('data-w')==='script'?String(cit.script||''):requestText(cit));}
    else if(act==='goto-notes'){setTab('notes',true);var el0=document.getElementById('note-sec');if(el0&&el0.scrollIntoView) el0.scrollIntoView({behavior:'smooth',block:'start'});}
    else if(act==='arch-toggle'){archOpen=!archOpen;render();}
    else if(act==='compose-open'){
      composeOpen=true;render();
      var cta=document.getElementById('note-in');if(cta){try{cta.focus();}catch(e){}}
    }
    else if(act==='compose-close'){
      var cta2=document.getElementById('note-in');if(cta2) draft=cta2.value;
      if(listening&&dict){try{dict.stop();}catch(e){}}
      composeOpen=false;render();
    }
    else if(act==='next-toggle'){nextOpen=!nextOpen;if(!nextOpen) nextRow=null;render();}
    else if(act==='next-open'){var nk=bt.getAttribute('data-key');nextRow=(nextRow===nk)?null:nk;render();}
    else if(act==='note-del'){delNote(bt.getAttribute('data-id'));}
    else if(act==='note-undo'){noteUndo(bt.getAttribute('data-id'));}
    else if(act==='note-apply'){noteApply(bt.getAttribute('data-id'),Number(bt.getAttribute('data-k')));}
    else if(act==='t-undo'){testSet(Number(bt.getAttribute('data-i')),null);}
    else if(act==='t-reset'){testState=[null,null,null];render();}
    else if(act==='t-hide'){testHidden=true;try{localStorage.removeItem('ros3:testShow');}catch(e){}render();}
    else if(act==='t-show'){testHidden=false;try{localStorage.setItem('ros3:testShow','1');}catch(e){}render();}
    else if(act==='undo'){
      var i=Number(bt.getAttribute('data-i'));
      setOutcome(viewing,i,null);
    } else if(act==='goto'){
      viewing=bt.getAttribute('data-d');pinned=true;setTab('today',true);render();window.scrollTo(0,0);
    } else if(bt.id==='prev'){viewing=R.clamp(R.add(viewing,-1));pinned=true;render();}
    else if(bt.id==='next'){viewing=R.clamp(R.add(viewing,1));pinned=true;render();}
    else if(bt.id==='jump'){today=todayEdm();afterEnd=today>R.END;viewing=R.clamp(today);pinned=false;recompute();render();}
    else if(bt.id==='copy'){
      try{
        navigator.clipboard.writeText('Today’s 3, go').then(function(){bt.textContent='Copied';},function(){bt.textContent='Type it instead';});
      }catch(err){bt.textContent='Type it instead';}
    }
  });

  var kbT=null;
  app.addEventListener('scroll',function(e){
    var kb=e.target;if(!kb||kb.id!=='kb') return;
    kbLeft=kb.scrollLeft;
    clearTimeout(kbT);
    kbT=setTimeout(function(){
      var cols=kb.querySelectorAll('.kcol'),best=null,bd=1e9;
      for(var i=0;i<cols.length;i++){var d=Math.abs(kbPos(kb,cols[i])-kb.scrollLeft);if(d<bd){bd=d;best=cols[i];}}
      if(best){colSel=best.getAttribute('data-col');
        var chips=document.querySelectorAll('.kb-chip');
        for(var j=0;j<chips.length;j++){var on=chips[j].getAttribute('data-col')===colSel;chips[j].classList.toggle('on',on);chips[j].setAttribute('aria-selected',on?'true':'false');}}
    },90);
  },true);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&focusKey){foStop();focusKey=null;renderFocus();}});

  document.addEventListener('visibilitychange',function(){
    if(document.hidden||pinned) return;
    var nt=todayEdm();
    if(nt!==today){today=nt;afterEnd=today>R.END;viewing=R.clamp(today);recompute();render();}
  });

  /* ---------- pull down to refresh ---------- */
  function ptrMake(){
    if(ptrEl) return ptrEl;
    ptrEl=h('div',{class:'ptr','aria-live':'polite'},[h('span',{class:'ptrin',text:''})]);
    document.body.appendChild(ptrEl);
    return ptrEl;
  }
  function ptrSet(dist,txt,spin){
    var el=ptrMake();
    el.style.transition='';
    el.style.transform='translateY('+(dist-46)+'px)';
    el.style.opacity=dist>6?'1':'0';
    el.firstChild.textContent=txt;
    el.classList.toggle('spin',!!spin);
  }
  function ptrHide(){
    var el=ptrMake();
    el.style.transition='transform .2s ease,opacity .2s ease';
    el.style.transform='translateY(-46px)';
    el.style.opacity='0';
  }
  function atTop(){return (window.pageYOffset||document.documentElement.scrollTop||document.body.scrollTop||0)<=0;}
  function refreshNow(){
    if(ptrBusy) return;
    ptrBusy=true;
    ptrSet(52,'Refreshing…',true);
    var t0=Date.now();
    var finish=function(msg){
      ptrSet(52,msg,false);
      setTimeout(function(){ptrBusy=false;ptrHide();},1300);
    };
    var fallback=function(){
      var p=null;
      try{p=dbPull&&dbPull();}catch(e){p=null;}
      Promise.resolve(p).then(function(){retryWaiting();render();finish('Up to date');}).catch(function(){finish('Could not reach the cloud');});
    };
    var go=function(){
      try{window.location.reload();}catch(e){fallback();return;}
      setTimeout(fallback,3500);
    };
    var wait=function(){
      if(dirty&&!writing) flush();
      if((writing||dirty)&&Date.now()-t0<8000){setTimeout(wait,250);return;}
      if(writing||dirty){finish('Still saving, try again soon');return;}
      go();
    };
    wait();
  }
  var pt=null;
  document.addEventListener('touchstart',function(e){
    pt=null;
    if(ptrBusy||!e.touches||e.touches.length!==1||!atTop()) return;
    var t=e.target;
    if(t&&t.closest&&t.closest('textarea,input,select')) return;
    pt={x:e.touches[0].clientX,y:e.touches[0].clientY,mode:0,dist:0};
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(!pt||ptrBusy) return;
    var t=e.touches[0],dx=t.clientX-pt.x,dy=t.clientY-pt.y;
    if(!pt.mode){
      if(Math.abs(dx)<8&&Math.abs(dy)<8) return;
      if(dy>0&&dy>Math.abs(dx)*1.2&&!(drag&&drag.locked)&&atTop()){pt.mode=1;}
      else{pt=null;return;}
    }
    pt.dist=Math.min(Math.max(dy-8,0)*0.5,80);
    if(e.cancelable) e.preventDefault();
    ptrSet(pt.dist,pt.dist>=56?'Release to refresh':'Pull to refresh',false);
  },{passive:false});
  document.addEventListener('touchend',function(){
    if(!pt) return;
    var p=pt;pt=null;
    if(p.mode!==1) return;
    if(p.dist>=56) refreshNow(); else ptrHide();
  },{passive:true});
  document.addEventListener('touchcancel',function(){
    if(pt&&pt.mode===1) ptrHide();
    pt=null;
  },{passive:true});

  var Store=window.CDStore;
  buildChrome();
  recompute();
  render();
  attachSample();
  function toLogin(){try{window.location.replace('./');}catch(e){}}
  if(!Store||!Store.configured()){toLogin();}
  else{
    Store.getSession().then(function(sess){
      if(!sess){toLogin();return;}
      attachDb();
      loadCd();
      setInterval(function(){if(document.visibilityState==='visible') loadCd();},60000);
      document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'){loadCd();if(dbPull) dbPull().catch(function(){});}});
      window.addEventListener('online',function(){loadCd();if(dbPull) dbPull().catch(function(){});});
    },function(){});
    Store.onAuth(function(ev,sess){if(ev==='SIGNED_OUT'||(!sess&&ev!=='INITIAL_SESSION')) setTimeout(toLogin,0);});
  }
})();
