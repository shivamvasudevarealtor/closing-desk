/* Tasks page for Closing Desk: Today, Plan, Ideas, Notes. Data lives in the os_docs table; numbers come from your contacts. */
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
  var outcomes={},placements={},notes=[],draft='',analyzing={},sampleFn=null,dict=null,listening=false,dictBlocked=false,content=[],archOpen=false,ideas=[],flash='',doneOpen=false,openIdea=null,openTask=null,noClickUntil=0,composeOpen=false,nextOpen=false,nextRow=null,ideasAll=false,delArm=null,askDraft={},genning={},reAsk={};
  var autoRead={s:'wait',code:''},ptrEl=null,ptrBusy=false,dbPull=null,osRef=null,cd=null,cdAt='',CD_URL='./',OS_DOC_URL='https://claude.ai/artifact/D9aSgJEv7WZWE8t2JUXfaw';
  var dbRef=null,synced=false,writing=false,dirty=false,failCount=0,retryT=null,lastSent='',savedT=null,saveMsg='',sentTs={},writeId=0,writeT=null;
  try{
    var raw=localStorage.getItem('ros3:state2');
    if(raw){var s0=JSON.parse(raw);outcomes=s0.outcomes||{};placements=s0.placements||{};notes=Array.isArray(s0.notes)?s0.notes:[];content=Array.isArray(s0.content)?s0.content:[];ideas=Array.isArray(s0.ideas)?s0.ideas:[];}
  }catch(e){}
  try{draft=localStorage.getItem('ros3:draft')||'';}catch(e){}

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
    try{localStorage.setItem('ros3:state2',JSON.stringify({outcomes:outcomes,placements:placements,notes:notes,content:content,ideas:ideas}));}catch(e){}
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
  /* The page keeps one JSON document (notes, ideas, content, outcomes) in the Closing Desk database, table os_docs, row "main".
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
        var before=first?'':JSON.stringify([outcomes,placements,notes,content,ideas]);
        if(v&&v.outcomes&&typeof v.outcomes==='object'){
          outcomes=v.outcomes;placements=v.placements||{};
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
          localSave();
        } else if(first&&(Object.keys(outcomes).length||notes.length||ideas.length||content.length)){
          addLocal=true;
        }
        var wasFirst=first;
        first=false;synced=true;recompute();setTimeout(cdAuto,60);
        if(!wasFirst&&!addLocal&&before===JSON.stringify([outcomes,placements,notes,content,ideas])){renderFoot();return;}
        if(addLocal){persist();}
        if(!drag&&!noteFocused()){render();}else{pendingRender=true;}
      };
      dbPull=function(){
        return Promise.resolve(dbRef.get()).then(function(s){onData(s,true);});
      };
      dbRef.onSnapshot(onData,function(){synced=false;renderFoot();});
  }
  /* Closing Desk numbers are worked out here from the same contacts, with the same rules as the Today page there. */
  function localToday(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
  var cdBusy=false;
  function loadCd(){
    if(cdBusy||!Store||!window.CDStats) return Promise.resolve();
    cdBusy=true;
    return Store.loadAll().then(function(res){
      var s=window.CDStats.compute(res.contacts||[],localToday());
      s.asOf=new Date().toISOString();
      var same=JSON.stringify(s,function(k,v){return k==='asOf'?0:v;})===JSON.stringify(cd,function(k,v){return k==='asOf'?0:v;});
      cd=s;cdAt='';
      cdBusy=false;
      if(!same){if(!drag&&!noteFocused()){render();}else{pendingRender=true;}}
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
  var TI={"Call or WhatsApp your 5 warmest people.": {"head": "Reach your 5 warmest people", "desc": "Open Closing Desk › Today tab and start with the people you know best. A call or a WhatsApp both count. Keep it a friendly check-in, not a pitch."}, "Count your contacts. In the Lists tab, write down total contacts and how many have email, phone and consent. Tell Claude.": {"head": "Count your contacts", "desc": "In the Lists tab, write down total contacts and how many have email, phone and consent. Then tell Claude the numbers."}, "Schedule next Saturday’s 9am Reel and reply to comments.": {"head": "Schedule Saturday's 9am Reel", "desc": "Schedule next Saturday's 9am Reel, then reply to the comments."}, "Read your reached number (or how many people you contacted this week) to Claude.": {"head": "Tell Claude your reached number", "desc": "Read your reached number to Claude. If you do not have one yet, tell Claude how many people you contacted this week."}, "Pick 3 Reel ideas for the week.": {"head": "Pick 3 Reel ideas", "desc": "Pick 3 Reel ideas for the week. Type each one in the notes box below starting with RI and it lands in Content ideas."}, "Do something that is not work. It counts as a task.": {"head": "Take a real break", "desc": "Do something that is not work. It counts as a task, so tick it without guilt."}, "Mark Client consent on past clients: Lists › Select › Email consent.": {"head": "Mark client consent", "desc": "Mark Client consent on your past clients: Lists › Select › Email consent."}, "Pick your commercial course. Claude’s pick for fast AI study is Haskayne ($699). Confirm total hours first.": {"head": "Pick your commercial course", "desc": "Claude's pick for fast AI study is Haskayne ($699). Confirm the total course hours first, then choose."}, "Mark Said yes or Asked me consent on people who agreed or contacted you. Skip anyone you are unsure about.": {"head": "Mark who said yes", "desc": "Mark Said yes or Asked me consent on people who agreed or contacted you. Skip anyone you are unsure about."}, "Enrol and pay for the course and save the login. Haskayne can take up to 72 hours to unlock. Order the HP 10bII+ calculator too.": {"head": "Enrol and pay for the course", "desc": "Enrol, pay and save the login. Haskayne can take up to 72 hours to unlock. Order the HP 10bII+ calculator too."}, "Gmail setup 1/2. Make the Google Cloud project and turn on the Gmail API (README, Email setup step 2). If it is already connected, say done.": {"head": "Gmail setup, part 1 of 2", "desc": "Make the Google Cloud project and turn on the Gmail API (README, Email setup step 2). If it is already connected, say done."}, "Film 2 Reels in one sitting and send the raw clips to the editor so posts go out while you study.": {"head": "Film 2 Reels in one sitting", "desc": "Film 2 Reels in one sitting and send the raw clips to the editor so posts go out while you study."}, "Gmail setup 2/2. Paste the Client ID in the Email tab, test the unsubscribe link, then Connect Gmail.": {"head": "Gmail setup, part 2 of 2", "desc": "Paste the Client ID in the Email tab, test the unsubscribe link, then Connect Gmail."}, "Check the course has unlocked and skim the outline. Your 9-day plan is already on the calendar.": {"head": "Check your course unlocked", "desc": "Check the course has unlocked and skim the outline. Your 9-day plan is already on the calendar."}, "Email #1. Pick a starter, send a test to yourself, check your inbox and your spam folder.": {"head": "Send your first test email", "desc": "Email #1. Pick a starter, send a test to yourself, then check your inbox and your spam folder."}, "Schedule the banked Reels for Nov 21–29.": {"head": "Schedule the banked Reels", "desc": "Schedule the banked Reels for Nov 21–29."}, "Log in and skim the outline. Read the RECA exam blueprint. Domains 1–2 units, then a time-value-of-money drill on the HP 10bII+.": {"head": "Study day 1: outline and blueprint", "desc": "Log in and skim the outline. Read the RECA exam blueprint. Cover the Domains 1–2 units, then do a time-value-of-money drill on the HP 10bII+."}, "Reply to WhatsApp messages.": {"head": "Reply to WhatsApp", "desc": "Reply to your WhatsApp messages."}, "Domain 3, Prospecting and Marketing (14%). Course units, then ask Claude to quiz you on 3.1–3.4.": {"head": "Study day 2: Domain 3", "desc": "Domain 3, Prospecting and Marketing (14%). Do the course units, then ask Claude to quiz you on 3.1–3.4."}, "Send one thinking-of-you WhatsApp to a favourite past client.": {"head": "Thinking-of-you WhatsApp", "desc": "Send one thinking-of-you WhatsApp to a favourite past client."}, "Domain 4, part 1 (48% of the exam). Units for 4.1–4.2, then rent drills: base, additional and percentage rent, rentable and usable.": {"head": "Study day 3: Domain 4, part 1", "desc": "Domain 4 is 48% of the exam. Do the units for 4.1–4.2, then rent drills: base, additional and percentage rent, rentable and usable."}, "Reply to Instagram DMs.": {"head": "Reply to Instagram DMs", "desc": "Reply to your Instagram DMs."}, "Domain 4, part 2. Valuation 4.3: gross income, NOI, cap rates, then DCF, NPV and IRR on the calculator.": {"head": "Study day 4: Domain 4, part 2", "desc": "Valuation 4.3: gross income, NOI and cap rates, then DCF, NPV and IRR on the calculator."}, "Call one warm contact.": {"head": "Call one warm contact", "desc": "Call one warm contact."}, "Domain 4, part 3. Financing 4.4: mortgage payments and balances, loan-to-value, debt coverage, net effective rent.": {"head": "Study day 5: Domain 4, part 3", "desc": "Financing 4.4: mortgage payments and balances, loan-to-value, debt coverage and net effective rent."}, "Reply to emails.": {"head": "Reply to emails", "desc": "Reply to your emails."}, "Domain 5, part 1, Negotiating and Closing (28%). Units for 5.1–5.3, then ask Claude to quiz you.": {"head": "Study day 6: Domain 5, part 1", "desc": "Domain 5, Negotiating and Closing (28%). Do the units for 5.1–5.3, then ask Claude to quiz you."}, "Send 3 WhatsApps from Today. Relationship contacts only.": {"head": "Send 3 WhatsApps", "desc": "Send 3 WhatsApps from Today. Relationship contacts only."}, "Domain 5, part 2. Units for 5.4–5.5, then finish any course units you have not opened.": {"head": "Study day 7: Domain 5, part 2", "desc": "Do the units for 5.4–5.5, then finish any course units you have not opened."}, "Reply to anything still open.": {"head": "Reply to anything still open", "desc": "Reply to anything still open."}, "Mixed practice exam with Claude, weighted 48% Domain 4, 28% Domain 5, 14% Domain 3. Redo your weakest topics.": {"head": "Study day 8: practice exam", "desc": "Mixed practice exam with Claude, weighted 48% Domain 4, 28% Domain 5 and 14% Domain 3. Redo your weakest topics."}, "Call one hot lead.": {"head": "Call one hot lead", "desc": "Call one hot lead."}, "Ask your provider to mark you Ready for Exam in myRECA. Look up the exam fee and date on reca.ca, book it, then do a light review.": {"head": "Study day 9: book the exam", "desc": "Ask your provider to mark you Ready for Exam in myRECA. Look up the exam fee and date on reca.ca, book it, then do a light review."}, "Glance at messages and reply to hot ones only.": {"head": "Quick message check", "desc": "Glance at your messages and reply to the hot ones only."}, "Call 10 people, Tier A first. Leave a 15-second voicemail if there is no answer.": {"head": "Call 10 people", "desc": "Call 10 people, Tier A first. Leave a 15-second voicemail if there is no answer."}, "Start campaign #1 to consented Clients: Email › New campaign › Start. Keep the laptop open.": {"head": "Start campaign #1", "desc": "Start campaign #1 to consented Clients: Email › New campaign › Start. Keep the laptop open."}, "Answer every unanswered message on WhatsApp, Instagram and email.": {"head": "Clear your inboxes", "desc": "Answer every unanswered message on WhatsApp, Instagram and email."}, "Email day. Keep the email campaign running with the laptop open and answer replies.": {"head": "Email day", "desc": "Keep the email campaign running with the laptop open and answer replies."}, "Claude builds a reached counter (X of N reached) into Closing Desk. You test it on one contact.": {"head": "Reached counter", "desc": "Claude builds a reached counter (X of N reached) into Closing Desk. You test it on one contact."}, "Pick this week’s Reel idea and hook with the caption-generator skill.": {"head": "Pick this week's Reel idea", "desc": "Pick this week's Reel idea and its hook with the caption-generator skill."}, "WhatsApp 15 people with a template.": {"head": "WhatsApp 15 people", "desc": "Send a template WhatsApp to 15 people."}, "WhatsApp. Set Tier A/B/C labels in the WhatsApp Business app and decide click-to-chat or continuing API registration.": {"head": "WhatsApp setup", "desc": "Set Tier A/B/C labels in the WhatsApp Business app and decide between click-to-chat or continuing the API registration."}, "Film one Reel in one take, or hand the raw clip to the editor.": {"head": "Film one Reel", "desc": "Film one Reel in one take, or hand the raw clip to the editor."}, "Call 10 people, then call back anyone who replied.": {"head": "Call 10, then call back", "desc": "Call 10 people, then call back anyone who replied."}, "Follow-up sequences. Claude builds Day 3, 7 and 21 reminders. You approve the wording.": {"head": "Follow-up sequences", "desc": "Claude builds Day 3, 7 and 21 reminders. You approve the wording."}, "Message one builder or past client and ask what is new, using the builder-inquiry skill.": {"head": "Message one builder", "desc": "Message one builder or past client and ask what is new, using the builder-inquiry skill."}, "Answer every reply, then message the No-answer people.": {"head": "Answer replies, chase no-answers", "desc": "Answer every reply, then message the No-answer people."}, "Claude builds the weekly scorecard: reached, replies, appointments, listings x/20, buyers x/30. You check it.": {"head": "Weekly scorecard", "desc": "Claude builds the weekly scorecard: reached, replies, appointments, listings x/20 and buyers x/30. You check it."}, "5-minute scoreboard. Tell Claude reached, replies and appointments this week.": {"head": "5-minute scoreboard", "desc": "Tell Claude how many people you reached, how many replied and how many appointments you have this week."}, "Send 10 Instagram DMs to people who watched, commented or replied. No cold pitches.": {"head": "Send 10 Instagram DMs", "desc": "Send 10 Instagram DMs to people who watched, commented or replied. No cold pitches."}, "Facebook Marketplace auto-reply. Claude writes it, you paste it in.": {"head": "Marketplace auto-reply", "desc": "Claude writes the Facebook Marketplace auto-reply and you paste it in."}, "Email health check: bounces and unsubscribes. If it is clean, raise the daily cap in Email settings.": {"head": "Email health check", "desc": "Check bounces and unsubscribes. If it is clean, raise the daily cap in Email settings."}, "Lead capture. Claude builds a form link that drops leads into Closing Desk. You put it in your Instagram bio.": {"head": "Lead capture form", "desc": "Claude builds a form link that drops leads into Closing Desk. You put it in your Instagram bio."}, "Editing check. Send the videographer brief, count Reels edited vs waiting, and remove the one bottleneck.": {"head": "Editing check", "desc": "Send the videographer brief, count Reels edited vs waiting, and remove the one bottleneck."}, "Turn on Tell Claude. Put the Anthropic key in the Supabase secret and set tellClaude to true. About 2–5 cents per note.": {"head": "Turn on Tell Claude", "desc": "Put the Anthropic key in the Supabase secret and set tellClaude to true. It costs about 2–5 cents per note."}, "Full test. Send yourself one email, one WhatsApp, one call and one DM. Note what annoys you.": {"head": "Full test", "desc": "Send yourself one email, one WhatsApp, one call and one DM. Note what annoys you."}, "Claude fixes the top 3 annoyances. You retest.": {"head": "Fix the top 3 annoyances", "desc": "Claude fixes the top 3 annoyances from your test. You retest."}, "Pace check. Reached vs target. Claude resets your daily number.": {"head": "Pace check", "desc": "Compare reached vs target. Claude resets your daily number."}, "Hot replies. Set the next step and move cards on Pipeline.": {"head": "Hot replies", "desc": "Set the next step on each hot reply and move the cards on Pipeline."}, "Offers library 1/2. Pre-construction offer #1. You supply builder, community, price, deposit and possession. Claude drafts and flags gaps.": {"head": "Offers library, part 1 of 2", "desc": "Pre-construction offer #1. You supply builder, community, price, deposit and possession. Claude drafts it and flags gaps."}, "Offers library 2/2. Three MLS investor picks and a custom-home guide outline, same rule.": {"head": "Offers library, part 2 of 2", "desc": "Three MLS investor picks and a custom-home guide outline, same rule: you supply the details and Claude flags gaps."}, "Year-end message. Claude drafts the email and the WhatsApp, you approve.": {"head": "Year-end message", "desc": "Claude drafts the year-end email and the WhatsApp. You approve them."}, "Regression test: tap every button once. Then build the last-mile list in Lists by filtering people not yet reached.": {"head": "Regression test", "desc": "Tap every button once. Then build the last-mile list in Lists by filtering people not yet reached."}, "Send the year-end email campaign.": {"head": "Send the year-end email", "desc": "Send the year-end email campaign."}, "Send the year-end WhatsApp to Tier A from Today.": {"head": "Send the year-end WhatsApp", "desc": "Send the year-end WhatsApp to Tier A from Today."}, "More › Download backup. Save it somewhere private.": {"head": "Download a backup", "desc": "More › Download backup. Save it somewhere private."}, "Send 5 personal holiday WhatsApps to favourite past clients.": {"head": "Send 5 holiday WhatsApps", "desc": "Send 5 personal holiday WhatsApps to favourite past clients."}, "More › Download backup.": {"head": "Download a backup", "desc": "More › Download backup."}, "Close the laptop. It counts as a task.": {"head": "Close the laptop", "desc": "Close the laptop. It counts as a task."}, "Last mile 1/2. Call everyone still unreached. 10 dials.": {"head": "Last mile, part 1 of 2", "desc": "Call everyone still unreached. 10 dials."}, "Log an outcome on every contact you touched this month so the counter is true.": {"head": "Log every outcome", "desc": "Log an outcome on every contact you touched this month so the counter is true."}, "Last mile 2/2. Message the rest, only people it is OK to message.": {"head": "Last mile, part 2 of 2", "desc": "Message the rest, only people it is OK to message."}, "Set January follow-up dates for everyone: Lists › Select.": {"head": "Set January follow-ups", "desc": "Set January follow-up dates for everyone: Lists › Select."}, "Year-end review with Claude. Replies by channel, listings x/20, buyers x/30, plan January.": {"head": "Year-end review", "desc": "Review with Claude: replies by channel, listings x/20, buyers x/30, then plan January."}, "Finish line. Read the final reached count, download a backup, celebrate.": {"head": "Finish line", "desc": "Read the final reached count, download a backup, celebrate."}};
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
        (t.tag==='CRM'||t.tag==='DASH')?h('a',{class:'cdlink',href:CD_URL,text:'Open Closing Desk ›'}):null
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
  function renderFoot(){if(footEl) footEl.textContent=footText();}

  /* ---------- page tabs: Today, Plan, Ideas, Notes ---------- */
  var TABS=['today','plan','ideas','notes'];
  var curTab='today';
  function tabIn(name,el){if(el&&el.setAttribute) el.setAttribute('data-sec',name);return el;}
  function emptyCard(t,p){return h('div',{class:'card empty'},[h('h2',{text:t}),h('p',{text:p})]);}
  function tabHead(title,sub){return h('header',{class:'title-row'},[h('div',{},[h('h1',{text:title}),h('p',{class:'sub',text:sub})])]);}
  function setTab(name,keepScroll){
    if(TABS.indexOf(name)<0) name='today';
    curTab=name;
    document.body.setAttribute('data-tab',name);
    var bs=document.querySelectorAll('.tabs button');
    for(var i=0;i<bs.length;i++){if(bs[i].getAttribute('data-tab')===name) bs[i].setAttribute('aria-current','page'); else bs[i].removeAttribute('aria-current');}
    if(!keepScroll) window.scrollTo(0,0);
  }
  function setTheme(t){
    document.documentElement.setAttribute('data-theme',t);
    try{localStorage.setItem('cd.theme',t);}catch(e){}
    var m=document.querySelector('meta[name="theme-color"]');if(m) m.setAttribute('content',t==='light'?'#F3F6FB':'#0B1220');
    var b=document.getElementById('themeBtn');if(b) b.setAttribute('aria-label',t==='light'?'Switch to dark mode':'Switch to light mode');
  }
  var ICONS={
    today:'<path d="M5 13l4 4L19 7"/><circle cx="12" cy="12" r="9"/>',
    plan:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    ideas:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    notes:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'
  };
  var LABELS={today:'Today',plan:'Plan',ideas:'Ideas',notes:'Notes'};
  function buildChrome(){
    var strip=h('div',{class:'strip'},[
      h('span',{class:'logo','aria-hidden':'true',html:'<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/></svg>'}),
      h('div',{class:'seg2',role:'group','aria-label':'Switch app'},[
        h('span',{class:'s on','aria-current':'page','aria-label':'Win the Day',text:'Win'}),
        h('a',{class:'s',href:CD_URL,text:'Clients'})
      ]),
      h('span',{class:'sp'}),
      h('button',{class:'ib',id:'themeBtn',type:'button','aria-label':'Switch to light mode',html:'<svg class="ic-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg><svg class="ic-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'})
    ]);
    app.parentNode.insertBefore(strip,app);
    var inner=h('div',{class:'in'});
    TABS.forEach(function(n){inner.appendChild(h('button',{type:'button','data-tab':n,html:'<svg viewBox="0 0 24 24" aria-hidden="true">'+ICONS[n]+'</svg><span>'+LABELS[n]+'</span>'}));});
    var tabs=h('nav',{class:'tabs','aria-label':'Sections'},[inner]);
    document.body.appendChild(tabs);
    tabs.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('button[data-tab]');if(b) setTab(b.getAttribute('data-tab'));});
    document.getElementById('themeBtn').addEventListener('click',function(){setTheme(document.documentElement.getAttribute('data-theme')==='light'?'dark':'light');});
    setTheme(document.documentElement.getAttribute('data-theme')==='light'?'light':'dark');
    setTab('today',true);
  }

  function render(focusIdx){
    pendingRender=false;
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

    wrap.appendChild(tabIn('today',h('header',{class:'title-row'},[
      h('div',{},[
        h('h1',{text:fmtDate(viewing,{weekday:'long'})}),
        h('p',{class:'sub',text:(isToday?'Today · ':'')+fmtDate(viewing,{month:'long',day:'numeric'})})
      ]),
      h('div',{class:'ring',html:ring(count)})
    ])));
    wrap.appendChild(tabIn('plan',tabHead('Plan','Next 10 days and the full calendar')));
    wrap.appendChild(tabIn('ideas',tabHead('Ideas','Content to make and post')));
    wrap.appendChild(tabIn('notes',tabHead('Notes','Capture a thought')));
    if(viewing<=today) wrap.appendChild(tabIn('today notes',composeBlock()));
    var msg=null;
    if(count===3) msg='All 3 done. That is the day.';
    else if(missed>0&&count+missed===3) msg='Nothing left for this day. The rest is back on the board.';
    if(msg) wrap.appendChild(tabIn('today',h('div',{class:'status'},[h('p',{class:'donemsg',text:msg})])));

    if(afterEnd){
      wrap.appendChild(tabIn('today',h('div',{class:'banner',text:'The plan is finished. Ask Claude for a January plan whenever you want one.'})));
    }

    var ul=h('ul',{class:'list'});
    tasks.forEach(function(t,i){ul.appendChild(row(t,i,oc[i]||''));});
    var tasksGrp=grp('Today\u2019s 3 wins',ul);
    tasksGrp.appendChild(h('p',{class:'swipehint',id:'swipehelp'},[
      h('span',{html:'<i class="g"></i>Swipe right: done'}),
      h('span',{html:'<i class="o"></i>Swipe left: didn’t do it'})
    ]));
    wrap.appendChild(tabIn('today',tasksGrp));
    var nxg=nextGroup();if(nxg) wrap.appendChild(tabIn('plan',nxg));
    wrap.appendChild(tabIn('today',cdGroup()));
    var ig=ideaGroup(),cg=contentGroup();
    if(ig) wrap.appendChild(tabIn('ideas',ig));
    if(cg) wrap.appendChild(tabIn('ideas',cg));
    if(!ig&&!cg) wrap.appendChild(tabIn('ideas',emptyCard('No ideas yet','Add one with the + line on Today or Notes and it will show up here.')));
    if(viewing<=today){var ng=noteGroup();if(ng){ng.id='note-sec';wrap.appendChild(tabIn('notes',ng));} else wrap.appendChild(tabIn('notes',emptyCard('No notes yet','Tap “Add a note or idea” above. Claude reads new notes within the hour and files them.')));}
    if(!testHidden) wrap.appendChild(tabIn('today',testGroup()));

    if(D.board.length){
      var bl=h('ul',{class:'list'});
      D.board.forEach(function(e){bl.appendChild(boardRow(e));});
      wrap.appendChild(tabIn('today',grp('Back on the board',bl)));
    }

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
    wrap.appendChild(tabIn('plan',grp('The whole plan',h('div',{class:'cal-card'},[cal,legend]))));
    footEl=h('p',{class:'foot',text:footText()});
    wrap.appendChild(tabIn('today notes',footEl));
    renderSync();
    if(testHidden) wrap.appendChild(tabIn('today',h('div',{class:'acts'},[h('button',{class:'lnk','data-act':'t-show',text:'Show the swipe practice'})])));

    if(typeof focusIdx==='number'){
      var f=app.querySelector('.swipe[data-i="'+focusIdx+'"] .front');
      if(f&&f.focus) f.focus({preventScroll:true});
    }
  }

  /* ---------- notes: what you did that was not on the list ---------- */
  function noteFocused(){var a=document.activeElement;return listening||!!(a&&(a.id==='note-in'||(a.hasAttribute&&a.hasAttribute('data-askbox'))));}
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
    story:{tag:'STORY IDEA',steps:['Recorded','Edited','Posted'],word:'Story'}
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
    return 'Write the script for my '+k.tag.toLowerCase()+': "'+it.text+'"'+((it.ask&&it.ask.note)?' ('+it.ask.note+')':'')+'. Use my style rules and flag any details I still need to give you.';
  }
  function scriptPrompt(it){
    var kind=it.kind||'reel';
    var fmt={
      reel:'Write a POV walkthrough script for a single continuous take with no cuts: the spoken lines plus short on-screen text cues, about 30 to 45 seconds, with a hook in the first 2 seconds. Then an Instagram caption with a scroll-stopping first line, a closing line that asks viewers to DM one trigger word, and exactly 5 hashtags.',
      carousel:'Write an Instagram carousel: a cover slide with a scroll-stopping hook, then 6 to 8 slides (one idea each, a short headline and one or two lines), and a last slide that asks viewers to DM one trigger word. Then a caption with a hook line and exactly 5 hashtags.',
      post:'Write an Instagram post caption: a scroll-stopping first line, a short feeling-first body, a closing line that asks viewers to DM one trigger word, and exactly 5 hashtags. Add one line suggesting the image.',
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
    var steps=['rec','edit','post'];
    kids.push(h('div',{class:'chk'},steps.map(function(key,n){
      var on=!!i[key];
      return h('button',{class:'ck'+(on?' on':''),'data-act':'idea-tog','data-id':i.id,'data-k':key,role:'checkbox','aria-checked':on?'true':'false',text:k.steps[n]});
    })));
    var sec=h('div',{class:'script'},[h('h4',{text:'Script'})]);
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
        sec.appendChild(h('button',{class:'pill','data-act':'idea-ask','data-id':i.id,text:i.script?'Ask Claude to rewrite it':'Ask Claude to write the script'}));
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
  function ideaGroup(){
    if(!ideas.length) return null;
    var fin=function(i){return i.rec&&i.edit&&i.post;};
    var todo=ideas.filter(function(i){return !fin(i);}),done=ideas.filter(fin);
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
  /* ---------- Closing Desk numbers (read-only copy made by Claude) ---------- */
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
        h('p',{class:'cdnote',text:cd.asOf?'Live from Closing Desk · '+cdWhen(cd.asOf):''})
      ];
    } else {
      body=[
        h('p',{class:'cdline',text:'Loading your Closing Desk numbers…'})
      ];
    }
    body.push(h('div',{class:'cdlinks'},[
      h('a',{class:'cdlink',href:CD_URL,text:'Open Closing Desk'}),
      h('a',{class:'cdlink',href:CD_URL+'#more',text:'Scorecard'}),
      h('a',{class:'cdlink',href:OS_DOC_URL,target:'_blank',rel:'noopener',text:'How it connects'})
    ]));
    return grp('Closing Desk',h('div',{class:'card cd-card'},body));
  }
  /* ---------- Task 1 ticks itself when Closing Desk shows the calls and messages were logged ---------- */
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
      notes.push({id:id,date:d,text:'Closing Desk shows '+cd.touchesToday+' calls and messages logged today.',ts:nowIso,src:'cd',st:'done',by:'cd',readAt:nowIso,doneAt:nowIso,arch:true,
        ai:{summary:'Ticked from Closing Desk',scoreboard:'',applied:[{date:d,slot:i+1,title:String(t.title||'').slice(0,90),prev:null}],suggested:[],
            receipt:['Ticked done: '+shortTitle(tinfo(t.title).head)+'. Closing Desk logged '+cd.touchesToday+' calls and messages today; the task needs '+N+'.']}});
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
    if(e.target&&(e.target.id==='note-in'||(e.target.hasAttribute&&e.target.hasAttribute('data-askbox')))){
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
    if(act==='note-mic'){micClick();}
    else if(act==='note-save'){
      if(listening&&dict){try{Promise.resolve(dict.stop()).then(saveNote,saveNote);}catch(e){saveNote();}}
      else{saveNote();}
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
