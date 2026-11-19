/* The 3-task plan through Dec 31, 2026 and the rules that move missed tasks. Moved over unchanged from the Daily 3 page. */
/* Plan data and date logic. Pure functions, no page access. */
window.ROS = (function(){
  var START='2026-11-14', END='2026-12-31';
  function parse(s){var p=s.split('-').map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]));}
  function fmt(dt){return dt.toISOString().slice(0,10);}
  function add(s,n){var dt=parse(s);dt.setUTCDate(dt.getUTCDate()+n);return fmt(dt);}
  function dow(s){return parse(s).getUTCDay();}
  function clamp(s){return s<START?START:(s>END?END:s);}

  function phaseOf(d){
    if(d<='2026-11-20') return {id:'p1',name:'Phase 1 · Foundation and course enrolment'};
    if(d<='2026-11-29') return {id:'vac',name:'Vacation · Commercial licence study'};
    if(d<='2026-12-09') return {id:'p2',name:'Phase 2 · Warm contacts first'};
    if(d<='2026-12-20') return {id:'p3',name:'Phase 3 · Everyone else'};
    return {id:'p4',name:'Phase 4 · Finish and year-end'};
  }

  function T(role,tag,title,mins,where,hint){return {role:role,tag:tag,title:title,mins:mins,where:where||'',hint:hint||''};}

  var DESK='Closing Desk';
  var TODAY_TAB=DESK+' › Clients';

  var REACH_EARLY=T('REACH','CRM','Call or WhatsApp your 5 warmest people.',15,TODAY_TAB);
  var REACH={
    1:T('REACH','CRM','Call 10 people, Tier A first. Leave a 15-second voicemail if there is no answer.',25,TODAY_TAB),
    2:T('REACH','CRM','Email day. Keep the email campaign running with the laptop open and answer replies.',15,DESK+' › Email tab','Email works best 9–10am.'),
    3:T('REACH','CRM','WhatsApp 15 people with a template.',25,TODAY_TAB,'WhatsApp works best 9:30–11am or 6–8pm. Not before 9am or after 8:30pm.'),
    4:T('REACH','CRM','Call 10 people, then call back anyone who replied.',25,TODAY_TAB,'Calls work best 10–11:30am or 4:30–6pm.'),
    5:T('REACH','CRM','Answer every reply, then message the No-answer people.',20,TODAY_TAB),
    6:T('REACH','CRM','Send 10 Instagram DMs to people who watched, commented or replied. No cold pitches.',15,'Instagram DMs','Send after your Saturday 9am Reel.')
  };
  var LAST1=T('REACH','CRM','Last mile 1/2. Call everyone still unreached. 10 dials.',null,TODAY_TAB);
  var LAST2=T('REACH','CRM','Last mile 2/2. Message the rest, only people it is OK to message.',null,TODAY_TAB);

  var S={
    '2026-11-14':['CRM','Count your contacts. In Clients › Everyone, write down total contacts and how many have email, phone and consent. Tell Claude.',5],
    '2026-11-16':['CRM','Mark Client consent on past clients: Clients › Everyone › Select › Email consent.',20],
    '2026-11-17':['CRM','Mark Said yes or Asked me consent on people who agreed or contacted you. Skip anyone you are unsure about.',20],
    '2026-11-18':['CRM','Gmail setup 1/2. Make the Google Cloud project and turn on the Gmail API (README, Email setup step 2). If it is already connected, say done.',20],
    '2026-11-19':['CRM','Gmail setup 2/2. Paste the Client ID in the Email tab, test the unsubscribe link, then Connect Gmail.',15],
    '2026-11-20':['CRM','Email #1. Pick a starter, send a test to yourself, check your inbox and your spam folder.',15],
    '2026-11-30':['CRM','Start campaign #1 to consented Clients: Email › New campaign › Start. Keep the laptop open.',15],
    '2026-12-01':['DASH','Claude builds a reached counter (X of N reached) into Closing Desk. You test it on one contact.',10],
    '2026-12-02':['CRM','WhatsApp. Set Tier A/B/C labels in the WhatsApp Business app and decide click-to-chat or continuing API registration.',20],
    '2026-12-03':['CRM','Follow-up sequences. Claude builds Day 3, 7 and 21 reminders. You approve the wording.',15],
    '2026-12-04':['DASH','Claude builds the weekly scorecard: reached, replies, appointments, listings x/20, buyers x/30. You check it.',10],
    '2026-12-05':['ADMIN','Facebook Marketplace auto-reply. Claude writes it, you paste it in.',15],
    '2026-12-07':['CRM','Email health check: bounces and unsubscribes. If it is clean, raise the daily cap in Email settings.',10],
    '2026-12-08':['CRM','Lead capture. Claude builds a form link that drops leads into Closing Desk. You put it in your Instagram bio.',15],
    '2026-12-09':['EDIT','Editing check. Send the videographer brief, count Reels edited vs waiting, and remove the one bottleneck.',15],
    '2026-12-10':['CRM','Turn on Tell Claude. Put the Anthropic key in the Supabase secret and set tellClaude to true. About 2–5 cents per note.',20],
    '2026-12-11':['CRM','Full test. Send yourself one email, one WhatsApp, one call and one DM. Note what annoys you.',20],
    '2026-12-12':['CRM','Claude fixes the top 3 annoyances. You retest.',15],
    '2026-12-14':['DASH','Pace check. Reached vs target. Claude resets your daily number.',10],
    '2026-12-15':['CRM','Hot replies. Set the next step and move cards on Pipeline.',20],
    '2026-12-16':['CRM','Offers library 1/2. Pre-construction offer #1. You supply builder, community, price, deposit and possession. Claude drafts and flags gaps.',20],
    '2026-12-17':['CRM','Offers library 2/2. Three MLS investor picks and a custom-home guide outline, same rule.',20],
    '2026-12-18':['CRM','Year-end message. Claude drafts the email and the WhatsApp, you approve.',15],
    '2026-12-19':['DASH','Regression test: tap every button once. Then build the last-mile list in Clients › Everyone by filtering people not yet reached.',20],
    '2026-12-21':['CRM','Send the year-end email campaign.',15],
    '2026-12-22':['CRM','Send the year-end WhatsApp to Tier A from Clients.',20],
    '2026-12-23':['ADMIN','More › Download backup. Save it somewhere private.',5],
    '2026-12-28':['CRM','Log an outcome on every contact you touched this month so the counter is true.',20],
    '2026-12-29':['CRM','Set January follow-up dates for everyone: Clients › Everyone › Select.',15],
    '2026-12-30':['DASH','Year-end review with Claude. Replies by channel, listings x/20, buyers x/30, plan January.',20],
    '2026-12-31':['DASH','Finish line. Read the final reached count, download a backup, celebrate.',10]
  };
  var WHERE={CRM:DESK,DASH:DESK+' dashboard',ADMIN:'Admin',EDIT:'Reels editing (CapCut or videographer)'};

  var G={
    1:['CONTENT','Answer every unanswered message on WhatsApp, Instagram and email.',10],
    2:['CONTENT','Pick this week’s Reel idea and hook with the caption-generator skill.',10],
    3:['CONTENT','Film one Reel in one take, or hand the raw clip to the editor.',15],
    4:['BUILDER','Message one builder or past client and ask what is new, using the builder-inquiry skill.',10],
    5:['DASH','5-minute scoreboard. Tell Claude reached, replies and appointments this week.',5],
    6:['CONTENT','Schedule next Saturday’s 9am Reel and reply to comments.',10]
  };
  var GO={
    '2026-11-16':['STUDY','Pick your commercial course. Claude’s pick for fast AI study is Haskayne ($699). Confirm total hours first.',10],
    '2026-11-17':['STUDY','Enrol and pay for the course and save the login. Haskayne can take up to 72 hours to unlock. Order the HP 10bII+ calculator too.',15],
    '2026-11-18':['CONTENT','Film 2 Reels in one sitting and send the raw clips to the editor so posts go out while you study.',20],
    '2026-11-19':['STUDY','Check the course has unlocked and skim the outline. Your 9-day plan is already on the calendar.',15],
    '2026-11-20':['CONTENT','Schedule the banked Reels for Nov 21–29.',10]
  };
  var GWHERE={STUDY:'Commercial licence course',CONTENT:'Reels and messages',BUILDER:'Builder and past-client chats',DASH:DESK+' dashboard'};

  var STUDY={
    '2026-11-21':'Log in and skim the outline. Read the RECA exam blueprint. Domains 1–2 units, then a time-value-of-money drill on the HP 10bII+.',
    '2026-11-22':'Domain 3, Prospecting and Marketing (14%). Course units, then ask Claude to quiz you on 3.1–3.4.',
    '2026-11-23':'Domain 4, part 1 (48% of the exam). Units for 4.1–4.2, then rent drills: base, additional and percentage rent, rentable and usable.',
    '2026-11-24':'Domain 4, part 2. Valuation 4.3: gross income, NOI, cap rates, then DCF, NPV and IRR on the calculator.',
    '2026-11-25':'Domain 4, part 3. Financing 4.4: mortgage payments and balances, loan-to-value, debt coverage, net effective rent.',
    '2026-11-26':'Domain 5, part 1, Negotiating and Closing (28%). Units for 5.1–5.3, then ask Claude to quiz you.',
    '2026-11-27':'Domain 5, part 2. Units for 5.4–5.5, then finish any course units you have not opened.',
    '2026-11-28':'Mixed practice exam with Claude, weighted 48% Domain 4, 28% Domain 5, 14% Domain 3. Redo your weakest topics.',
    '2026-11-29':'Ask your provider to mark you Ready for Exam in myRECA. Look up the exam fee and date on reca.ca, book it, then do a light review.'
  };
  var WARM={
    '2026-11-21':['Reply to WhatsApp messages.',5],
    '2026-11-22':['Send one thinking-of-you WhatsApp to a favourite past client.',5],
    '2026-11-23':['Reply to Instagram DMs.',5],
    '2026-11-24':['Call one warm contact.',5],
    '2026-11-25':['Reply to emails.',5],
    '2026-11-26':['Send 3 WhatsApps from Clients. Relationship contacts only.',5],
    '2026-11-27':['Reply to anything still open.',5],
    '2026-11-28':['Call one hot lead.',5],
    '2026-11-29':['Glance at messages and reply to hot ones only.',3]
  };
  var REST=T(null,'REST','Do something that is not work. It counts as a task.',null,'');

  function systemTask(d){
    var r=S[d]; if(!r) return null;
    return T('SYSTEM',r[0],r[1],r[2],WHERE[r[0]]||'');
  }
  function growTask(d,w){
    var r=GO[d]||G[w]; if(!r) return null;
    return T('GROW',r[0],r[1],r[2],GWHERE[r[0]]||'');
  }

  function planFor(d){
    var w=dow(d), phase=phaseOf(d), tasks, pace=false, set='normal';
    var vacation=(d>='2026-11-21'&&d<='2026-11-29');
    if(vacation){
      set='vacation';
      var st=STUDY[d]||'Next chunk of your 9-day schedule. Two blocks with a break.';
      var hint=(d==='2026-11-21')?'Plan follows the RECA blueprint: the heavy days are Domain 4 and 5, plus daily calculator drills.':'';
      tasks=[
        T(null,'STUDY',st,d==='2026-11-29'?45:90,'Commercial licence course',hint||(d==='2026-11-29'?'':'Two blocks of 45 with a break.')),
        T(null,'KEEP-WARM',WARM[d][0],WARM[d][1],'Your phone'),
        REST
      ];
    } else if(d==='2026-12-24'){
      set='holiday';
      tasks=[
        T(null,'CRM','Send 5 personal holiday WhatsApps to favourite past clients.',15,TODAY_TAB),
        T(null,'ADMIN','More › Download backup.',5,'Admin'),
        T(null,'REST','Close the laptop. It counts as a task.',null,'')
      ];
    } else if(w===0||d==='2026-12-25'||d==='2026-12-26'){
      set='rest';
      pace=(w===0);
      tasks=[
        T(null,'DASH','Read your reached number (or how many people you contacted this week) to Claude.',2,DESK+' dashboard'),
        T(null,'CONTENT','Pick 3 Reel ideas for the week.',10,'Reels'),
        REST
      ];
    } else {
      var t1;
      if(d<='2026-11-20') t1=REACH_EARLY;
      else if(d==='2026-12-28') t1=LAST1;
      else if(d==='2026-12-29') t1=LAST2;
      else t1=REACH[w];
      tasks=[t1,systemTask(d),growTask(d,w)];
    }
    return {date:d,phase:phase,tasks:annotate(tasks,d,set),pace:pace,set:set};
  }

  function workingDaysLeft(d){
    var n=0,x=add(d,1);
    while(x<=END){ if(dow(x)!==0&&x!=='2026-12-25'&&x!=='2026-12-26') n++; x=add(x,1); }
    return n;
  }

  /* ---------- Re-planning engine ---------- */
  var DOWN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MONN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function shortDay(s){var dt=parse(s);return DOWN[dt.getUTCDay()]+', '+MONN[dt.getUTCMonth()]+' '+dt.getUTCDate();}
  function diffDays(a,b){return Math.round((parse(b)-parse(a))/86400000);}

  /* Latest date a one-off can land so the steps after it still work. */
  var DUE={
    '2026-11-16#1':'2026-11-19','2026-11-16#2':'2026-11-17',
    '2026-11-17#1':'2026-11-19','2026-11-17#2':'2026-11-18',
    '2026-11-18#1':'2026-11-19','2026-11-18#2':'2026-11-20',
    '2026-11-19#1':'2026-11-20','2026-11-19#2':'2026-11-20',
    '2026-11-20#1':'2026-11-30','2026-11-20#2':'2026-11-20',
    '2026-12-28#0':END,'2026-12-29#0':END
  };
  var DAY_CAP=60;

  function annotate(tasks,d,set){
    return tasks.map(function(t,i){
      var c={};for(var k in t){c[k]=t[k];}
      c.id=d+'#'+i;c.oid=c.id;c.set=set;
      if(t.tag==='REST'){c.cls='rest';}
      else if(set==='vacation'&&t.tag==='STUDY'){c.cls='study';}
      else if(set==='vacation'&&t.tag==='KEEP-WARM'){c.cls='rec';c.rk='KEEPWARM';}
      else if(set==='holiday'){c.cls='skip';}
      else if(set==='rest'&&t.tag==='DASH'){c.cls='rec';c.rk='SUNREAD';c.wt=0;}
      else if(set==='rest'&&t.tag==='CONTENT'){c.cls='rec';c.rk='SUNIDEAS';c.wt=1;}
      else if(t.role==='REACH'&&d!=='2026-12-28'&&d!=='2026-12-29'){c.cls='rec';c.rk='REACH';c.wt=3;}
      else if(t.role==='GROW'&&!GO[d]){c.cls='rec';c.rk='GROW';c.wt=2;}
      else{c.cls='one';}
      return c;
    });
  }

  function isExcluded(x){return (x>='2026-11-21'&&x<='2026-11-29')||(x>='2026-12-24'&&x<='2026-12-27');}
  function mins(t){return t&&t.mins?t.mins:0;}
  function dayTotal(arr){return arr.reduce(function(s,t){return s+mins(t);},0);}
  function slotWeight(t){return (t&&t.cls==='rec'&&t.wt!=null)?t.wt:Infinity;}
  function trim(s){s=String(s||'');var cut=s.split('. ')[0].replace(/[.]+$/,'');return cut.length>46?cut.slice(0,44)+'…':cut;}

  function applyMove(t,e,eff){
    if(!eff[e.to]) return;
    var moved={};for(var k in t){moved[k]=t[k];}
    moved.moved=true;moved.mid=e.mid;moved.from=e.from;moved.oid=t.oid||t.id;moved.id=e.to+'#'+e.toIdx;moved.cls='one';moved.wt=undefined;moved.rk=undefined;
    eff[e.to][e.toIdx]=moved;
  }

  function resolve(t,d,eff,outcomes,today,claimed){
    var origFrom=t.from||d;
    var e={title:t.title,tag:t.tag,mins:t.mins||null,where:t.where||'',from:origFrom,missedOn:d,mid:t.mid||t.id,status:'',to:null,toIdx:null,why:''};
    if(t.cls==='rest'){e.status='absorbed';e.why='Rest is optional. Nothing to move.';return e;}
    if(t.cls==='skip'){e.status='absorbed';e.why='Holiday task. No catch-up needed.';return e;}
    if(t.cls==='study'){e.status='needs';e.why='Study days are tight. Tell Claude and your study plan gets re-lined.';return e;}
    if(t.cls==='rec'){
      var x=add(d,1);
      while(x<=END){
        var hit=eff[x].some(function(u){return u.rk===t.rk&&!u.moved;});
        if(hit){e.status='absorbed';e.to=x;e.why='The same task comes back on '+shortDay(x)+'. Nothing to catch up.';return e;}
        x=add(x,1);
      }
      e.status='absorbed';e.why='The plan ends before this comes back. Nothing to catch up.';return e;
    }
    var oid=t.oid||t.id;
    var due=DUE[oid]||(function(){var z=add(origFrom,10);return z>END?END:z;})();
    var best=null;
    var start=add(d,1);if(today&&today>start) start=today;
    for(var y=start;y<=due;y=add(y,1)){
      if(isExcluded(y)) continue;
      var arr=eff[y],oc=outcomes[y]||[];
      for(var j=0;j<3;j++){
        if(oc[j]) continue;
        var w=slotWeight(arr[j]);
        if(w===Infinity) continue;
        if(claimed&&arr[j].rk&&claimed[y+'#'+arr[j].rk]) continue;
        if(dayTotal(arr)-mins(arr[j])+mins(t)>DAY_CAP) continue;
        var cost=diffDays(d,y)+2*w;
        if(!best||cost<best.cost){best={y:y,j:j,cost:cost,w:w,old:arr[j]};}
      }
    }
    if(best){
      e.status='placed';e.to=best.y;e.toIdx=best.j;
      applyMove(t,e,eff);
      e.why=(best.w<=1?'Sunday is a light day. ':'')+'It replaces “'+trim(best.old.title)+'”.'+(DUE[oid]?' Needed by '+shortDay(due)+'.':'');
      return e;
    }
    e.status='needs';e.why='No safe slot before '+shortDay(due)+'. Tell Claude and the plan gets re-lined.';
    return e;
  }

  function derive(outcomes,placements,today){
    outcomes=outcomes||{};placements=placements||{};
    var eff={},d=START;
    while(d<=END){eff[d]=planFor(d).tasks;d=add(d,1);}
    var all=[],active={},missInfo={},out={},changed=false,claimed={};
    d=START;
    while(d<=END){
      var oc=outcomes[d]||[];
      for(var i=0;i<3;i++){
        if(oc[i]==='missed'){
          var key=d+'#'+i,t=eff[d][i],e=placements[key];
          if(e&&e.status){
            e=JSON.parse(JSON.stringify(e));
            if(e.status==='placed') applyMove(t,e,eff);
          } else {
            e=resolve(t,d,eff,outcomes,today,claimed);changed=true;
          }
          out[key]=e;
          if(e.status==='absorbed'&&e.to&&eff[e.to]){eff[e.to].forEach(function(u){if(u.rk&&u.rk===t.rk) claimed[e.to+'#'+u.rk]=true;});}
          if(active[e.mid]) active[e.mid].superseded=true;
          active[e.mid]=e;all.push(e);missInfo[key]=e;
        }
      }
      d=add(d,1);
    }
    Object.keys(placements).forEach(function(k){if(!out[k]) changed=true;});
    var board=all.filter(function(e){
      if(e.superseded) return false;
      if(e.status==='placed'){var o=(outcomes[e.to]||[])[e.toIdx];return o!=='done';}
      if(e.status==='absorbed'){return e.to?(!today||e.to>=today):(!today||e.missedOn>=today);}
      return true;
    });
    var moves={};
    Object.keys(eff).forEach(function(k){
      eff[k].forEach(function(t,j){
        if(t.moved){(moves[k]=moves[k]||[]).push({slot:j+1,tag:t.tag,title:t.title,mins:t.mins||null,where:t.where||'',from:t.from});}
      });
    });
    return {eff:eff,board:board,missInfo:missInfo,moves:moves,placements:out,changed:changed};
  }

  return {START:START,END:END,parse:parse,add:add,dow:dow,clamp:clamp,planFor:planFor,phaseOf:phaseOf,workingDaysLeft:workingDaysLeft,derive:derive,shortDay:shortDay};
})();
