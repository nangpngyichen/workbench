/* =========================================================
   淡粉色可爱少女风 · 手机端工作台
   全部数据 localStorage 本地存储（不上传云端）
   ========================================================= */
(function(){
'use strict';

/* ---------- 基础工具 ---------- */
const PREFIX='wb_';
const APP_VER='v77';  // 与 sw.js 的 CACHE 版本保持同步，仅用于首页展示当前代码版本
const $=(s,r)=> (r||document).querySelector(s);
const $$=(s,r)=> Array.from((r||document).querySelectorAll(s));
function load(key,def){
  try{
    const v=localStorage.getItem(PREFIX+key);
    if(!v) return def;
    const parsed=JSON.parse(v);
    // 若旧备份数据形状与当前不兼容（应为数组却是对象/字符串，或应为对象却是数组/字符串），
    // 直接退回安全默认值，避免后续 .filter/.push 等抛错导致整个模块无法录入。
    if(def!==undefined && def!==null){
      const defArr=Array.isArray(def);
      const defObj=!defArr && typeof def==='object';
      if(defArr && !Array.isArray(parsed)) return def;
      if(defObj && (parsed===null || typeof parsed!=='object' || Array.isArray(parsed))) return def;
    }
    return parsed;
  }catch(e){ return def; }
}
function asArr(x){ return Array.isArray(x)?x:[]; }
function asObj(x){ return (x&&typeof x==='object'&&!Array.isArray(x))?x:{}; }

/* ---------- Service Worker 注册 + 自动更新（iOS Safari 更新惰性兜底） ----------
   普通刷新有时不会触发 SW 重装，导致改了代码手机仍显示旧版。
   这里主动注册 SW、监听更新，发现新版本立即接管并自动刷新一次。 */
(function setupSW(){
  if(!('serviceWorker' in navigator)) return;
  // 🔧 自愈模式：URL 带 ?fresh=1 时，注销所有旧 SW + 清空全部缓存，再跳回干净地址。
  // 这是唯一不依赖"手机先拉到新代码"的强制刷新手段，专治旧 SW 死赖着不放手。
  if(/[?&]fresh=1(\b|&|$)/.test(location.search)){
    Promise.all([
      navigator.serviceWorker.getRegistrations().then(function(regs){
        return Promise.all(regs.map(function(r){ return r.unregister(); }));
      }),
      (window.caches ? caches.keys() : Promise.resolve([])).then(function(ks){
        return Promise.all((ks||[]).map(function(k){ return caches.delete(k); }));
      })
    ]).then(function(){
      var clean = location.pathname + location.hash;
      // 关键：清 cache 后强制重新加载（breakCache 让 SW/CDN 都别用旧 cached 资源）
      window.location.replace(clean + (clean.indexOf('?')>=0?'&':'?') + 'breakcache=' + Date.now());
    }).catch(function(){ window.location.replace(location.pathname); });
    return;
  }
  function doReload(){
    try{ if(navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('skipWaiting'); }catch(e){}
    setTimeout(function(){ location.reload(); }, 400);
  }
  function registerSW(){
    navigator.serviceWorker.register('./sw.js').then(function(reg){
      // 已有一个待激活的新 SW（比如刚装好但页面还没 reload）
      if(reg.waiting){ doReload(); return; }
      reg.addEventListener('updatefound', function(){
        var installing=reg.installing;
        if(!installing) return;
        installing.addEventListener('statechange', function(){
          if(installing.state==='installed'){
            if(navigator.serviceWorker.controller) doReload();  // 旧 SW 控制中 → 刷新接管
            else location.reload();                              // 首次安装 → 直接刷新
          }
        });
      });
      // 每 60s 主动检查一次更新
      setInterval(function(){ try{ reg.update(); }catch(e){} }, 60000);
    }).catch(function(){});
    navigator.serviceWorker.addEventListener('message', function(e){
      if(e.data==='reload' || e.data==='skipWaiting'){
        try{ navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage('skipWaiting'); }catch(_){}
        setTimeout(function(){ location.reload(); }, 300);
      }
    });
  }
  if(document.readyState==='complete' || document.readyState==='interactive') registerSW();
  else window.addEventListener('load', registerSW);
})();
function save(key,val){
  try{ localStorage.setItem(PREFIX+key,JSON.stringify(val)); }
  catch(e){ toast('⚠️ 本地存储空间不足，本次数据可能未保存，请删除部分旧图片或记录后重试'); }
}
function num(v){const n=parseFloat(v);return isNaN(n)?0:n;}
function money(n){return (Math.round((n+Number.EPSILON)*100)/100).toFixed(2);}
function pF(n){return (Math.round((n+Number.EPSILON)*10)/10).toFixed(1);}
// 系数专用：保留 2 位小数，但去掉无意义的末尾 0（如 0.83 → "0.83"，1 → "1"，0.80 → "0.8"）
function pF2(n){const s=(Math.round((n+Number.EPSILON)*100)/100).toFixed(2);return parseFloat(s).toString();}
function ym(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function ymd(d){d=d||new Date();return ym(d)+'-'+String(d.getDate()).padStart(2,'0');}
function uid(){return Date.now()+''+Math.floor(Math.random()*1000);}
function daysInMonth(y,m){return new Date(y,m,0).getDate();}
const WEEK=['日','一','二','三','四','五','六'];
// 月份左右切换（delta=-1上月 / +1下月）
function shiftMonth(value,delta){
  let [y,mo]=value.split('-').map(Number);
  mo+=delta; if(mo<1){mo=12;y--;} else if(mo>12){mo=1;y++;}
  return y+'-'+String(mo).padStart(2,'0');
}
// 生成「‹ 月份 ›」左右箭头选择头（hidden 的月份输入框作为状态载体）
function monthHeadHTML(prevId,nextId,month){
  return `<div class="wlcal-head">
    <button type="button" class="wlcal-nav" id="${prevId}" aria-label="上个月">‹</button>
    <span class="wlcal-month">${month}</span>
    <button type="button" class="wlcal-nav" id="${nextId}" aria-label="下个月">›</button>
  </div>`;
}

/* ---------- 历史记录点击展开明细 ---------- */
function recLine(k,v){return `<div class="dline"><span class="dlabel">${k}</span><span class="dval">${v}</span></div>`;}
function enableRecDetailToggle(sel){
  const box=$(sel);if(!box)return;
  box.addEventListener('click',e=>{
    if(e.target.closest('.del'))return;            // 删除按钮不触发展开
    if(e.target.closest('.sal-img-thumb'))return;  // 点图片缩略图不收起明细（单独打开灯箱）
    const item=e.target.closest('.item');if(!item)return;
    const d=item.querySelector('.rec-detail');if(!d)return;
    d.hidden=!d.hidden;item.classList.toggle('open',!d.hidden);
  });
}

/* ---------- 按月份折叠分组（历史流水通用） ---------- */
// 按月份(YYYY-MM)把记录分组，返回倒序 [{month, items}]
function groupByMonthDesc(records,getMonth){
  const map=new Map();
  records.forEach(r=>{
    const m=getMonth(r);
    if(!map.has(m))map.set(m,[]);
    map.get(m).push(r);
  });
  return [...map.keys()].sort().reverse().map(m=>({month:m,items:map.get(m)}));
}
// 生成「月份头 + 可折叠内容」结构（默认折叠）
function mgroupHTML(month,summary,bodyHtml){
  return `<div class="mgroup">
    <div class="mgroup-head">
      <span class="mgroup-title">📅 ${month}</span>
      <span class="mgroup-sum">${summary} <span class="chev">▸</span></span>
    </div>
    <div class="mgroup-body" hidden>${bodyHtml}</div>
  </div>`;
}
// 绑定月份头点击折叠/展开（与 item 内细节点开互不冲突：head 不在 .item 内）
function bindMonthGroupToggle(scope){
  const box=$(scope);if(!box)return;
  box.addEventListener('click',e=>{
    const head=e.target.closest('.mgroup-head');if(!head)return;
    const grp=head.parentElement;if(!grp||!grp.classList.contains('mgroup'))return;
    const body=grp.querySelector('.mgroup-body');if(!body)return;
    body.hidden=!body.hidden;
    grp.classList.toggle('open',!body.hidden);
    const chev=head.querySelector('.chev');if(chev)chev.textContent=body.hidden?'▸':'▾';
  });
}
// 把「月份/日期的记录块」按年份再分组，每年一个可折叠组（默认折叠）。
// 用于统一七个模块的历史展示：records 为 [{year, html}]，html 是该年下每个月份/日期的记录块。
function wrapByYear(records){
  const map=new Map();
  records.forEach(r=>{ if(!map.has(r.year))map.set(r.year,[]); map.get(r.year).push(r); });
  const years=[...map.keys()].sort().reverse();
  return years.map(y=>{
    const body=map.get(y).map(r=>r.html).join('');
    return mgroupHTML('📅 '+y+' 年', '共 '+map.get(y).length+' 项', body);
  }).join('');
}

/* ---------- 设置（模式 / 费率 / 草稿清空日期） ---------- */
function getSettings(){return load('settings',{modes:{},lastCleared:{},rates:{fullBonus:200,lateDeduct:50,leaveDeduct:100}});}
function setSettings(s){save('settings',s);}
function getMode(page){return getSettings().modes[page]||'cumulative';}
function setMode(page,m){const s=getSettings();s.modes[page]=m;setSettings(s);}
function getRate(k){return getSettings().rates[k];}

/* ---------- 导航图标：7 张表情包抠图透明 PNG，依次对应 7 个菜单 ---------- */
const NAV=[
  {id:'schedule', name:'每月班表', icon:'<img src="assets/icons/icon2.png" alt="每月班表" class="nav-ico">'},
  {id:'workload', name:'每日工作量', icon:'<img src="assets/icons/icon1.png" alt="每日工作量" class="nav-ico">'},
  {id:'salary',   name:'每月工资组成', icon:'<img src="assets/icons/icon3.png" alt="每月工资组成" class="nav-ico">'},
  {id:'allocation',name:'工资分配', icon:'<img src="assets/icons/icon4.png" alt="工资分配" class="nav-ico">'},
  {id:'deposit',  name:'我的存款', icon:'<img src="assets/icons/icon5.png" alt="我的存款" class="nav-ico">'},
  {id:'gold',     name:'持有黄金', icon:'<img src="assets/icons/icon6.png" alt="持有黄金" class="nav-ico">'},
  {id:'yihao',    name:'易豪存款', icon:'<img src="assets/icons/icon7.png" alt="易豪存款" class="nav-ico">'},
];
let currentPage='home';

/* ---------- 轻提示 ---------- */
function toast(msg){
  let t=$('#toast');
  if(!t){t=document.createElement('div');t.id='toast';
    t.style.cssText='position:fixed;left:50%;bottom:30px;transform:translateX(-50%);background:#442233;color:#fff;padding:9px 16px;border-radius:14px;font-size:13px;z-index:99;box-shadow:0 6px 18px rgba(0,0,0,.2);opacity:0;transition:.2s;pointer-events:none;';
    document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(t._t);t._t=setTimeout(()=>t.style.opacity='0',1600);
}

/* =========================================================
   数据读取（供跨页联动）
   ========================================================= */
function getWorkloadMonthPoints(month){
  const arr=load('workload',[]);
  return arr.filter(r=>r.date&&r.date.startsWith(month)).reduce((s,r)=>s+num(r.points),0);
}
function getWorkloadMonthSums(month){
  const arr=load('workload',[]).filter(r=>r.date&&r.date.startsWith(month));
  return {
    ticket:arr.reduce((s,r)=>s+num(r.ticket),0),
    mail:arr.reduce((s,r)=>s+num(r.mail),0),
    archive:arr.reduce((s,r)=>s+num(r.archive),0),
    bad:arr.reduce((s,r)=>s+num(r.bad),0),
    iot:arr.reduce((s,r)=>s+num(r.iot),0),
    points:arr.reduce((s,r)=>s+num(r.points),0),
    work:arr.reduce((s,r)=>s+num(r.work),0)
  };
}
function getScheduleStats(month){
  const sched=load('schedule',{})[month]||{};
  let tripleDays=0;
  for(const day in sched){
    if(sched[day].shift==='法定三薪日')tripleDays++;
  }
  return {tripleDays};
}
function getScheduleMonthSummary(month){
  const sched=load('schedule',{})[month]||{};
  const counts={};let days=0,tripleDays=0;
  for(const d in sched){
    if(d==='imgs')continue;
    const sh=sched[d]&&sched[d].shift;if(!sh)continue;
    counts[sh]=(counts[sh]||0)+1;days++;
    if(sh==='法定三薪日')tripleDays++;
  }
  return {counts,days,tripleDays,imgs:sched.imgs};
}
function getSalaryRecord(month){return load('salary',{})[month]||null;}

/* =========================================================
   草稿 + 每日重置机制
   ========================================================= */
function bindDraft(page,formEl){
  const s=getSettings();const today=ymd();
  const daily=getMode(page)==='daily';
  if(daily && s.lastCleared[page]!==today){ save('draft_'+page,{}); s.lastCleared[page]=today; setSettings(s); }
  const draft=load('draft_'+page,{});
  for(const k in draft){const el=formEl.querySelector('[name="'+k+'"]');if(el)el.value=draft[k];}
  formEl.addEventListener('input',()=>{
    const d={};new FormData(formEl).forEach((v,n)=>d[n]=v);save('draft_'+page,d);
  });
}
function modeSwitchHTML(page){
  const m=getMode(page);
  return `<div class="mode-switch" data-page="${page}">
    <button data-mode="daily" class="${m==='daily'?'on':''}"><span class="dot"></span>每日重置</button>
    <button data-mode="cumulative" class="${m==='cumulative'?'on':''}">累积记录</button>
  </div>`;
}

/* =========================================================
   渲染：顶部栏
   ========================================================= */
function topbar(title,sub,page){
  const mode = page? modeSwitchHTML(page):'';
  const modeRow = page? `<div style="margin:10px 0 4px;">${mode}</div>`:'';
  return `<div class="topbar">
      <div style="flex:1;min-width:0"><h1>${title}</h1><div class="sub">${sub||''}</div></div>
      <div class="top-actions">
        <button class="btn ghost sm" id="importBtn">⬆ 恢复</button>
        <button class="btn ghost sm" id="exportBtn">⬇ 备份</button>
        <input type="file" id="importFile" accept=".txt,application/json" style="display:none">
      </div>
      <div class="backup-tip">数据只存在本机浏览器：⬇ 备份=把数据导出成文件存到手机；⬆ 恢复=换新手机/浏览器时把文件导回来。链接本身不存数据。</div>
      <div class="ver-strip"><span>当前代码 <b id="topVer">${APP_VER}</b></span><button class="btn ghost xs" id="topRefreshBtn" type="button">🔄 强制刷新</button></div>
    </div>${modeRow}`;
}

/* =========================================================
   页面：首页概览
   ========================================================= */
function renderHome(){
  const month=ym(new Date());
  // 本月工作
  const wsum=getWorkloadMonthSums(month);
  const wlLen=load('workload',[]).filter(r=>r.date&&r.date.startsWith(month)).length;
  const monthPoints=wsum.points;
  const monthWork=wsum.work;
  // 本月工资
  const sal=getSalaryRecord(month);
  // 资产汇总
  const dep=load('deposits',{});
  function bal(arr){return (arr||[]).reduce((s,e)=>s+(e.type==='in'?num(e.amount):-num(e.amount)),0);}
  const depositTotal = bal(dep.monthly)+bal(dep.fund)+bal(dep.mom)+bal(dep.shoes);
  const yhArr=getAllYihaoArr();
  const yihaoTotal=yhArr.reduce((s,e)=>s+(e.type==='in'?num(e.amount):-num(e.amount)),0);
  const goldG=getGoldTotal();
  const assetTotal=depositTotal+yihaoTotal;

  return topbar('首页概览','今天也要元气满满哦～',null)+`
  <div class="overview-grid">
    <div class="ov-card">
      <div class="title">💼 本月工作简要统计（${month}）</div>
      <div class="ov-grid2">
        <div class="ov-mini"><div class="t">累计积分</div><div class="v">${pF(monthPoints)}</div></div>
        <div class="ov-mini"><div class="t">累计工作量</div><div class="v">${pF(monthWork)}</div></div>
      </div>
      <div class="ov-row"><span>月度工单总量</span><b>${pF(wsum.ticket)}</b></div>
      <div class="ov-row"><span>月度邮件总量</span><b>${pF(wsum.mail)}</b></div>
      <div class="ov-row"><span>月度备档总量</span><b>${pF(wsum.archive)}</b></div>
      <div class="ov-row"><span>月度不良总量</span><b>${pF(wsum.bad)}</b></div>
      <div class="ov-row"><span>月度物联网单量</span><b>${pF(wsum.iot)}</b></div>
      <div class="ov-row"><span>录入天数</span><b>${wlLen} 天</b></div>
    </div>

    <div class="ov-card">
      <div class="title">💰 本月工资摘要（${month}）</div>
      ${sal?`
        <div class="ov-row"><span>应发合计</span><b>¥${money(num(sal.yf))}</b></div>
        <div class="ov-row"><span>实发工资</span><b style="color:#E86A92">¥${money(num(sal.sf))}</b></div>
        <div class="ov-row"><span>提成</span><b>¥${money(num(sal.commission))}</b></div>
      `:`<div class="empty">尚未录入本月工资，去「每月工资组成」填写吧～</div>`}
    </div>

    <div class="ov-card">
      <div class="title">🏦 全部资产汇总预览</div>
      <div class="ov-row"><span>我的存款合计</span><b>¥${money(depositTotal)}</b></div>
      <div class="ov-row"><span>易豪存款总计</span><b>¥${money(yihaoTotal)}</b></div>
      <div class="ov-row"><span>持有黄金(总克数)</span><b>${pF(goldG)} 克</b></div>
      <div class="ov-row" style="border-top:2px solid var(--sub);margin-top:4px;padding-top:8px;"><span>资产总计</span><b style="color:#E86A92">¥${money(assetTotal)}</b></div>
    </div>
  </div>

  <div class="card backup-card">
    <h2>📦 数据备份与迁移</h2>
    <p class="hint">换手机、或换了网址（比如从旧链接搬到 GitHub 这个新地址）时，用下面的按钮把数据搬过来。数据只存在你手机本地，不会上传到任何服务器。</p>
    <div class="row2">
      <button class="btn" id="exportBtn" type="button">💾 导出备份</button>
      <label class="btn ghost" for="homeImportFile">📂 导入文件</label>
    </div>
    <div class="backup-text-wrap">
      <textarea id="backupText" class="backup-text" placeholder="点「导出备份」会在这里生成文本；也可把旧备份文本粘贴到这里，再点「从文本导入」"></textarea>
    </div>
    <div class="row2">
      <button class="btn ghost sm" id="importTextBtn" type="button">📋 从文本导入</button>
      <button class="btn ghost sm" id="copyBackupBtn" type="button">📑 复制文本</button>
    </div>
    <div class="row2" style="margin-top:8px;">
      <button class="btn ghost sm" id="forceUpdateBtn" type="button">🔄 强制刷新页面</button>
      <span class="ver-tip" id="verTip"></span>
    </div>
    <input type="file" id="homeImportFile" class="backup-file" accept=".txt,.json,application/json,text/plain">
  </div>`;
}

/* =========================================================
   页面：每日工作量
   ========================================================= */
let wlViewMonth=null;
let wlSelDate=null;
let wlListCollapsed=true;
let wlCurrentImgs=[]; // 当前所选日期的工作量图片数组({t,f})
function renderWorkload(){
  const domMonth=(currentPage==='workload'&&$('#wlMonth'))?$('#wlMonth').value:null;
  const month=wlViewMonth||domMonth||ym(new Date());
  wlViewMonth=null;
  if(!wlSelDate||wlSelDate.slice(0,7)!==month){ wlSelDate = ymd().startsWith(month)? ymd() : month+'-01'; }
  const ws=getWorkloadMonthSums(month);
  return topbar('每日工作量','记录每一天的小成就', 'workload')+`
  <div class="card">
    <h2>📝 填写今日工作量</h2>
    <form id="wlForm">
      <div class="cal-wrap">
        <div class="wlcal-head">
          <button type="button" class="wlcal-nav" id="wlCalPrev" aria-label="上个月">‹</button>
          <span id="wlCalMonth" class="wlcal-month">${month}</span>
          <button type="button" class="wlcal-nav" id="wlCalNext" aria-label="下个月">›</button>
        </div>
        <div class="wlcal-sub"><span>📅 点选日期填写</span><span id="wlSelDate" class="wlcal-sel">${wlSelDate}</span></div>
        <div id="wlCal" class="wlcal"></div>
      </div>
      <div class="row2">
        <div class="field"><label>工单量</label><input type="number" name="ticket" step="any" placeholder="0"></div>
        <div class="field"><label>邮件量</label><input type="number" name="mail" step="any" placeholder="0"></div>
      </div>
      <div class="row2">
        <div class="field"><label>备档量</label><input type="number" name="archive" step="any" placeholder="0"></div>
        <div class="field"><label>不良量</label><input type="number" name="bad" step="any" placeholder="0"></div>
      </div>
      <div class="field"><label>物联网量</label><input type="number" name="iot" step="any" placeholder="0"></div>
      <button class="btn" type="submit">保存今日记录</button>
    </form>
    <div class="result" id="wlResult"></div>
    <p class="hint">积分规则：工单×10.4 + 邮件×10 + 备档×10 + 不良×5 + 物联网×5（不良为正常积分项）</p>
  </div>

  <div class="card">
    <h2>📷 工作量凭证图片</h2>
    <input type="file" id="wlImgInput" accept="image/*" multiple>
    <div class="sal-img-grid" id="wlImgList"></div>
    <p class="hint">可上传工作量截图 / 工单凭证（支持多张）。点击缩略图可放大查看，点 × 可删除。图片会随当日记录一起保存。</p>
  </div>

  <div class="card">
    <h2>📅 ${month} 月度汇总</h2>
    ${monthHeadHTML('wlSumPrev','wlSumNext',month)}
    <input type="hidden" id="wlMonth" value="${month}">
    <div class="result">
      <div class="line"><span>总积分</span><b id="wlMonthPoints">${pF(ws.points)}</b></div>
      <div class="line"><span>总工作量</span><b id="wlMonthWork">${pF(ws.work)}</b></div>
      <div class="line"><span>月度工单总量</span><b id="wlMonthTicket">${pF(ws.ticket)}</b></div>
      <div class="line"><span>月度邮件总量</span><b id="wlMonthMail">${pF(ws.mail)}</b></div>
      <div class="line"><span>月度备档总量</span><b id="wlMonthArchive">${pF(ws.archive)}</b></div>
      <div class="line"><span>月度不良总量</span><b id="wlMonthBad">${pF(ws.bad)}</b></div>
      <div class="line"><span>月度物联网单量</span><b id="wlMonthIot">${pF(ws.iot)}</b></div>
      <div class="line"><span>录入天数</span><b id="wlMonthDays">${load('workload',[]).filter(r=>r.date&&r.date.startsWith(month)).length}</b></div>
    </div>
    <p class="note">↑ 该月总积分会被「每月工资组成」自动读取用于提成计算</p>
  </div>

  <div class="card">
    <h2 class="col-h ${wlListCollapsed?'':'open'}" id="wlListToggle">📜 ${month} 每日记录 <span class="chev">${wlListCollapsed?'▸':'▾'}</span></h2>
    <div class="list" id="wlList" ${wlListCollapsed?'hidden':''}></div>
  </div>

  <div class="card">
    <h2>📊 历史每月工单</h2>
    <div class="list" id="wlMonthList"></div>
  </div>`;
}
function bindWorkload(){
  const form=$('#wlForm');bindDraft('workload',form);
  function calc(){
    const t=num(form.ticket.value),m=num(form.mail.value),a=num(form.archive.value),b=num(form.bad.value),i=num(form.iot.value);
    const points=t*10.4+m*10+a*10+b*5+i*5;
    const work=t+m+a+b+i;
    $('#wlResult').innerHTML=`<div class="line"><span>当日总积分</span><b class="big">${pF(points)}</b></div>
      <div class="line"><span>当日总工作量</span><b>${pF(work)}</b></div>`;
    return {points,work};
  }
  form.addEventListener('input',calc);calc();
  form.addEventListener('submit',e=>{
    e.preventDefault();
    const r=calc();
    const arr=load('workload',[]);
    const idx=arr.findIndex(x=>x.date===wlSelDate);
    const rec={id: idx>=0?arr[idx].id:uid(), date:wlSelDate, ticket:num(form.ticket.value),mail:num(form.mail.value),
      archive:num(form.archive.value),bad:num(form.bad.value),iot:num(form.iot.value),points:r.points,work:r.work,
      imgs:[...wlCurrentImgs]};
    if(idx>=0)arr[idx]=rec; else arr.push(rec);
    save('workload',arr);
    save('draft_workload',{});
    wlViewMonth=wlSelDate.slice(0,7);
    toast('已保存 '+wlSelDate+' 的工作量 💕');
    render();
  });
  renderWorkloadList();enableRecDetailToggle('#wlList');renderWorkloadMonthList();bindMonthGroupToggle('#wlMonthList');renderWorkloadCalendar();
  enableRecDetailToggle('#wlMonthList');
  // 历史图片灯箱：点击缩略图打开大图（工作量历史此前缺失该绑定，导致图片点不开）
  const wlListEl=$('#wlList');
  if(wlListEl)wlListEl.addEventListener('click',e=>{const t=e.target.closest('.sal-img-thumb img');if(t)openImgLightbox(t.dataset.full||t.src);});
  const wlMonthListEl=$('#wlMonthList');
  if(wlMonthListEl)wlMonthListEl.addEventListener('click',e=>{const t=e.target.closest('.sal-img-thumb img');if(t)openImgLightbox(t.dataset.full||t.src);});
  const wlToggle=$('#wlListToggle');
  if(wlToggle)wlToggle.addEventListener('click',()=>{
    wlListCollapsed=!wlListCollapsed;
    const body=$('#wlList');if(body)body.hidden=wlListCollapsed;
    wlToggle.classList.toggle('open',!wlListCollapsed);
    const chev=wlToggle.querySelector('.chev');if(chev)chev.textContent=wlListCollapsed?'▸':'▾';
  });
  const wlSumPrev=$('#wlSumPrev'),wlSumNext=$('#wlSumNext');
  if(wlSumPrev)wlSumPrev.addEventListener('click',()=>goMonth(-1));
  if(wlSumNext)wlSumNext.addEventListener('click',()=>goMonth(1));
  const cal=$('#wlCal');
  if(cal)cal.addEventListener('click',e=>{
    const cell=e.target.closest('.wlcal-cell');if(!cell||cell.classList.contains('empty'))return;
    wlSelDate=cell.dataset.date;renderWorkloadCalendar();prefillWorkloadForm(wlSelDate);
  });
  const goMonth=delta=>{
    const wm=$('#wlMonth');if(!wm)return;
    let [y,mo]=wm.value.split('-').map(Number);
    mo+=delta;if(mo<1){mo=12;y--;}else if(mo>12){mo=1;y++;}
    wm.value=y+'-'+String(mo).padStart(2,'0');render();
  };
  const pv=$('#wlCalPrev'),nx=$('#wlCalNext');
  if(pv)pv.addEventListener('click',()=>goMonth(-1));
  if(nx)nx.addEventListener('click',()=>goMonth(1));
  // 工作量图片：上传 / 删除 / 灯箱放大（与工资模块一致）
  loadWlImgsForDate(wlSelDate);
  const wlImgInput=$('#wlImgInput');
  if(wlImgInput)wlImgInput.addEventListener('change',()=>{
    const files=[...wlImgInput.files];
    if(!files.length)return;
    let pending=files.length;
    files.forEach(f=>{
      let thumb=null,full=null,done=0;
      const after=()=>{
        done++;
        if(done<2)return;
        if(thumb&&full)wlCurrentImgs.push({t:thumb,f:full});
        if(--pending===0){wlImgInput.value='';renderWlImgs();toast('图片已添加 📷');}
      };
      fileToResizedDataURL(f,800,0.75,u=>{if(u)thumb=u;after();});    // 列表缩略图（轻量）
      fileToResizedDataURL(f,3000,0.94,u=>{if(u)full=u;after();});   // 高清原图（放大清晰）
    });
  });
  const wlImgList=$('#wlImgList');
  if(wlImgList)wlImgList.addEventListener('click',e=>{
    const x=e.target.closest('.sal-img-x');
    if(x){wlCurrentImgs.splice(Number(x.dataset.i),1);renderWlImgs();return;}
    const t=e.target.closest('.sal-img-thumb img');
    if(t)openImgLightbox(t.dataset.full||t.src);
  });
}
function renderWorkloadList(){
  const domMonth=(currentPage==='workload'&&$('#wlMonth'))?$('#wlMonth').value:null;
  const month=wlViewMonth||domMonth||ym(new Date());
  const arr=load('workload',[]).filter(r=>r.date&&r.date.startsWith(month)).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const box=$('#wlList');if(!box)return;
  if(!arr.length){box.innerHTML='<div class="empty">还没有记录哦～</div>';return;}
  box.innerHTML=arr.map(r=>{
    const detail=recLine('日期',r.date)
      +recLine('工单量',pF(num(r.ticket)))
      +recLine('邮件量',pF(num(r.mail)))
      +recLine('备档量',pF(num(r.archive)))
      +recLine('不良量',pF(num(r.bad)))
      +recLine('物联网量',pF(num(r.iot)))
      +recLine('当日总积分',pF(num(r.points))+' 分')
      +recLine('当日总工作量',pF(num(r.work)))
      + (Array.isArray(r.imgs)&&r.imgs.length? salImgsDetail(r.imgs):'');
    return `<div class="item">
    <div class="meta"><span>📆 ${r.date}</span><span class="amt">${pF(r.points)} 分 <span class="chev">▾</span></span></div>
    <div style="font-size:11px;opacity:.7">工单${r.ticket} 邮件${r.mail} 备档${r.archive} 不良${r.bad} 物联网${r.iot} ｜ 工作量 ${pF(r.work)}</div>
    <div class="rec-detail" hidden>${detail}</div>
    <div style="margin-top:6px"><button class="del" data-del="${r.id}">删除</button></div>
  </div>`;}).join('');
  $$('#wlList .del').forEach(b=>b.addEventListener('click',()=>{
    save('workload',load('workload',[]).filter(x=>x.id!==b.dataset.del));renderWorkloadList();updateWlMonth();renderWorkloadMonthList();toast('已删除');
  }));
}
function renderWorkloadMonthList(){
  const arr=load('workload',[]);
  const months=[...new Set(arr.filter(r=>r.date&&r.date.length>=7).map(r=>r.date.slice(0,7)))].sort().reverse();
  const box=$('#wlMonthList');if(!box)return;
  if(!months.length){box.innerHTML='<div class="empty">还没有任何月份记录哦～</div>';return;}
  // 按年份分组，每年一个可折叠组（默认折叠）
  const byYear=new Map();
  months.forEach(m=>{const y=m.slice(0,4);if(!byYear.has(y))byYear.set(y,[]);byYear.get(y).push(m);});
  const years=[...byYear.keys()].sort().reverse();
  box.innerHTML=years.map(y=>{
    const yearMonths=byYear.get(y);
    const body=yearMonths.map(m=>{
      const ws=getWorkloadMonthSums(m);
      const recs=arr.filter(r=>r.date&&r.date.startsWith(m)).slice().sort((a,b)=>b.date.localeCompare(a.date));
      const days=recs.length;
      const allImgs=[];
      recs.forEach(r=>{ if(Array.isArray(r.imgs)) allImgs.push(...r.imgs); });
      const detail=recs.length
        ? recs.map(r=>recLine(r.date,'工单 '+pF(num(r.ticket))+' ｜ 积分 '+pF(num(r.points))+' 分')).join('')
          + (allImgs.length? salImgsDetail(allImgs):'')
        : '<div class="dline"><span class="dlabel">提示</span><span class="dval">本月暂无每日记录</span></div>';
      return `<div class="item" data-month="${m}"><div class="meta">
        <span>📅 ${m}</span>
        <span class="amt">积分 ${pF(ws.points)} <span class="chev">▾</span></span></div>
        <div style="font-size:11px;opacity:.82;margin-top:4px;line-height:1.8">
          工单 ${pF(ws.ticket)} ｜ 邮件 ${pF(ws.mail)} ｜ 不良 ${pF(ws.bad)} ｜ 备档 ${pF(ws.archive)} ｜ 物联网 ${pF(ws.iot)}
        </div>
        <div style="font-size:11px;opacity:.7;margin-top:2px">
          积分 ${pF(ws.points)} ｜ 工作量 ${pF(ws.work)} ｜ 录入 ${days} 天
        </div>
        <div class="rec-detail" hidden>${detail}</div></div>`;
    }).join('');
    const totalPoints=yearMonths.reduce((s,m)=>s+num(getWorkloadMonthSums(m).points),0);
    return mgroupHTML('📅 '+y+' 年', `共 ${yearMonths.length} 个月 ｜ 积分 ${pF(totalPoints)}`, body);
  }).join('');
}
function renderWorkloadCalendar(){
  const box=$('#wlCal');if(!box)return;
  const wm=$('#wlMonth');const month=wm?wm.value:ym(new Date());
  if(!wlSelDate||wlSelDate.slice(0,7)!==month){ wlSelDate = ymd().startsWith(month)? ymd() : month+'-01'; }
  const [y,mo]=month.split('-').map(Number);
  const first=new Date(y,mo-1,1).getDay();
  const dim=new Date(y,mo,0).getDate();
  const recSet=new Set(load('workload',[]).map(r=>r.date).filter(Boolean));
  const sd=$('#wlSelDate');if(sd)sd.textContent=wlSelDate;
  const mm=$('#wlCalMonth');if(mm)mm.textContent=month;
  let h='';
  ['日','一','二','三','四','五','六'].forEach(w=>{h+='<span class="wlcal-h">'+w+'</span>';});
  for(let i=0;i<first;i++)h+='<span class="wlcal-cell empty"></span>';
  for(let d=1;d<=dim;d++){
    const ds=month+'-'+String(d).padStart(2,'0');
    const cls='wlcal-cell'+(ds===wlSelDate?' sel':'')+(recSet.has(ds)?' has':'');
    h+='<span class="'+cls+'" data-date="'+ds+'">'+d+(recSet.has(ds)?'<i></i>':'')+'</span>';
  }
  box.innerHTML=h;
}
function prefillWorkloadForm(date){
  const form=$('#wlForm');if(!form)return;
  const rec=load('workload',[]).find(r=>r.date===date);
  form.ticket.value=rec?rec.ticket:'';
  form.mail.value=rec?rec.mail:'';
  form.archive.value=rec?rec.archive:'';
  form.bad.value=rec?rec.bad:'';
  form.iot.value=rec?rec.iot:'';
  form.dispatchEvent(new Event('input'));
  loadWlImgsForDate(date);
}
function loadWlImgsForDate(date){
  const rec=load('workload',[]).find(r=>r.date===date);
  wlCurrentImgs=(rec&&Array.isArray(rec.imgs))?[...rec.imgs]:[];
  renderWlImgs();
}
function renderWlImgs(){
  const box=$('#wlImgList');if(!box)return;
  if(!wlCurrentImgs.length){box.innerHTML='<div class="hint" style="margin:0">还没有上传图片</div>';return;}
  box.innerHTML=wlCurrentImgs.map((o,i)=>`<div class="sal-img-thumb"><img src="${imgThumb(o)}" data-full="${imgFull(o)}" alt="凭证${i+1}" data-i="${i}"><button type="button" class="sal-img-x" data-i="${i}">×</button></div>`).join('');
}
function updateWlMonth(){
  const domMonth=(currentPage==='workload'&&$('#wlMonth'))?$('#wlMonth').value:null;
  const month=wlViewMonth||domMonth||ym(new Date());
  const ws=getWorkloadMonthSums(month);
  const days=load('workload',[]).filter(r=>r.date&&r.date.startsWith(month)).length;
  const set=(id,v)=>{const e=$('#'+id);if(e)e.textContent=v;};
  set('wlMonthPoints',pF(ws.points));
  set('wlMonthWork',pF(ws.work));
  set('wlMonthTicket',pF(ws.ticket));
  set('wlMonthMail',pF(ws.mail));
  set('wlMonthArchive',pF(ws.archive));
  set('wlMonthBad',pF(ws.bad));
  set('wlMonthIot',pF(ws.iot));
  set('wlMonthDays',days);
}

/* =========================================================
   页面：每月排班
   ========================================================= */
const SHIFTS=['早班','中班','晚班','休息','事假','病假','调休','法定三薪日'];
const SHIFT_COLOR={'早班':'#BFE3FF','中班':'#FFE3B8','晚班':'#C9BCFF','休息':'#E6E6EA','事假':'#FFD2D2','病假':'#FFC7C7','调休':'#D8F0C4','法定三薪日':'#FFD98A'};
function renderSchedule(){
  const selMonth=(currentPage==='schedule'&&$('#schMonth'))?$('#schMonth').value:null;
  const month=selMonth||ym(new Date());
  const y=+month.slice(0,4),mo=+month.slice(5,7);
  const days=daysInMonth(y,mo);
  const sched=load('schedule',{})[month]||{};
  const first=new Date(y,mo-1,1).getDay();
  let cells='';
  for(let i=0;i<first;i++)cells+=`<div class="cal-cell empty"></div>`;
  for(let d=1;d<=days;d++){
    const dd=String(d).padStart(2,'0');
    const sh=sched[dd]?sched[dd].shift:'';
    const col=SHIFT_COLOR[sh]||'#fff';
    cells+=`<div class="cal-cell" data-day="${dd}">
      <div class="dnum">${d}</div>
      ${sh?`<div class="stag" style="background:${col}">${sh}</div>`:`<div class="stag ph">选班</div>`}
    </div>`;
  }
  const st=getScheduleStats(month);
  return topbar('每月班表','点选日期排好整月班次', 'schedule')+`
  <div class="card">
    <h2>🗓 整月班表</h2>
    <div class="wlcal-head">
      <button type="button" class="wlcal-nav" id="schCalPrev" aria-label="上个月">‹</button>
      <span id="schMonthLabel" class="wlcal-month">${month}</span>
      <button type="button" class="wlcal-nav" id="schCalNext" aria-label="下个月">›</button>
    </div>
    <input type="month" id="schMonth" value="${month}" hidden>
    <div class="cal">
      <div class="cal-head">${WEEK.map(w=>`<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </div>
    <p class="note">轻点任意日期格子，弹出窗口选择当天班次</p>
    <button class="btn" type="button" id="schSave" style="margin-top:8px">💾 保存本月班表</button>
  </div>
  <div class="card">
    <h2>📊 本月汇总</h2>
    <div class="result"><div class="line"><span>三薪上班天数</span><b>${st.tripleDays} 天</b></div></div>
    <p class="note">↑ 本月三薪上班天数会被「每月工资组成」自动读取用于三薪工资</p>
  </div>
  <div class="card">
    <h2>📷 班表凭证图片</h2>
    <input type="file" id="schImgInput" accept="image/*" multiple>
    <div class="sal-img-grid" id="schImgList"></div>
    <p class="hint">可上传班表截图 / 排班通知（支持多张）。点击缩略图可放大查看，点 × 可删除。图片会随本月班表一起保存。</p>
  </div>
  <div class="card">
    <h2>📜 历史每月班表</h2>
    <div class="list" id="schList"></div>
  </div>
  <div class="sheet" id="schSheet" hidden>
    <div class="sheet-mask" data-close></div>
    <div class="sheet-panel">
      <div class="sheet-title" id="schTitle">选择班次</div>
      <select id="schShiftSel">${SHIFTS.map(s=>`<option>${s}</option>`).join('')}</select>
      <button class="btn" id="schOk">确定</button>
      <button class="btn ghost sm" id="schCancel" data-close>取消</button>
    </div>
  </div>`;
}
function bindSchedule(){
  let selDay=null;
  const month0=$('#schMonth').value;
  const rec0=load('schedule',{})[month0];
  schCurrentImgs=(rec0&&Array.isArray(rec0.imgs))?[...rec0.imgs]:[];
  const imgList=$('#schImgList');
  function renderSchImgs(){
    if(!imgList)return;
    if(!schCurrentImgs.length){imgList.innerHTML='<div class="hint" style="margin:0">还没有上传图片</div>';return;}
    imgList.innerHTML=schCurrentImgs.map((o,i)=>`<div class="sal-img-thumb"><img src="${imgThumb(o)}" data-full="${imgFull(o)}" alt="凭证${i+1}" data-i="${i}"><button type="button" class="sal-img-x" data-i="${i}">×</button></div>`).join('');
  }
  function saveSchImgs(){
    const month=$('#schMonth').value;
    const sched=load('schedule',{});sched[month]=sched[month]||{};
    sched[month].imgs=[...schCurrentImgs];
    save('schedule',sched);
  }
  renderSchImgs();
  const imgInput=$('#schImgInput');
  if(imgInput)imgInput.addEventListener('change',()=>{
    const files=[...imgInput.files];
    if(!files.length)return;
    let pending=files.length;
    files.forEach(f=>{
      let thumb=null,full=null,done=0;
      const after=()=>{
        done++;
        if(done<2)return;
        if(thumb&&full)schCurrentImgs.push({t:thumb,f:full});
        if(--pending===0){imgInput.value='';renderSchImgs();saveSchImgs();renderSchList();toast('图片已添加 📷');}
      };
      fileToResizedDataURL(f,800,0.75,u=>{if(u)thumb=u;after();});    // 列表缩略图（轻量）
      fileToResizedDataURL(f,3000,0.94,u=>{if(u)full=u;after();});   // 高清原图（放大清晰）
    });
  });
  if(imgList)imgList.addEventListener('click',e=>{
    const x=e.target.closest('.sal-img-x');
    if(x){schCurrentImgs.splice(Number(x.dataset.i),1);renderSchImgs();saveSchImgs();renderSchList();return;}
    const t=e.target.closest('.sal-img-thumb img');
    if(t)openImgLightbox(t.dataset.full||t.src);
  });
  $('#schMonth').addEventListener('change',()=>{render();});
  // 日历左右箭头切换月份（复用工作量日历的翻月逻辑）
  const schGoMonth=delta=>{
    const sm=$('#schMonth');if(!sm)return;
    let [y,mo]=sm.value.split('-').map(Number);
    mo+=delta;if(mo<1){mo=12;y--;}else if(mo>12){mo=1;y++;}
    sm.value=y+'-'+String(mo).padStart(2,'0');render();
  };
  const spv=$('#schCalPrev'),snx=$('#schCalNext');
  if(spv)spv.addEventListener('click',()=>schGoMonth(-1));
  if(snx)snx.addEventListener('click',()=>schGoMonth(1));
  $$('.cal-cell[data-day]').forEach(c=>c.addEventListener('click',()=>{
    selDay=c.dataset.day;const month=$('#schMonth').value;
    const cur=(load('schedule',{})[month]||{})[selDay];
    $('#schTitle').textContent='选择班次 · '+selDay+' 日';
    $('#schShiftSel').value=cur?cur.shift:'早班';
    $('#schSheet').hidden=false;
  }));
  function closeSheet(){$('#schSheet').hidden=true;}
  $$('#schSheet [data-close]').forEach(b=>b.addEventListener('click',closeSheet));
  $('#schOk').addEventListener('click',()=>{
    const month=$('#schMonth').value;
    const sched=load('schedule',{});sched[month]=sched[month]||{};
    sched[month][selDay]={shift:$('#schShiftSel').value};
    sched[month].imgs=[...schCurrentImgs];
    save('schedule',sched);closeSheet();render();
  });
  // 保存本月班表（显式保存按钮：提交班次与图片）
  const saveBtn=$('#schSave');
  if(saveBtn)saveBtn.addEventListener('click',()=>{
    const month=$('#schMonth').value;
    const sched=load('schedule',{});sched[month]=sched[month]||{};
    sched[month].imgs=[...schCurrentImgs];          // 用当前图片集整体覆盖该月图片数据
    save('schedule',sched);
    renderSchList();                                // 立即刷新「历史每月班表」，让覆盖后的数据与图片马上可见
    toast('班表已保存 💕');
  });
  // 历史每月班表：列表 + 展开明细 + 删除 + 图片灯箱
  renderSchList();
  bindMonthGroupToggle('#schList');
  enableRecDetailToggle('#schList');
  const schListEl=$('#schList');
  if(schListEl)schListEl.addEventListener('click',e=>{
    const dl=e.target.closest('.sch-del');
    if(dl){
      const m=dl.dataset.month;
      if(confirm('确定删除 '+m+' 的班表记录吗？图片与所有数据将一并删除，且无法撤销。')){
        const s=load('schedule',{});delete s[m];save('schedule',s);renderSchList();toast('已删除 '+m+' 班表');
      }
      return;
    }
    const t=e.target.closest('.sal-img-thumb img');if(t)openImgLightbox(t.dataset.full||t.src);
  });
}
function renderSchList(){
  const s=load('schedule',{});const box=$('#schList');if(!box)return;
  const arr=Object.keys(s).filter(m=>{
    const hasDays=Object.keys(s[m]).some(k=>k!=='imgs');
    const hasImgs=Array.isArray(s[m].imgs)&&s[m].imgs.length;
    return hasDays||hasImgs;
  }).sort().reverse();
  if(!arr.length){box.innerHTML='<div class="empty">暂无历史班表记录</div>';return;}
  const items=arr.map(m=>{
    const sm=getScheduleMonthSummary(m);
    let detail=recLine('排班总天数',sm.days+' 天')+recLine('三薪上班天数',sm.tripleDays+' 天');
    SHIFTS.forEach(sh=>{ if(sm.counts[sh]) detail+=recLine(sh,sm.counts[sh]+' 天'); });
    detail+=(Array.isArray(sm.imgs)&&sm.imgs.length)?salImgsDetail(sm.imgs):'';
    const html=`<div class="item">
      <div class="meta"><span>📅 ${m}</span><span class="amt">${sm.days} 天 <span class="chev">▾</span></span></div>
      <div style="font-size:11px;opacity:.7;line-height:1.7">三薪 ${sm.tripleDays} 天 ｜ 共排 ${sm.days} 天</div>
      <div class="rec-detail" hidden>${detail}</div>
      <div style="margin-top:8px"><button class="del sch-del" data-month="${m}">删除该月班表</button></div>
    </div>`;
    return {year:m.slice(0,4), html};
  });
  box.innerHTML=wrapByYear(items);
}

/* =========================================================
   页面：每月工资组成
   ========================================================= */
// 工资组成默认值（无已存记录时自动填充，仍可手动修改）
const SAL_DEFAULTS={base:1600,perfBase:1400,seniority:150,post:200,reward:200,full:300,ins:545.32};
let salCurrentImgs=[]; // 当前月份待保存/已保存的图片数组(dataURL)
let schCurrentImgs=[]; // 每月班表：当前月份待保存/已保存的图片数组(dataURL)
function renderSalary(){
  const selMonth=(currentPage==='salary'&&$('#salMonth'))?$('#salMonth').value:null;
  const month=selMonth||ym(new Date());
  const st=getScheduleStats(month);
  const monthPoints=getWorkloadMonthPoints(month);
  const rec=load('salary',{})[month];
  const base=rec?rec.base:SAL_DEFAULTS.base;
  // 自动建议值（仅三薪工资由排班三薪天数推算，全勤奖/迟到请假扣款改为手动填写）
  const tripleAuto=Math.round(st.tripleDays*(num(base)||0)/21.75*2);

  return topbar('每月工资组成','每一分努力都算数', 'salary')+`
  <div class="card">
    <h2>💰 工资组成（${month}）</h2>
    ${monthHeadHTML('salPrev','salNext',month)}
    <input type="hidden" id="salMonth" value="${month}">
      <div class="result" style="margin-bottom:10px">
        <div class="line"><span>读取·${month}总积分</span><b>${pF(monthPoints)}</b></div>
        <div class="line"><span>读取·${month}三薪天数</span><b>${st.tripleDays} 天</b></div>
      </div>
    <form id="salForm">
      <div class="row2">
        <div class="field"><label>底薪</label><input type="number" name="base" step="any" value="${base}" placeholder="0"></div>
        <div class="field"><label>三薪工资</label><input type="number" name="triple" step="any" value="${rec?rec.triple:tripleAuto}" placeholder="0"></div>
      </div>
      <div class="row2">
        <div class="field"><label>绩效工资基数（手动）</label><input type="number" name="perfBase" step="any" value="${rec?rec.perfBase:SAL_DEFAULTS.perfBase}" placeholder="0"></div>
        <div class="field"><label>绩效系数(0-1)</label><input type="number" name="coef" step="0.01" min="0" max="1" value="${rec?rec.coef:'1'}" placeholder="0-1"></div>
      </div>
      <div class="row2">
        <div class="field"><label>工龄奖</label><input type="number" name="seniority" step="any" value="${rec?rec.seniority:SAL_DEFAULTS.seniority}" placeholder="0"></div>
        <div class="field"><label>岗位补贴</label><input type="number" name="post" step="any" value="${rec?rec.post:SAL_DEFAULTS.post}" placeholder="0"></div>
      </div>
      <div class="row2">
        <div class="field"><label>奖励情况</label><input type="number" name="reward" step="any" value="${rec?rec.reward:SAL_DEFAULTS.reward}" placeholder="0"></div>
        <div class="field"><label>全勤奖（手动填写）</label><input type="number" name="full" step="any" value="${rec?rec.full:SAL_DEFAULTS.full}" placeholder="0"></div>
      </div>
      <div class="field"><label>迟到请假扣款（手动填写）</label><input type="number" name="deduct" step="any" value="${rec?rec.deduct:''}" placeholder="0"></div>
      <div class="row2">
        <div class="field"><label>五险一金个人扣款</label><input type="number" name="ins" step="any" value="${rec?rec.ins:SAL_DEFAULTS.ins}" placeholder="0"></div>
        <div class="field"><label>个税扣款</label><input type="number" name="tax" step="any" value="${rec?rec.tax:''}" placeholder="0"></div>
      </div>
      <button class="btn ghost sm" type="button" id="salRefresh">↻ 按班表重新读取默认值</button>
      <button class="btn" type="submit" style="margin-top:8px">保存本月工资</button>
    </form>
  </div>
  <div class="card">
    <h2>📷 工资凭证图片</h2>
    <input type="file" id="salImgInput" accept="image/*" multiple>
    <div class="sal-img-grid" id="salImgList"></div>
    <p class="hint">可上传工资条 / 截图（支持多张）。点击缩略图可放大查看，点 × 可删除。图片会随本月工资一起保存。</p>
  </div>
  <div class="card">
    <h2>🧮 自动计算结果</h2>
    <div class="result" id="salResult"></div>
    <p class="hint">提成：超额累进阶梯，起提 9000 积分。9000-11000 ÷60×15×系数；11000-15000 ÷60×18×系数；>15000 ÷60×21×系数</p>
  </div>
  <div class="card">
    <h2>📜 历史每月工资</h2>
    <div class="list" id="salList"></div>
  </div>`;
}
function computeCommission(points,coef){
  const b1=Math.max(0,Math.min(points,11000)-9000);
  const b2=Math.max(0,Math.min(points,15000)-11000);
  const b3=Math.max(0,points-15000);
  const c1=b1/60*15*coef;
  const c2=b2/60*18*coef;
  const c3=b3/60*21*coef;
  return {c1,c2,c3,total:c1+c2+c3};
}
// 将图片文件压缩后转为 dataURL（限制最长边，避免 localStorage 爆容量）
function fileToResizedDataURL(file,maxDim,quality,cb){
  if(typeof quality==='function'){cb=quality;quality=0.85;}
  const fr=new FileReader();
  fr.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      let {width,height}=img;
      const scale=Math.min(1,maxDim/Math.max(width,height));
      const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
      const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      cb(c.toDataURL('image/jpeg',quality));
    };
    img.onerror=()=>cb(null);
    img.src=fr.result;
  };
  fr.onerror=()=>cb(null);
  fr.readAsDataURL(file);
}
// 图片采用「缩略图 t + 高清原图 f」双版本：列表用缩略图省空间，放大查看用高清版保证清晰
function imgThumb(o){return typeof o==='string'?o:((o&&o.t)||'');}
function imgFull(o){return typeof o==='string'?o:((o&&o.f)||imgThumb(o));}
// 点击缩略图放大查看（再点图片切换「原图尺寸」，可滚动/平移查看小字；点空白处或 × 关闭）
function openImgLightbox(src){
  let ov=document.getElementById('imgLightbox');
  if(!ov){
    ov=document.createElement('div');ov.id='imgLightbox';ov.className='img-lightbox';
    ov.innerHTML='<img alt="预览"><span class="img-lb-close" title="关闭">×</span><span class="img-lb-hint">点图片放大 / 双指缩放 ｜ 点空白处关闭</span>';
    ov.addEventListener('click',e=>{
      const img=ov.querySelector('img');
      if(e.target===img){ img.classList.toggle('zoomed'); return; }   // 点图片：切换原图放大
      if(e.target.classList.contains('img-lb-close')){ ov.classList.remove('show'); return; }
      ov.classList.remove('show');                                     // 点背景空白关闭
    });
    document.body.appendChild(ov);
  }
  const img=ov.querySelector('img');img.classList.remove('zoomed');
  img.src=src;ov.classList.add('show');
}
function bindSalary(){
  const form=$('#salForm');
  const rec0=load('salary',{})[$('#salMonth').value];
  salCurrentImgs=(rec0&&Array.isArray(rec0.imgs))?[...rec0.imgs]:[];
  const imgList=$('#salImgList');
  function renderSalImgs(){
    if(!imgList)return;
    if(!salCurrentImgs.length){imgList.innerHTML='<div class="hint" style="margin:0">还没有上传图片</div>';return;}
    imgList.innerHTML=salCurrentImgs.map((o,i)=>`<div class="sal-img-thumb"><img src="${imgThumb(o)}" data-full="${imgFull(o)}" alt="凭证${i+1}" data-i="${i}"><button type="button" class="sal-img-x" data-i="${i}">×</button></div>`).join('');
  }
  renderSalImgs();
  const imgInput=$('#salImgInput');
  if(imgInput)imgInput.addEventListener('change',()=>{
    const files=[...imgInput.files];
    if(!files.length)return;
    let pending=files.length;
    files.forEach(f=>{
      let thumb=null,full=null,done=0;
      const after=()=>{
        done++;
        if(done<2)return;                       // 缩略图与高清图都生成完才继续
        if(thumb&&full)salCurrentImgs.push({t:thumb,f:full});
        if(--pending===0){imgInput.value='';renderSalImgs();toast('图片已添加 📷');}
      };
      fileToResizedDataURL(f,800,0.75,u=>{if(u)thumb=u;after();});    // 列表缩略图（轻量）
      fileToResizedDataURL(f,3000,0.94,u=>{if(u)full=u;after();});   // 高清原图（放大清晰）
    });
  });
  if(imgList)imgList.addEventListener('click',e=>{
    const x=e.target.closest('.sal-img-x');
    if(x){salCurrentImgs.splice(Number(x.dataset.i),1);renderSalImgs();return;}
    const t=e.target.closest('.sal-img-thumb img');
    if(t)openImgLightbox(t.dataset.full||t.src);
  });
  function calc(){
    const month=$('#salMonth').value;
    const base=num(form.base.value),triple=num(form.triple.value);
    const perfBase=num(form.perfBase.value),coef=Math.min(1,Math.max(0,num(form.coef.value)));
    const seniority=num(form.seniority.value),post=num(form.post.value),reward=num(form.reward.value),full=num(form.full.value),deduct=num(form.deduct.value);
    const ins=num(form.ins.value),tax=num(form.tax.value);
    const finalPerf=perfBase*coef;
    const points=getWorkloadMonthPoints(month);
    const com=computeCommission(points,coef);
    const commission=com.total;
    const yf=base+triple+finalPerf+commission+seniority+post+reward+full-deduct;
    const sf=yf-ins-tax;
    $('#salResult').innerHTML=`
      <div class="line"><span>最终绩效工资(基数×系数)</span><b>${money(finalPerf)}</b></div>
      <div class="line"><span>提成(本月积分 ${pF(points)})</span><b>${money(commission)}</b></div>
      <div class="sub-result">
        <div class="line sm"><span>① 档一 9000-11000 区间</span><b>${money(com.c1)}</b></div>
        <div class="line sm"><span>② 档二 11000-15000 区间</span><b>${money(com.c2)}</b></div>
        <div class="line sm"><span>③ 档三 &gt;15000 区间</span><b>${money(com.c3)}</b></div>
        <div class="line"><span>提成合计</span><b>${money(com.total)}</b></div>
      </div>
      <div class="line"><span>应发合计</span><b>${money(yf)}</b></div>
      <div class="line"><span>实发工资</span><b class="big">${money(sf)}</b></div>`;
    return {finalPerf,commission,yf,sf,c1:com.c1,c2:com.c2,c3:com.c3};
  }
  form.addEventListener('input',calc);
  const salPrev=$('#salPrev'),salNext=$('#salNext');
  if(salPrev)salPrev.addEventListener('click',()=>{const m=$('#salMonth');if(m){m.value=shiftMonth(m.value,-1);render();}});
  if(salNext)salNext.addEventListener('click',()=>{const m=$('#salMonth');if(m){m.value=shiftMonth(m.value,1);render();}});
  $('#salRefresh').addEventListener('click',()=>{
    const month=$('#salMonth').value;const st=getScheduleStats(month);
    form.base.value=SAL_DEFAULTS.base;
    form.perfBase.value=SAL_DEFAULTS.perfBase;
    form.seniority.value=SAL_DEFAULTS.seniority;
    form.post.value=SAL_DEFAULTS.post;
    form.reward.value=SAL_DEFAULTS.reward;
    form.full.value=SAL_DEFAULTS.full;
    form.ins.value=SAL_DEFAULTS.ins;
    form.triple.value=Math.round(st.tripleDays*(num(form.base.value)||0)/21.75*2);
    calc();toast('已恢复默认值并刷新三薪工资');
  });
  form.addEventListener('submit',e=>{
    e.preventDefault();const r=calc();const month=$('#salMonth').value;
    const rec={
      base:num(form.base.value),triple:num(form.triple.value),perfBase:num(form.perfBase.value),coef:num(form.coef.value),
      seniority:num(form.seniority.value),post:num(form.post.value),reward:num(form.reward.value),full:num(form.full.value),
      deduct:num(form.deduct.value),ins:num(form.ins.value),tax:num(form.tax.value),
      finalPerf:r.finalPerf,commission:r.commission,c1:r.c1,c2:r.c2,c3:r.c3,yf:r.yf,sf:r.sf,
      imgs:[...salCurrentImgs]
    };
    const s=load('salary',{});s[month]=rec;save('salary',s);
    toast('工资已保存 💕');renderSalaryList();
  });
  calc();renderSalaryList();bindMonthGroupToggle('#salList');enableRecDetailToggle('#salList');
  const salListEl=$('#salList');
  if(salListEl)salListEl.addEventListener('click',e=>{
    const dl=e.target.closest('.sal-del');
    if(dl){
      const m=dl.dataset.month;
      if(confirm('确定删除 '+m+' 的工资记录吗？图片与所有数据将一并删除，且无法撤销。')){
        const s=load('salary',{});delete s[m];save('salary',s);renderSalaryList();toast('已删除 '+m+' 记录');
      }
      return;
    }
    const t=e.target.closest('.sal-img-thumb img');if(t)openImgLightbox(t.dataset.full||t.src);
  });
}
function salImgsDetail(imgs){
  if(!Array.isArray(imgs)||!imgs.length)return '';
  return '<div class="detail-imgs"><div class="dl">图片凭证（'+imgs.length+'张）</div>'+
    imgs.map((o,i)=>`<div class="sal-img-thumb"><img src="${imgThumb(o)}" data-full="${imgFull(o)}" alt="凭证${i+1}"></div>`).join('')+'</div>';
}
function renderSalaryList(){
  const s=load('salary',{});const box=$('#salList');if(!box)return;
  const arr=Object.keys(s).sort().reverse();
  if(!arr.length){box.innerHTML='<div class="empty">暂无历史工资记录</div>';return;}
  const items=arr.map(m=>{const r=s[m];
    // 串接「工资分配」：同一笔工资（计薪月=m）在分配里被怎么花掉
    // 分配采用「使用月」视角，计薪月 = 使用月 - 1，故本工资月 m 对应分配的使用月 = shiftMonth(m,1)
    const alUseMonth=shiftMonth(m,1);
    const alRec=getAllocation()[alUseMonth]||{};
    const alHasData=!!(alRec&&(Object.keys(alRec.days||{}).length||alSaveTotal(alRec)>0));
    const aExp=alHasData?alMonthExpenseSum(alRec):0;
    const aSv=alHasData?alSaveTotal(alRec):0;
    const aRemain=num(r.sf)-aExp-aSv;
    let allocDetail='';
    if(alHasData){
      allocDetail='<div class="alloc-in-sal">'
        + '<div class="alloc-in-sal-h">💼 工资分配（使用月 '+alUseMonth+' · 计薪月 '+m+'）</div>'
        + recLine('已支出（按日汇总）','¥'+money(aExp))
        + AL_SAVE.map(function(l){return recLine('储蓄·'+l[1],'¥'+money(alSaveVal(alRec,l[0])));}).join('')
        + recLine('储蓄合计','¥'+money(aSv))
        + recLine('结余（实发 − 支出 − 储蓄）','¥'+money(aRemain))
        + '</div>';
    }
    const detail=recLine('底薪','¥'+money(num(r.base)))
      +recLine('三薪工资','¥'+money(num(r.triple)))
      +recLine('绩效基数','¥'+money(num(r.perfBase)))
      +recLine('绩效系数',pF2(num(r.coef)))
      +recLine('最终绩效工资','¥'+money(num(r.finalPerf)))
      +recLine('工龄奖','¥'+money(num(r.seniority)))
      +recLine('岗位补贴','¥'+money(num(r.post)))
      +recLine('奖励','¥'+money(num(r.reward)))
      +recLine('全勤奖','¥'+money(num(r.full)))
      +recLine('迟到请假扣款','-¥'+money(num(r.deduct)))
      +recLine('五险一金','-¥'+money(num(r.ins)))
      +recLine('个税','-¥'+money(num(r.tax)))
      +recLine('提成合计','¥'+money(num(r.commission)))
      +recLine('① 档一 9000-11000','¥'+money(num(r.c1)))
      +recLine('② 档二 11000-15000','¥'+money(num(r.c2)))
      +recLine('③ 档三 &gt;15000','¥'+money(num(r.c3)))
      +recLine('应发合计','¥'+money(num(r.yf)))
      +recLine('实发工资','¥'+money(num(r.sf)))
      + allocDetail
      + (Array.isArray(r.imgs)&&r.imgs.length? salImgsDetail(r.imgs):'');
    const html=`<div class="item">
    <div class="meta"><span>📅 ${m}</span><span class="amt">实发 ¥${money(num(r.sf))} <span class="chev">▾</span></span></div>
    <div style="font-size:11px;opacity:.7;line-height:1.7">应发 ¥${money(num(r.yf))} ｜ 绩效 ¥${money(num(r.finalPerf))}<br>
    提成 ¥${money(num(r.commission))}（档一 ${money(num(r.c1))} ｜ 档二 ${money(num(r.c2))} ｜ 档三 ${money(num(r.c3))}）${alHasData?'<br>分配：已支出 ¥'+money(aExp)+' ｜ 储蓄 ¥'+money(aSv)+' ｜ 结余 ¥'+money(aRemain):''}</div>
    <div class="rec-detail" hidden>${detail}</div>
    <div style="margin-top:8px"><button class="del sal-del" data-month="${m}">删除该月记录</button></div>
  </div>`;
    return {year:m.slice(0,4), html};
  });
  box.innerHTML=wrapByYear(items);
}

/* =========================================================
   页面：工资分配
   ========================================================= */
// 工资分配支出分类（支出按「使用月」记录，可用工资取自「计薪月」实发，二者固定相差一个月）
const AL_EXPENSE=[['need','必要生活开销'],['shop','家庭购物'],['house','房贷'],['card','信用卡'],
  ['douyin','抖音月付'],['fenqile','分期乐'],['huabei','花呗'],['flex','话费充值'],['travel','出行支出'],['jiangxi','江西电费']];
const AL_LABEL={}; AL_EXPENSE.forEach(([k,l])=>AL_LABEL[k]=l);
// 储蓄拆分到「我的存款」四个台账（与 DEP_LEDGERS 顺序/口径一致）
const AL_SAVE=[['monthly','存款'],['fund','公积金'],['mom','妈'],['shoes','鞋服预存']];
// 月度分类汇总（兼容旧格式：旧数据无 days 直接读分类字段；新格式聚合 days）
function alMonthExpense(rec){
  const m={}; AL_EXPENSE.forEach(function(e){m[e[0]]=0;});
  if(rec&&rec.days){ Object.keys(rec.days).forEach(function(d){const day=rec.days[d]||{}; AL_EXPENSE.forEach(function(e){m[e[0]]+=num(day[e[0]]);});}); }
  else if(rec){ AL_EXPENSE.forEach(function(e){m[e[0]]+=num(rec[e[0]]);}); }
  return m;
}
function alMonthExpenseSum(rec){ const m=alMonthExpense(rec); return AL_EXPENSE.reduce(function(s,e){return s+num(m[e[0]]);},0); }
// 储蓄合计：rec.save 为对象 {monthly,fund,mom,shoes}，其中 monthly 可为数字或 {cash,alipay} 细分；无则按 0 计
function alSaveMonthly(rec){ const sv=rec&&rec.save&&typeof rec.save==='object'?rec.save:{}; const m=sv.monthly; if(m&&typeof m==='object')return {cash:num(m.cash),alipay:num(m.alipay)}; return {cash:num(m),alipay:0}; }
function alSaveVal(rec,key){ if(key!=='monthly'){const sv=rec&&rec.save&&typeof rec.save==='object'?rec.save:{};return num(sv[key]);} const mm=alSaveMonthly(rec); return mm.cash+mm.alipay; }
function alSaveTotal(rec){ const sv=rec&&rec.save&&typeof rec.save==='object'?rec.save:{}; let s=0; AL_SAVE.forEach(function(l){ if(l[0]==='monthly'){const mm=alSaveMonthly(rec);s+=mm.cash+mm.alipay;} else s+=num(sv[l[0]]); }); return s; }
function alDayGet(rec,date){ return (rec&&rec.days&&rec.days[date])?rec.days[date]:{}; }
let alViewMonth=null;
let alSelDate=null;
// 数据迁移：旧格式 allocation[月]={need,shop,...,save}（月汇总）转成新格式 {days:{'月-01':{...}},save}，
// 旧分类汇总整体并入「当月1号」虚拟日，避免保存任意一天后旧数据丢失。幂等。
function migrateAllocation(){
  const s=load('allocation',{});let changed=false;
  Object.keys(s).forEach(function(m){
    const r=s[m]; if(!r) return;
    let nr=r;
    // 旧格式：无 days，把分类汇总并入「当月1号」虚拟日
    if(!r.days){
      const day={}; AL_EXPENSE.forEach(function(e){ if(num(r[e[0]])>0) day[e[0]]=num(r[e[0]]); });
      const days={}; if(Object.keys(day).length) days[m+'-01']=day;
      nr={days:days, save:(typeof r.save==='number'?{monthly:r.save}:(r.save&&typeof r.save==='object'?r.save:{}))};
      changed=true;
    }
    // save 字段：数字 → 对象 {monthly}
    if(typeof nr.save==='number'){ nr={days:nr.days||{}, save:{monthly:nr.save}}; changed=true; }
    else if(!nr.save||typeof nr.save!=='object'){ nr={days:nr.days||{}, save:{}}; changed=true; }
    s[m]=nr;
  });
  if(changed) save('allocation',s);
  return s;
}
function getAllocation(){ return migrateAllocation(); }
let goldViewMonth=null;
function renderAllocation(){
  const domMonth=(currentPage==='allocation'&&$('#alMonth'))?$('#alMonth').value:null;
  const month=alViewMonth||domMonth||ym(new Date());
  alViewMonth=null;
  const wageMonth=shiftMonth(month,-1);                 // 计薪月（次月发放）
  const sal=getSalaryRecord(wageMonth);
  const base=sal?num(sal.sf):0;
  const rec=getAllocation()[month]||{};
  const exp=alMonthExpense(rec);
  const expSum=alMonthExpenseSum(rec);
  const sv=alSaveTotal(rec);
  const remain=base-expSum-sv;
  // 每日支出合计
  const days=rec.days||{};
  const dayAmt={};
  Object.keys(days).forEach(function(d){const day=days[d]||{};let s=0;AL_EXPENSE.forEach(function(e){s+=num(day[e[0]]);});dayAmt[d]=s;});
  // 日历
  const ymArr=month.split('-').map(Number);
  const first=new Date(ymArr[0],ymArr[1]-1,1).getDay();
  const dim=new Date(ymArr[0],ymArr[1],0).getDate();
  let cal='<div class="wlcal-grid">';
  ['日','一','二','三','四','五','六'].forEach(function(w){cal+='<span class="wlcal-h">'+w+'</span>';});
  for(let i=0;i<first;i++)cal+='<span class="wlcal-cell empty"></span>';
  for(let d=1;d<=dim;d++){
    const ds=month+'-'+String(d).padStart(2,'0');
    const amt=dayAmt[ds]||0;
    const cls='wlcal-cell'+(amt>0?' has':'')+(alSelDate===ds?' sel':'');
    cal+='<span class="'+cls+'" data-date="'+ds+'"><span class="al-dnum">'+d+'</span>'+(amt>0?'<span class="al-day-amt">¥'+money(amt)+'</span>':'')+'</span>';
  }
  cal+='</div>';
  // 当日明细录入
  const sel=alSelDate||null;
  let dayPanel='';
  if(sel){
    const day=alDayGet(rec,sel);
    const fields=AL_EXPENSE.map(function(e){return '<div class="field"><label>'+e[1]+'</label><input type="number" class="al-day-exp" data-k="'+e[0]+'" step="any" value="'+(day[e[0]]||'')+'" placeholder="0"></div>';}).join('');
    dayPanel='<div class="card al-day-card"><h2>📝 '+sel+' 当日支出</h2>'
      +'<div class="result" style="margin-bottom:8px"><div class="line"><span>当日合计</span><b class="big" id="alDayTotal">¥'+money(dayAmt[sel]||0)+'</b></div></div>'
      +fields+'<button class="btn" type="button" id="alSaveDay">保存当日</button></div>';
  }
  // 分类汇总
  const sumCards=AL_EXPENSE.map(function(e){return '<div class="sum-sub"><span>· '+e[1]+'</span><span>¥'+money(exp[e[0]])+'</span></div>';}).join('');
  return topbar('工资分配','把钱安排得明明白白','allocation')+`
  <div class="card">
    <h2>🧾 工资分配 · 使用月 ${month}</h2>
    ${monthHeadHTML('alPrev','alNext',month)}
    <input type="hidden" id="alMonth" value="${month}">
    <div class="al-wage-card">
      <div class="al-wage-line">本页消费的是 <b>${wageMonth}</b> 的工资 · 工资次月发放</div>
      <div class="al-wage-row"><span>可用工资（${wageMonth} 实发）</span><b class="big" style="color:#E86A92">¥${money(base)}</b></div>
      <div class="al-wage-row2"><span>已支出 ¥${money(expSum)}</span><span>储蓄 ¥${money(sv)}</span><span>结余 ¥${money(remain)}</span></div>
      ${sal?'':`<div class="warn-text">⚠ 尚未录入 ${wageMonth} 工资，请先到「每月工资组成」保存，对账以 0 为基准</div>`}
    </div>
    <div class="al-flow">
      <span class="al-flow-node warn">${wageMonth} 计薪</span>
      <span class="al-flow-arrow">→ 次月发放 →</span>
      <span class="al-flow-node ok">${month} 可用池</span>
      <span class="al-flow-arrow">→ 每日支出</span>
    </div>
    <h3 class="grp-title" style="margin-top:12px">🗓 每日支出（点日期补录当天明细）</h3>
    ${cal}
    ${dayPanel}
  </div>
  <div class="card">
    <h2>💸 支出分类汇总（${month}）</h2>
    ${sumCards}
    <div class="result" style="margin:8px 0"><div class="line"><span>支出合计</span><b class="big" id="alExpenseTotal">¥${money(expSum)}</b></div></div>
    <div class="al-save-grid">
      ${AL_SAVE.map(function(l){
        if(l[0]==='monthly'){
          const mm=alSaveMonthly(rec);
          return '<div class="field"><label>🐷 '+l[1]+'（同步到「我的存款·'+l[1]+'」'+wageMonth+' 计薪月 · 细分方式）</label>'
            +'<div class="al-save-sub">'
            +'<div class="field"><label>现金</label><input type="number" id="alSave_monthly_cash" step="any" value="'+(mm.cash||'')+'" placeholder="0"></div>'
            +'<div class="field"><label>支付宝</label><input type="number" id="alSave_monthly_alipay" step="any" value="'+(mm.alipay||'')+'" placeholder="0"></div>'
            +'</div></div>';
        }
        return '<div class="field"><label>🐷 '+l[1]+'（同步到「我的存款·'+l[1]+'」'+wageMonth+' 计薪月）</label><input type="number" id="alSave_'+l[0]+'" step="any" value="'+((rec.save&&num(rec.save[l[0]]))||'')+'" placeholder="0"></div>';
      }).join('')}
    </div>
    <button class="btn" type="button" id="alSaveAlloc">保存分配</button>
    <div id="alCheck"></div>
    <p class="hint">💡 储蓄按上列四项分别记账到「我的存款」四个台账（存款 / 公积金 / 妈 / 鞋服预存），保存后会自动同步到对应台账的 ${wageMonth} 计薪月。每日支出请用上方日历点日期后「保存当日」。</p>
  </div>
  <div class="card">
    <h2>📜 每月分配历史</h2>
    <div class="list" id="alList"></div>
  </div>`;
}
function bindAllocation(){
  const monthId=()=>$('#alMonth')?$('#alMonth').value:ym(new Date());
  const wageId=()=>shiftMonth(monthId(),-1);
  const getRec=()=>getAllocation()[monthId()]||{};
  // 对账：月度支出合计(聚合 days) + 储蓄合计 = 计薪月实发
  function curSaveTotal(){
    let s=0; AL_SAVE.forEach(function(l){
      const key=l[0];
      if(key==='monthly'){ const c=$('#alSave_monthly_cash'), a=$('#alSave_monthly_alipay'); s+=num(c?c.value:0)+num(a?a.value:0); }
      else { const el=$('#alSave_'+key); s+=num(el?el.value:0); }
    }); return s;
  }
  function check(){
    const m=monthId(), wm=wageId();
    const base=getSalaryRecord(wm)?num(getSalaryRecord(wm).sf):0;
    const expSum=alMonthExpenseSum(getRec());
    const sv=curSaveTotal();
    const etBox=$('#alExpenseTotal');if(etBox)etBox.textContent='¥'+money(expSum);
    const box=$('#alCheck');if(!box)return;
    if(base===0){box.innerHTML='<div class="warn-text">未录入'+wm+'工资，无法校验账平</div>';return;}
    const total=expSum+sv;
    if(Math.abs(total-base)<0.005){box.innerHTML='<div style="color:#2BA471;font-weight:500;margin-top:6px">✅ 支出 + 储蓄 = '+wm+' 实发工资，对账一致</div>';}
    else{box.innerHTML='<div class="warn-text">账不平！支出 ¥'+money(expSum)+' + 储蓄 ¥'+money(sv)+' = ¥'+money(total)+'，与实发 ¥'+money(base)+' 相差 ¥'+money(base-total)+'</div>';}
  }
  // 日历日期点击 → 选中并渲染（带当日明细面板）
  $$('.wlcal-cell[data-date]').forEach(function(cell){
    cell.addEventListener('click',function(){ alSelDate=cell.getAttribute('data-date'); render(); });
  });
  // 当日明细：实时更新「当日合计」
  function refreshDayTotal(){
    let s=0; $$('.al-day-exp').forEach(function(inp){s+=num(inp.value);});
    const dt=$('#alDayTotal'); if(dt)dt.textContent='¥'+money(s);
  }
  // 保存当日（写入 days[date]）
  const sdB=$('#alSaveDay');
  if(sdB){
    const panel=sdB.closest('.al-day-card');
    if(panel) panel.addEventListener('input',function(e){ if(e.target.classList.contains('al-day-exp')) refreshDayTotal(); });
    sdB.addEventListener('click',function(){
      const date=alSelDate; if(!date)return;
      const day={}; AL_EXPENSE.forEach(function(e){
        const inp=panel.querySelector('.al-day-exp[data-k="'+e[0]+'"]'); day[e[0]]=inp?num(inp.value):0;
      });
      const s=getAllocation(); const r=s[monthId()]||{days:{}}; r.days=r.days||{};
      const allZero=AL_EXPENSE.every(function(e){return num(day[e[0]])===0;});
      if(allZero) delete r.days[date]; else r.days[date]=day;
      s[monthId()]=r; save('allocation',s);
      toast('当日已保存 💕'); render();
    });
  }
  // 保存分配（储蓄四项 + 分别同步到四个存款台账的计薪月）
  const sb=$('#alSaveAlloc');
  if(sb){
    AL_SAVE.forEach(function(l){
      if(l[0]==='monthly'){ ['cash','alipay'].forEach(function(sub){ const el=$('#alSave_monthly_'+sub); if(el)el.addEventListener('input',check); }); }
      else { const el=$('#alSave_'+l[0]); if(el)el.addEventListener('input',check); }
    });
    sb.addEventListener('click',function(){
      const m=monthId(), wm=wageId();
      const s=getAllocation(); const r=s[m]||{days:{}};
      const saveObj={};
      AL_SAVE.forEach(function(l){
        const key=l[0];
        if(key==='monthly'){
          const c=$('#alSave_monthly_cash'), a=$('#alSave_monthly_alipay');
          const cash=num(c?c.value:0), alipay=num(a?a.value:0);
          saveObj.monthly=(cash>0||alipay>0)?{cash:cash,alipay:alipay}:0;
        } else {
          const el=$('#alSave_'+key); saveObj[key]=num(el?el.value:0);
        }
      });
      r.save=saveObj; s[m]=r; save('allocation',s);
      setAllocSavingToLedger(wm, saveObj);   // 存款/公积金/妈/鞋服预存 分别记到计薪月（钱是计薪月赚的）
      toast('分配已保存 💕'); check(); renderAllocationList();
    });
  }
  check();renderAllocationList();bindMonthGroupToggle('#alList');enableRecDetailToggle('#alList');
  // 左右切换月份（切换时清空当日选中）
  const alPrev=$('#alPrev'),alNext=$('#alNext');
  if(alPrev)alPrev.addEventListener('click',()=>{alSelDate=null;const m=$('#alMonth');if(m){m.value=shiftMonth(m.value,-1);render();}});
  if(alNext)alNext.addEventListener('click',()=>{alSelDate=null;const m=$('#alMonth');if(m){m.value=shiftMonth(m.value,1);render();}});
}
function renderAllocationList(){
  const s=getAllocation();const box=$('#alList');if(!box)return;
  const arr=Object.keys(s).sort().reverse();
  if(!arr.length){box.innerHTML='<div class="empty">暂无分配记录</div>';return;}
  const items=arr.map(m=>{const r=s[m];
    const wm=shiftMonth(m,-1);                       // 计薪月
    const wage=getSalaryRecord(wm);
    const base=wage?num(wage.sf):0;
    const exp=alMonthExpenseSum(r);
    const sv=alSaveTotal(r);
    const remain=base-exp-sv;
    const expMap=alMonthExpense(r);
    let detail='';
    AL_EXPENSE.forEach(function(e){detail+=recLine(AL_LABEL[e[0]],'¥'+money(num(expMap[e[0]])));});
    AL_SAVE.forEach(function(l){detail+=recLine('储蓄·'+l[1],'¥'+money(alSaveVal(r,l[0])));});
    detail+=recLine('储蓄合计','¥'+money(sv));
    detail+=recLine('支出合计','¥'+money(exp));
    detail+=recLine('总合计（支出+储蓄）','¥'+money(exp+sv));
    const html=`<div class="item"><div class="meta">
      <span>📅 使用月 ${m} · 计薪 ${wm}</span><span class="amt">可用 ¥${money(base)} <span class="chev">▾</span></span></div>
    <div style="font-size:11px;opacity:.85;margin-top:4px;line-height:1.7">
      💸 已支出 ¥${money(exp)} ｜ 🐷 储蓄 ¥${money(sv)} ｜ 结余 ¥${money(remain)}
    </div>
    <div class="rec-detail" hidden>${detail}</div>
    <div style="margin-top:6px"><button class="del al-del" data-month="${m}">删除该月</button></div></div>`;
    return {year:m.slice(0,4), html};
  });
  box.innerHTML=wrapByYear(items);
  $$('#alList .al-del').forEach(b=>b.addEventListener('click',()=>{
    if(confirm(`确定删除 ${b.dataset.month} 的工资分配记录吗？\n删除后不可恢复。`)){
      const ss=getAllocation();delete ss[b.dataset.month];save('allocation',ss);
      setAllocSavingToLedger(shiftMonth(b.dataset.month,-1),{}); // 同步移除计薪月四个存款台账中的「储蓄(自动同步)」记录
      toast('已删除 💕');renderAllocationList();
    }
  }));
}

/* =========================================================
   页面：我的存款（4个独立台账）
   ========================================================= */
const DEP_LEDGERS=[['monthly','存款'],['fund','公积金'],['mom','妈'],['shoes','鞋服预存']];
// 每月存款台账细分为「现金 / 支付宝」两个子账户
const DEP_MONTHLY_SUBS=[['cash','现金'],['alipay','支付宝']];
const depCal={m:ym(new Date()),sel:ymd()};   // 合并后的单一日历状态（月份+选中日期）
const goldCal={month:ym(new Date()),sel:ymd()}; // 黄金录入日历状态
function ledgerBalance(arr){return (arr||[]).reduce((s,e)=>s+(e.type==='in'?num(e.amount):-num(e.amount)),0);}
function ledgerMonthIn(arr,month){return (arr||[]).filter(e=>e.type==='in'&&e.date&&e.date.startsWith(month)).reduce((s,e)=>s+num(e.amount),0);}
function ledgerTotalIn(arr){return (arr||[]).filter(e=>e.type==='in').reduce((s,e)=>s+num(e.amount),0);}
function ledgerTotalOut(arr){return (arr||[]).filter(e=>e.type==='out').reduce((s,e)=>s+num(e.amount),0);}
// 每月存款台账按「现金 / 支付宝」细分的余额与收支（无 sub 的旧记录归入「未分类」）
function depMonthlySub(arr){
  const m={'cash':{b:0,in:0,out:0},'alipay':{b:0,in:0,out:0},'':{b:0,in:0,out:0}};
  (arr||[]).forEach(e=>{const s=(e.sub&&m[e.sub])?e.sub:''; if(e.type==='in'){m[s].in+=num(e.amount);m[s].b+=num(e.amount);}else{m[s].out+=num(e.amount);m[s].b-=num(e.amount);}});
  return m;
}
// 仅统计存款台账中的「手动」存入（排除工资分配自动同步项），用于分配页默认值/防重复
function ledgerMonthInManual(arr,month){return (arr||[]).filter(e=>e.type==='in'&&!e.src&&e.date&&e.date.startsWith(month)).reduce((s,e)=>s+num(e.amount),0);}
// 把工资分配的储蓄（对象 {monthly,fund,mom,shoes}）分别同步写回「我的存款」四个台账
// 每个台账按 (src:'alloc' + 计薪月) 唯一，重存会先清旧项，不会重复累加
function setAllocSavingToLedger(month,saveObj){
  const d=load('deposits',{});
  DEP_LEDGERS.forEach(function(l){
    const key=l[0];
    d[key]=asArr(d[key]);
    d[key]=d[key].filter(e=>!(e.src==='alloc'&&e.date&&e.date.startsWith(month)));
    if(key==='monthly'){
      // 存款储蓄按「现金 / 支付宝」细分同步，分别记账，便于「我的存款」按方式拆分展示
      const ms=saveObj?saveObj.monthly:0;
      let cash=0,alipay=0;
      if(ms&&typeof ms==='object'){cash=num(ms.cash);alipay=num(ms.alipay);} else {cash=num(ms);}
      if(cash>0) d[key].push({id:uid(),date:month+'-01',type:'in',amount:cash,note:'工资分配·储蓄(自动同步)',src:'alloc',sub:'cash'});
      if(alipay>0) d[key].push({id:uid(),date:month+'-01',type:'in',amount:alipay,note:'工资分配·储蓄(自动同步)',src:'alloc',sub:'alipay'});
    } else {
      const amt=num(saveObj?saveObj[key]:0);
      if(amt>0) d[key].push({id:uid(),date:month+'-01',type:'in',amount:amt,note:'工资分配·储蓄(自动同步)',src:'alloc'});
    }
  });
  save('deposits',d);
}
function renderDeposit(){
  let cards=`<div class="card">
    <h2>💰 存款总览</h2>
    <div class="result" id="depSummary"></div>
    <p class="hint">四个台账的当前余额（累计）分别汇总如上；录入请在下方选择台账与日期。</p>
  </div>`;

  cards+=`<div class="card">
    <h2>📝 录入存款台账</h2>
    <div class="field"><label>选择台账</label>
      <select id="depLedgerSel">
        ${DEP_LEDGERS.map(([key,name])=>`<option value="${key}">${name}</option>`).join('')}
      </select>
    </div>
    <div class="cal-wrap">
      <div class="wlcal-head">
        <button type="button" class="wlcal-nav" id="depPrev">‹</button>
        <span class="wlcal-month" id="depMon">${depCal.m}</span>
        <button type="button" class="wlcal-nav" id="depNext">›</button>
      </div>
      <div class="wlcal-sub"><span>📅 点选日期记录；有金额的日期会直接显示当日存入/取出</span><span class="wlcal-sel" id="depSel">${depCal.sel}</span></div>
      <div class="wlcal" id="depCal"></div>
      <div id="depDayDetail" style="margin-top:8px"></div>
    </div>
    <form id="depForm">
      <div class="row2">
        <div class="field"><label>存入</label><input type="number" name="in" step="any" placeholder="0"></div>
        <div class="field"><label>取出</label><input type="number" name="out" step="any" placeholder="0"></div>
      </div>
      <div class="field"><label>备注</label><input type="text" name="note" placeholder="选填"></div>
      <div class="field" id="depSubField" style="display:none"><label>存入方式（存款细分）</label>
        <select id="depSubSel" name="sub">${DEP_MONTHLY_SUBS.map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select>
      </div>
      <button class="btn sm" type="submit">记录</button>
    </form>
  </div>

  <div class="card">
    <h2>📜 历史流水记录（按月份折叠）</h2>
    <p class="hint">汇总全部四个台账，按月份分组；每月头部显示本月存入 / 取出合计，展开后可直接看到每个台账当月存入 / 取出多少。每日明细已改到上方日历中显示：有金额的日期会标注当日存入/取出，点选日期可看当日明细。</p>
    <div class="list" id="depList"></div>
  </div>`;
  return topbar('我的存款','一点点攒起来的安心', 'deposit')+cards;
}
function renderDepCal(){
  const box=$('#depCal');if(!box)return;
  // 选中日期若不在当前展示月份，则归位到展示月份首日，避免跨月选中混乱
  if(depCal.sel.slice(0,7)!==depCal.m)depCal.sel=depCal.m+'-01';
  const [y,mo]=depCal.m.split('-').map(Number);
  const first=new Date(y,mo-1,1).getDay();
  const dim=new Date(y,mo,0).getDate();
  // 汇总四个台账每日存取金额，在日历上直接体现
  const dayMap={};
  const dep=load('deposits',{});
    DEP_LEDGERS.forEach(([key])=>{
      asArr(dep[key]).forEach(e=>{
      if(!e.date)return;
      const d=dayMap[e.date]||={in:0,out:0};
      if(e.type==='in')d.in+=num(e.amount);else d.out+=num(e.amount);
    });
  });
  const compact=n=>String(parseFloat(money(n)));
  const mm=$('#depMon');if(mm)mm.textContent=depCal.m;
  const ss=$('#depSel');if(ss)ss.textContent=depCal.sel;
  let h='';['日','一','二','三','四','五','六'].forEach(w=>{h+='<span class="wlcal-h">'+w+'</span>';});
  for(let i=0;i<first;i++)h+='<span class="wlcal-cell empty"></span>';
  for(let d=1;d<=dim;d++){
    const ds=depCal.m+'-'+String(d).padStart(2,'0');
    const dm=dayMap[ds]||{in:0,out:0};
    const has=dm.in>0||dm.out>0;
    const cls='wlcal-cell'+(ds===depCal.sel?' sel':'')+(has?' has':'');
    let amts='';
    if(has){
      if(dm.in>0&&dm.out>0) amts='<span class="cal-in">+'+compact(dm.in)+'</span><span class="cal-out">-'+compact(dm.out)+'</span>';
      else if(dm.in>0) amts='<span class="cal-in">+'+compact(dm.in)+'</span>';
      else amts='<span class="cal-out">-'+compact(dm.out)+'</span>';
    }
    h+='<span class="'+cls+'" data-date="'+ds+'"><span class="cal-day">'+d+'</span>'+(has?'<span class="cal-amts">'+amts+'</span>':'')+'</span>';
  }
  box.innerHTML=h;
}
// 日历点击后展示当日明细（含删除），替代历史流水里的逐条记录
function renderDepDayDetail(date){
  const box=$('#depDayDetail');if(!box)return;
  const dep=load('deposits',{});
  const all=[];
  DEP_LEDGERS.forEach(([key,name])=>{
    asArr(dep[key]).filter(e=>e.date===date).forEach(e=>{
      const subname=(key==='monthly'&&e.sub)?((DEP_MONTHLY_SUBS.find(([k])=>k===e.sub)||[])[1]||''):'';
      all.push(Object.assign({},e,{lkey:key,lname:name,subname}));
    });
  });
  if(!all.length){box.innerHTML='';return;}
  all.sort((a,b)=>a.id.localeCompare(b.id));
  const html=all.map(e=>{
    const tag=e.lname+(e.subname?('·'+e.subname):'');
    return `<div class="day-rec"><span class="day-rec-tag">${tag}</span><span class="day-rec-amt ${e.type==='in'?'in':'out'}">${e.type==='in'?'+':'-'}¥${money(num(e.amount))}</span><button class="del" data-key="${e.lkey}" data-id="${e.id}">删除</button></div>`;
  }).join('');
  box.innerHTML=`<div class="day-rec-title">📅 ${date} 当日明细</div>`+html;
  $$('#depDayDetail .del').forEach(b=>b.addEventListener('click',()=>{
    const d=load('deposits',{});
    if(d[b.dataset.key])d[b.dataset.key]=d[b.dataset.key].filter(x=>x.id!==b.dataset.id);
    save('deposits',d);toast('已删除');
    renderDepCal();renderDepositList();renderDepDayDetail(date);renderDepositSummary();
  }));
}
function renderDepositSummary(){
  const box=$('#depSummary');if(!box)return;
  let totalIn=0,totalOut=0,totalBal=0;
  const dep=load('deposits',{});
  const totals=DEP_LEDGERS.map(([key,name])=>{
    const arr=asArr(dep[key]);
    const b=ledgerBalance(arr);
    const tin=ledgerTotalIn(arr),tout=ledgerTotalOut(arr);
    totalIn+=tin;totalOut+=tout;totalBal+=b;
    return {name,key,b,tin,tout,arr};
  });
  let html=`<div class="line"><span>存款总计（全部台账）</span><b class="big" style="color:#E86A92">¥${money(totalBal)}</b></div>`;
  totals.forEach(({name,key,b,tin,tout,arr})=>{
    let subHtml='';
    if(key==='monthly'){
      const sub=depMonthlySub(arr);
      subHtml=DEP_MONTHLY_SUBS.map(([sk,sn])=>{const s=sub[sk];
        return `<div class="yh-row yh-flow dep-sub-row"><span>${sn} 存入 ¥${money(s.in)}</span><span>余额 ¥${money(s.b)}</span></div>`;
      }).join('')
      +((sub[''].in||sub[''].out)?`<div class="yh-row yh-flow dep-sub-row other"><span>未分类 存入 ¥${money(sub[''].in)}</span></div>`:'');
    }
    html+=`<div class="line yh-ledger-line">
      <span class="yh-name">${name}</span>
      <div class="yh-ledger-detail">
        <div class="yh-row yh-bal"><span>余额</span><b>¥${money(b)}</b></div>
        <div class="yh-row yh-flow"><span>存入 ¥${money(tin)}</span><span>取出 ¥${money(tout)}</span></div>
        ${subHtml}
      </div>
    </div>`;
  });
  box.innerHTML=html
    +`<div class="line"><span>累计存入（全部）</span><b>¥${money(totalIn)}</b></div>`
    +`<div class="line"><span>累计取出（全部）</span><b>¥${money(totalOut)}</b></div>`;
}
function bindDeposit(){
  const form=$('#depForm');
  const toggleDepSub=(key)=>{const f=$('#depSubField');if(f)f.style.display=(key==='monthly')?'block':'none';};
  if(form)form.addEventListener('submit',e=>{
    e.preventDefault();
    const key=$('#depLedgerSel').value;
    const vIn=num(form.in.value),vOut=num(form.out.value);
    if(vIn<=0&&vOut<=0){toast('请输入存入或取出金额');return;}
    const d=load('deposits',{});d[key]=asArr(d[key]);
    const recDate=depCal.sel;
    const subObj=(key==='monthly'&&form.sub)?{sub:form.sub.value}:{};
    if(vIn>0)d[key].push(Object.assign({id:uid(),date:recDate,type:'in',amount:vIn,note:form.note.value},subObj));
    if(vOut>0)d[key].push(Object.assign({id:uid(),date:recDate,type:'out',amount:vOut,note:form.note.value},subObj));
    save('deposits',d);form.reset();toggleDepSub(key);toast('已记录 💕');
    renderDepositList();renderDepCal();renderDepDayDetail(depCal.sel);renderDepositSummary();
  });
  const sel=$('#depLedgerSel');
  if(sel)sel.addEventListener('change',()=>{
    const k=sel.value;toggleDepSub(k);renderDepCal();renderDepositList();
  });
  const cal=$('#depCal');
  if(cal)cal.addEventListener('click',e=>{
    const cell=e.target.closest('.wlcal-cell');if(!cell||cell.classList.contains('empty'))return;
    depCal.sel=cell.dataset.date;renderDepCal();renderDepDayDetail(depCal.sel);
  });
  const prev=$('#depPrev'),next=$('#depNext');
  if(prev)prev.addEventListener('click',()=>{depCal.m=shiftMonth(depCal.m,-1);renderDepCal();renderDepDayDetail(depCal.sel);});
  if(next)next.addEventListener('click',()=>{depCal.m=shiftMonth(depCal.m,1);renderDepCal();renderDepDayDetail(depCal.sel);});
  const k=$('#depLedgerSel')?$('#depLedgerSel').value:'monthly';
  toggleDepSub(k);renderDepCal();renderDepositList();renderDepDayDetail(depCal.sel);bindMonthGroupToggle('#depList');renderDepositSummary();
}
function renderDepositList(){
  const dep=load('deposits',{});const box=$('#depList');if(!box)return;
  // 汇总四个台账的全部记录，并标注所属台账（每月存款再标注现金/支付宝）
  const all=[];
  DEP_LEDGERS.forEach(([key,name])=>{
    asArr(dep[key]).forEach(e=>{
      const subname=(key==='monthly'&&e.sub)?((DEP_MONTHLY_SUBS.find(([k])=>k===e.sub)||[])[1]||''):'';
      all.push(Object.assign({},e,{lkey:key,lname:name,subname}));
    });
  });
  if(!all.length){box.innerHTML='<div class="empty">暂无流水</div>';return;}
  const sorted=all.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  // 按月份分组（倒序），只保留每月汇总，不再列出每日明细
  const groups=groupByMonthDesc(sorted,r=>r.date.slice(0,7));
  const monthItems=groups.map(g=>{
    // 本月四个台账各自的存入 / 取出
    const per={};DEP_LEDGERS.forEach(([key])=>per[key]={in:0,out:0});
    g.items.forEach(e=>{if(e.type==='in')per[e.lkey].in+=num(e.amount);else per[e.lkey].out+=num(e.amount);});
    const sumRows=DEP_LEDGERS.map(([key,name])=>{
      const v=per[key];
      if(key==='monthly'){
        // 每月存款细分为「现金 / 支付宝」，并兼容无 sub 的旧记录（归入未分类）
        const sub={cash:{in:0,out:0},alipay:{in:0,out:0},'':{in:0,out:0}};
        g.items.filter(e=>e.lkey==='monthly').forEach(e=>{const s=(e.sub&&sub[e.sub])?e.sub:'';if(e.type==='in')sub[s].in+=num(e.amount);else sub[s].out+=num(e.amount);});
        let rows=`<div class="sum-row"><span>${name}</span><span>存入 <b style="color:#2BA471">¥${money(v.in)}</b> ｜ 取出 <b style="color:#E86A92">¥${money(v.out)}</b></span></div>`;
        DEP_MONTHLY_SUBS.forEach(([sk,sn])=>{const t=sub[sk];rows+=`<div class="sum-sub"><span>${sn}</span><span>存入 ¥${money(t.in)} ｜ 取出 ¥${money(t.out)}</span></div>`;});
        if(sub[''].in||sub[''].out)rows+=`<div class="sum-sub other"><span>未分类</span><span>存入 ¥${money(sub[''].in)} ｜ 取出 ¥${money(sub[''].out)}</span></div>`;
        return rows;
      }
      return `<div class="sum-row"><span>${name}</span><span>存入 <b style="color:#2BA471">¥${money(v.in)}</b> ｜ 取出 <b style="color:#E86A92">¥${money(v.out)}</b></span></div>`;
    }).join('');
    const monthIn=DEP_LEDGERS.reduce((s,[key])=>s+per[key].in,0);
    const monthOut=DEP_LEDGERS.reduce((s,[key])=>s+per[key].out,0);
    const sumBlock=`<div class="month-sum">${sumRows}
      <div class="sum-row total"><span>本月合计</span><span>存入 <b style="color:#2BA471">¥${money(monthIn)}</b> ｜ 取出 <b style="color:#E86A92">¥${money(monthOut)}</b></span></div>
    </div>`;
    return {year:g.month.slice(0,4), html:mgroupHTML(g.month,`存入 ¥${money(monthIn)} ｜ 取出 ¥${money(monthOut)}`,sumBlock)};
  });
  // 按年份外层折叠分组（默认折叠），年份内再按月份分组（嵌套，亦可单独展开）
  box.innerHTML=wrapByYear(monthItems);
  renderDepositSummary();
}

/* =========================================================
   页面：持有黄金（仅总持有克数，手动录入保存）
   ========================================================= */
function getGoldTotal(){
  const arr=load('gold_records',[]);
  return arr.reduce((s,e)=>s+num(e.qty),0);
}
function renderGold(){
  const cur=getGoldTotal();
  return topbar('持有黄金','记录你持有的黄金克数', 'gold')+`
  <div class="card">
    <h2>🪙 黄金汇总</h2>
    <div class="result" style="margin-top:6px">
      <div class="line"><span>总持有克数（累计）</span><b class="big">${pF(cur)} 克</b></div>
    </div>
    <p class="hint">汇总为所有「黄金变动」记录逐条累加之和，与日期无关。卖出请用负数（如 -5）。</p>
  </div>
  <div class="card">
    <h2>✏️ 录入黄金变动</h2>
    <div class="cal-wrap">
      <div class="wlcal-head">
        <button type="button" class="wlcal-nav" id="goldCalPrev">‹</button>
        <span class="wlcal-month" id="goldCalMonth">${goldCal.month}</span>
        <button type="button" class="wlcal-nav" id="goldCalNext">›</button>
      </div>
      <div class="wlcal-sub"><span>📅 点选日期</span><span class="wlcal-sel" id="goldCalSel">${goldCal.sel}</span></div>
      <div class="wlcal" id="goldCal"></div>
    </div>
    <form id="goldForm">
      <div class="field"><label>变动克数（正买入 / 负卖出）</label><input type="number" name="qty" step="any" placeholder="如 10 或 -5"></div>
      <button class="btn" type="submit">保存记录</button>
    </form>
    <p class="hint">每条记录是一次克数变动，汇总会把所有记录相加。本页独立，不与其他页面联动，也无云端上传。</p>
  </div>
  <div class="card">
    <h2>📜 黄金变动记录</h2>
    <div class="list" id="goldList"></div>
  </div>`;
}
function renderGoldCal(){
  const box=$('#goldCal');if(!box)return;
  if(goldCal.sel.slice(0,7)!==goldCal.month)goldCal.sel=goldCal.month+'-01';
  const [y,mo]=goldCal.month.split('-').map(Number);
  const first=new Date(y,mo-1,1).getDay();
  const dim=new Date(y,mo,0).getDate();
  const recSet=new Set(load('gold_records',[]).map(e=>e.date).filter(Boolean));
  const mm=$('#goldCalMonth');if(mm)mm.textContent=goldCal.month;
  const ss=$('#goldCalSel');if(ss)ss.textContent=goldCal.sel;
  let h='';['日','一','二','三','四','五','六'].forEach(w=>{h+='<span class="wlcal-h">'+w+'</span>';});
  for(let i=0;i<first;i++)h+='<span class="wlcal-cell empty"></span>';
  for(let d=1;d<=dim;d++){
    const ds=goldCal.month+'-'+String(d).padStart(2,'0');
    const cls='wlcal-cell'+(ds===goldCal.sel?' sel':'')+(recSet.has(ds)?' has':'');
    h+='<span class="'+cls+'" data-date="'+ds+'">'+d+(recSet.has(ds)?'<i></i>':'')+'</span>';
  }
  box.innerHTML=h;
}
function bindGold(){
  $('#goldForm').addEventListener('submit',e=>{
    e.preventDefault();const f=e.target;
    if(f.qty.value===''||isNaN(num(f.qty.value))){toast('请输入变动克数');return;}
    const qty=num(f.qty.value);
    const arr=load('gold_records',[]);arr.push({id:uid(),date:goldCal.sel,qty:qty});save('gold_records',arr);
    toast('已保存 💕');render();
  });
  renderGoldCal();
  const gPrev=$('#goldCalPrev'),gNext=$('#goldCalNext');
  if(gPrev)gPrev.addEventListener('click',()=>{goldCal.month=shiftMonth(goldCal.month,-1);renderGoldCal();});
  if(gNext)gNext.addEventListener('click',()=>{goldCal.month=shiftMonth(goldCal.month,1);renderGoldCal();});
  const gcal=$('#goldCal');
  if(gcal)gcal.addEventListener('click',e=>{
    const cell=e.target.closest('.wlcal-cell');if(!cell||cell.classList.contains('empty'))return;
    goldCal.sel=cell.dataset.date;renderGoldCal();
  });
  renderGoldList();bindMonthGroupToggle('#goldList');enableRecDetailToggle('#goldList');
}
function renderGoldList(){
  const arr=load('gold_records',[]);
  const box=$('#goldList');if(!box)return;
  // 绝对累计余额（跨全部历史，保证按月筛选后仍展示正确累计值）
  const asc=arr.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  let run=0;const balMap={};asc.forEach(e=>{run+=num(e.qty);balMap[e.id]=run;});
  const sorted=arr.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(b.id));
  if(!sorted.length){box.innerHTML='<div class="empty">暂无记录</div>';return;}
  const items=sorted.map(e=>{
    const detail=recLine('日期',e.date)
      +recLine('变动克数',(num(e.qty)>=0?'+':'')+pF(num(e.qty))+' 克')
      +recLine('累计持有',pF(balMap[e.id])+' 克');
    const html=`<div class="item"><div class="meta">
    <span>📆 ${e.date}</span><span class="amt">${num(e.qty)>=0?'+':''}${pF(num(e.qty))} 克 <span class="chev">▾</span></span></div>
    <div class="meta" style="margin-top:4px"><span>累计</span><b>${pF(balMap[e.id])} 克</b></div>
    <div class="rec-detail" hidden>${detail}</div>
    <div style="margin-top:6px"><button class="del" data-id="${e.id}">删除</button></div></div>`;
    return {year:e.date.slice(0,4), html};
  });
  box.innerHTML=wrapByYear(items);
  $$('#goldList .del').forEach(b=>b.addEventListener('click',()=>{
    save('gold_records',load('gold_records',[]).filter(x=>x.id!==b.dataset.id));render();toast('已删除');
  }));
}

/* =========================================================
   页面：易豪存款（单一台账「每月存款」· 细分为 现金 / 支付宝）
   数据结构与「我的存款」对齐：记录为交易流水 {date,type,in/out,amount,sub,note}
   ========================================================= */
// 易豪存款日历状态（月份 + 选中日期），与「我的存款」的 depCal 平行
const yhCal={m:ym(new Date()),sel:ymd()};
// 易豪存款：多台账。每月存款细分「现金 / 支付宝」；固定资产无细分
const YH_LEDGERS=[['monthly','每月存款'],['asset','固定资产']];
let yhLedger='monthly';
// 旧版「yihao」月度数据（{month,deposit,expense,note}）一次性迁移到新结构 {monthly:[...]}
function migrateYihao(){
  const old=load('yihao',null);
  if(old===null)return;
  const dep=load('yihaoDep',{})||{};dep.monthly=asArr(dep.monthly);
  if(Array.isArray(old)){
    old.forEach(r=>{
      const note=r.note||'';const m=(r.month||ym(new Date()))+'-01';
      if(num(r.deposit)>0)dep.monthly.push({id:uid(),date:m,type:'in',amount:num(r.deposit),sub:'uncat',note});
      if(num(r.expense)>0)dep.monthly.push({id:uid(),date:m,type:'out',amount:num(r.expense),sub:'uncat',note});
    });
  }
  save('yihaoDep',dep);
  try{localStorage.removeItem(PREFIX+'yihao');}catch(e){}
}
function getYihaoArr(){ migrateYihao(); const d=load('yihaoDep',{})||{}; return asArr(d[yhLedger]); }
function yhSaveArr(arr){ const d=load('yihaoDep',{})||{}; d[yhLedger]=arr; save('yihaoDep',d); }
function getAllYihaoArr(){ migrateYihao(); const d=load('yihaoDep',{})||{}; return YH_LEDGERS.reduce((a,[k])=>a.concat(asArr(d[k]).map(e=>Object.assign({ledger:k},e))),[]); }
function renderYihao(){
  return topbar('易豪存款','每一笔都清清楚楚', 'yihao')+`
  <div class="card">
    <h2>🐶 存款总览</h2>
    <div class="result" id="yhSummary"></div>
    <p class="hint" id="yhHint"></p>
  </div>
  <div class="card">
    <h2 id="yhFormTitle">📝 录入存款（每月存款）</h2>
    <div class="ledger-switch" id="yhLedgerSwitch" style="margin-bottom:8px">${YH_LEDGERS.map(([k,n])=>`<button type="button" data-yh-ledger="${k}" class="${yhLedger===k?'on':''}">${n}</button>`).join('')}</div>
    <div class="cal-wrap">
      <div class="wlcal-head">
        <button type="button" class="wlcal-nav" id="yhPrev">‹</button>
        <span class="wlcal-month" id="yhMon">${yhCal.m}</span>
        <button type="button" class="wlcal-nav" id="yhNext">›</button>
      </div>
      <div class="wlcal-sub"><span>📅 点选日期记录；有金额的日期会直接显示当日存入/取出</span><span class="wlcal-sel" id="yhSel">${yhCal.sel}</span></div>
      <div class="wlcal" id="yhCal"></div>
      <div id="yhDayDetail" style="margin-top:8px"></div>
    </div>
    <form id="yhForm">
      <div class="row2">
        <div class="field"><label>存入</label><input type="number" name="in" step="any" placeholder="0"></div>
        <div class="field"><label>取出</label><input type="number" name="out" step="any" placeholder="0"></div>
      </div>
      <div class="field" id="yhSubField"><label>存入方式（存款细分）</label>
        <select name="sub">${DEP_MONTHLY_SUBS.map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select>
      </div>
      <div class="field"><label>备注</label><input type="text" name="note" placeholder="选填"></div>
      <button class="btn sm" type="submit">记录</button>
    </form>
  </div>
  <div class="card">
    <h2>📜 历史流水记录（两个台账合并 · 按月份折叠）</h2>
    <p class="hint">汇总「每月存款 + 固定资产」全部流水，按月份分组；每月头部分别体现两个台账的存入/取出并给出本月合计。每日明细已改到上方日历中显示：有金额的日期会标注当日存入/取出，点选日期可看当日明细。</p>
    <div class="list" id="yhList"></div>
  </div>`;
}
function renderYihaoSummary(){
  const box=$('#yhSummary');if(!box)return;
  const all=getAllYihaoArr();
  const totalBal=all.reduce((s,e)=>s+(e.type==='in'?num(e.amount):-num(e.amount)),0);
  const totalIn=all.filter(e=>e.type==='in').reduce((s,e)=>s+num(e.amount),0);
  const totalOut=all.filter(e=>e.type==='out').reduce((s,e)=>s+num(e.amount),0);
  let html=`<div class="line"><span>易豪存款总计（全部台账）</span><b class="big" style="color:#E86A92">¥${money(totalBal)}</b></div>`;
  // 汇总展示全部台账：每月存款 + 固定资产
  const depData=load('yihaoDep',{})||{};
  YH_LEDGERS.forEach(([key,name])=>{
    const arr=depData[key]||[];
    const bal=arr.reduce((s,e)=>s+(e.type==='in'?num(e.amount):-num(e.amount)),0);
    const sIn=arr.filter(e=>e.type==='in').reduce((s,e)=>s+num(e.amount),0);
    const sOut=arr.filter(e=>e.type==='out').reduce((s,e)=>s+num(e.amount),0);
    html+=`<div class="line yh-ledger-line">
      <span class="yh-name">${name}</span>
      <div class="yh-ledger-detail">
        <div class="yh-row yh-bal"><span>余额</span><b>¥${money(bal)}</b></div>
        <div class="yh-row yh-flow"><span>存入 ¥${money(sIn)}</span><span>取出 ¥${money(sOut)}</span></div>${key==='monthly'?(function(){
          const sub=depMonthlySub(arr);
          return DEP_MONTHLY_SUBS.map(([sk,sn])=>{const t=sub[sk]||{in:0,out:0};
            return `<div class="sum-sub"><span>· ${sn}</span><span>存入 ¥${money(t.in)} ｜ 取出 ¥${money(t.out)}</span></div>`;
          }).join('');
        })():''}
      </div>
    </div>`;
  });
  box.innerHTML=html
    +`<div class="line"><span>累计存入（全部）</span><b>¥${money(totalIn)}</b></div>`
    +`<div class="line"><span>累计取出（全部）</span><b>¥${money(totalOut)}</b></div>`;
  const ft=$('#yhFormTitle');if(ft)ft.textContent=(yhLedger==='monthly'?'📝 录入存款（每月存款）':'📝 录入固定资产');
  const sf=$('#yhSubField');if(sf)sf.style.display=(yhLedger==='monthly')?'':'none';
  const hint=$('#yhHint');if(hint)hint.textContent=(yhLedger==='monthly'
    ? '存款总计 = 累计存入 − 累计取出，细分为「现金 / 支付宝」。下方录入请用日历点选日期。'
    : '固定资产台账：记录资产购入与处置，无现金/支付宝细分。余额 = 累计购入 − 累计处置。');
}
function renderYihaoCal(){
  const box=$('#yhCal');if(!box)return;
  if(yhCal.sel.slice(0,7)!==yhCal.m)yhCal.sel=yhCal.m+'-01';
  const [y,mo]=yhCal.m.split('-').map(Number);
  const first=new Date(y,mo-1,1).getDay();
  const dim=new Date(y,mo,0).getDate();
  // 汇总每日存取金额，在日历上直接体现
  const dayMap={};
  getYihaoArr().forEach(e=>{
    if(!e.date)return;
    const d=dayMap[e.date]||={in:0,out:0};
    if(e.type==='in')d.in+=num(e.amount);else d.out+=num(e.amount);
  });
  const compact=n=>String(parseFloat(money(n)));
  const mm=$('#yhMon');if(mm)mm.textContent=yhCal.m;
  const ss=$('#yhSel');if(ss)ss.textContent=yhCal.sel;
  let h='';WEEK.forEach(w=>{h+='<span class="wlcal-h">'+w+'</span>';});
  for(let i=0;i<first;i++)h+='<span class="wlcal-cell empty"></span>';
  for(let d=1;d<=dim;d++){
    const ds=yhCal.m+'-'+String(d).padStart(2,'0');
    const dm=dayMap[ds]||{in:0,out:0};
    const has=dm.in>0||dm.out>0;
    const cls='wlcal-cell'+(ds===yhCal.sel?' sel':'')+(has?' has':'');
    let amts='';
    if(has){
      if(dm.in>0&&dm.out>0) amts='<span class="cal-in">+'+compact(dm.in)+'</span><span class="cal-out">-'+compact(dm.out)+'</span>';
      else if(dm.in>0) amts='<span class="cal-in">+'+compact(dm.in)+'</span>';
      else amts='<span class="cal-out">-'+compact(dm.out)+'</span>';
    }
    h+='<span class="'+cls+'" data-date="'+ds+'"><span class="cal-day">'+d+'</span>'+(has?'<span class="cal-amts">'+amts+'</span>':'')+'</span>';
  }
  box.innerHTML=h;
}
// 日历点击后展示当日明细（含删除），替代历史流水里的逐条记录
function renderYihaoDayDetail(date){
  const box=$('#yhDayDetail');if(!box)return;
  const all=getYihaoArr().filter(e=>e.date===date);
  if(!all.length){box.innerHTML='';return;}
  all.sort((a,b)=>a.id.localeCompare(b.id));
  const html=all.map(e=>{
    const subname=(e.sub)?((DEP_MONTHLY_SUBS.find(([k])=>k===e.sub)||[])[1]||'未分类'):'未分类';
    const tag=(yhLedger==='monthly')?('存款·'+subname):'固定资产';
    return `<div class="day-rec"><span class="day-rec-tag">${tag}</span><span class="day-rec-amt ${e.type==='in'?'in':'out'}">${e.type==='in'?'+':'-'}¥${money(num(e.amount))}</span><button class="del" data-id="${e.id}">删除</button></div>`;
  }).join('');
  box.innerHTML=`<div class="day-rec-title">📅 ${date} 当日明细</div>`+html;
  $$('#yhDayDetail .del').forEach(b=>b.addEventListener('click',()=>{
    yhSaveArr(getYihaoArr().filter(x=>x.id!==b.dataset.id));toast('已删除');
    renderYihaoCal();renderYihaoList();renderYihaoSummary();renderYihaoDayDetail(date);
  }));
}
function bindYihao(){
  const sw=$('#yhLedgerSwitch');
  if(sw)sw.addEventListener('click',e=>{
    const b=e.target.closest('button[data-yh-ledger]');if(!b)return;
    if(yhLedger===b.dataset.yhLedger)return;
    e.stopPropagation();
    yhLedger=b.dataset.yhLedger;
    render();
  });
  const form=$('#yhForm');
  if(form)form.addEventListener('submit',e=>{
    e.preventDefault();
    const vIn=num(form.in.value),vOut=num(form.out.value);
    if(vIn<=0&&vOut<=0){toast('请输入存入或取出金额');return;}
    const arr=getYihaoArr();
    const recDate=yhCal.sel;
    const subObj=(yhLedger==='monthly'&&form.sub)?{sub:form.sub.value}:{};
    if(vIn>0)arr.push(Object.assign({id:uid(),date:recDate,type:'in',amount:vIn,note:form.note.value},subObj));
    if(vOut>0)arr.push(Object.assign({id:uid(),date:recDate,type:'out',amount:vOut,note:form.note.value},subObj));
    yhSaveArr(arr);form.reset();toast('已记录 💕');
    renderYihaoList();renderYihaoCal();renderYihaoSummary();renderYihaoDayDetail(yhCal.sel);
  });
  const cal=$('#yhCal');
  if(cal)cal.addEventListener('click',e=>{
    const cell=e.target.closest('.wlcal-cell');if(!cell||cell.classList.contains('empty'))return;
    yhCal.sel=cell.dataset.date;renderYihaoCal();renderYihaoDayDetail(yhCal.sel);
  });
  const prev=$('#yhPrev'),next=$('#yhNext');
  if(prev)prev.addEventListener('click',()=>{yhCal.m=shiftMonth(yhCal.m,-1);renderYihaoCal();renderYihaoDayDetail(yhCal.sel);});
  if(next)next.addEventListener('click',()=>{yhCal.m=shiftMonth(yhCal.m,1);renderYihaoCal();renderYihaoDayDetail(yhCal.sel);});
  renderYihaoCal();renderYihaoList();renderYihaoSummary();renderYihaoDayDetail(yhCal.sel);bindMonthGroupToggle('#yhList');
}
function renderYihaoList(){
  // 历史流水：两个台账（每月存款 + 固定资产）合并在一起记录、展示，不随切换而筛选
  const arr=getAllYihaoArr();const box=$('#yhList');if(!box)return;
  if(!arr.length){box.innerHTML='<div class="empty">暂无流水</div>';return;}
  const sorted=arr.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(b.id));
  // 按月份分组（倒序），只保留每月汇总，不再列出每日明细
  const groups=groupByMonthDesc(sorted,r=>r.date.slice(0,7));
  const monthItems=groups.map(g=>{
    const monthly=g.items.filter(e=>e.ledger==='monthly');
    const asset=g.items.filter(e=>e.ledger==='asset');
    const monthIn=g.items.filter(e=>e.type==='in').reduce((s,e)=>s+num(e.amount),0);
    const monthOut=g.items.filter(e=>e.type==='out').reduce((s,e)=>s+num(e.amount),0);
    let sumBlock=`<div class="month-sum">`;
    // 每月存款台账：现金 / 支付宝细分
    if(monthly.length){
      const sub={cash:{in:0,out:0},alipay:{in:0,out:0},'':{in:0,out:0}};
      monthly.forEach(e=>{const s=(e.sub&&sub[e.sub])?e.sub:'';if(e.type==='in')sub[s].in+=num(e.amount);else sub[s].out+=num(e.amount);});
      const mIn=monthly.filter(e=>e.type==='in').reduce((s,e)=>s+num(e.amount),0);
      const mOut=monthly.filter(e=>e.type==='out').reduce((s,e)=>s+num(e.amount),0);
      const subRows=DEP_MONTHLY_SUBS.map(([sk,sn])=>{const t=sub[sk];
        return `<div class="sum-row"><span>💵 ${sn}</span><span>存入 <b style="color:#2BA471">¥${money(t.in)}</b> ｜ 取出 <b style="color:#E86A92">¥${money(t.out)}</b></span></div>`;
      }).join('');
      let other='';if(sub[''].in||sub[''].out)other=`<div class="sum-row other"><span>💵 未分类</span><span>存入 ¥${money(sub[''].in)} ｜ 取出 ¥${money(sub[''].out)}</span></div>`;
      sumBlock+=`<div class="sum-row total" style="border-top:none"><span>🐶 每月存款</span><span>存入 <b style="color:#2BA471">¥${money(mIn)}</b> ｜ 取出 <b style="color:#E86A92">¥${money(mOut)}</b></span></div>${subRows}${other}`;
    }
    // 固定资产台账：购入 / 处置
    if(asset.length){
      const aIn=asset.filter(e=>e.type==='in').reduce((s,e)=>s+num(e.amount),0);
      const aOut=asset.filter(e=>e.type==='out').reduce((s,e)=>s+num(e.amount),0);
      sumBlock+=`<div class="sum-row total"><span>🏠 固定资产</span><span>购入 <b style="color:#2BA471">¥${money(aIn)}</b> ｜ 处置 <b style="color:#E86A92">¥${money(aOut)}</b></span></div>`;
    }
    sumBlock+=`<div class="sum-row total"><span>本月合计（全部）</span><span>存入 <b style="color:#2BA471">¥${money(monthIn)}</b> ｜ 取出 <b style="color:#E86A92">¥${money(monthOut)}</b></span></div></div>`;
    return {year:g.month.slice(0,4), html:mgroupHTML(g.month,`存入 ¥${money(monthIn)} ｜ 取出 ¥${money(monthOut)}`,sumBlock)};
  });
  // 按年份外层折叠分组（默认折叠），年份内再按月份分组（嵌套，亦可单独展开）
  box.innerHTML=wrapByYear(monthItems);
}

/* =========================================================
   导出 / 导入 备份
   ========================================================= */
function exportBackup(){
  const data={};
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k.startsWith(PREFIX))data[k]=localStorage.getItem(k);
  }
  const json=JSON.stringify(data,null,2);
  const ta=$('#backupText'); if(ta){ta.value=json; ta.scrollTop=0;}
  const blob=new Blob([json],{type:'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='工作台备份_'+ymd()+'.txt';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>{try{URL.revokeObjectURL(a.href);}catch(e){}},2000);
  toast('已生成备份，可下载或复制文本 💾');
}

function importBackup(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      if(typeof data!=='object'||!data)throw 0;
      let n=0;
      for(const k in data){
        if(k.startsWith(PREFIX)){localStorage.setItem(k,data[k]);n++;}
      }
      if(n===0){toast('未找到工作台数据');return;}
      toast('已恢复 '+n+' 条记录 💕');
      render();
    }catch(e){toast('文件格式错误，请选择导出的备份');}
  };
  reader.readAsText(file);
}

function importBackupText(){
  const ta=$('#backupText');
  if(!ta||!ta.value.trim()){toast('请先把旧备份文本粘贴到框里');return;}
  try{
    const data=JSON.parse(ta.value.trim());
    if(typeof data!=='object'||!data)throw 0;
    let n=0;
    for(const k in data){ if(k.startsWith(PREFIX)){localStorage.setItem(k,data[k]);n++;} }
    if(n===0){toast('未找到工作台数据');return;}
    toast('已恢复 '+n+' 条记录 💕');
    render();
  }catch(e){ toast('文本格式错误，请粘贴完整的备份文本'); }
}

function copyBackup(){
  const ta=$('#backupText');
  if(!ta||!ta.value.trim()){toast('请先点「导出备份」生成文本');return;}
  ta.focus(); ta.select();
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(ta.value).then(()=>toast('已复制，去新链接粘贴吧 💕'),()=>fallbackCopy(ta));
    } else fallbackCopy(ta);
  }catch(e){ fallbackCopy(ta); }
}
function fallbackCopy(ta){
  try{ ta.setSelectionRange(0,ta.value.length); document.execCommand('copy'); toast('已复制 💕'); }
  catch(e){ toast('复制失败，请手动长按文本选择复制'); }
}

/* =========================================================
   路由 / 渲染
   ========================================================= */
function render(){
  const content=$('#content');
  let html='',bind=null;
  switch(currentPage){
    case 'home': html=renderHome();break;
    case 'workload': html=renderWorkload();bind=bindWorkload;break;
    case 'schedule': html=renderSchedule();bind=bindSchedule;break;
    case 'salary': html=renderSalary();bind=bindSalary;break;
    case 'allocation': html=renderAllocation();bind=bindAllocation;break;
    case 'deposit': html=renderDeposit();bind=bindDeposit;break;
    case 'gold': html=renderGold();bind=bindGold;break;
    case 'yihao': html=renderYihao();bind=bindYihao;break;
  }
  content.innerHTML=html;
  // 模式切换（仅处理 data-mode 按钮，避免与易豪台账切换器冲突）
  const ms=$('.mode-switch');
  if(ms){ms.addEventListener('click',e=>{
    const b=e.target.closest('button[data-mode]');if(!b)return;
    setMode(currentPage,b.dataset.mode);
    // 重新渲染当前页以反映模式
    const page=ms.dataset.page;render();
  });}
  // 导出 / 导入 备份
  const eb=$('#exportBtn');if(eb)eb.addEventListener('click',exportBackup);
  const ib=$('#importBtn');if(ib)ib.addEventListener('click',()=>{const fi=$('#importFile');if(fi)fi.click();});
  const fi=$('#importFile');if(fi)fi.addEventListener('change',e=>{if(e.target.files&&e.target.files[0])importBackup(e.target.files[0]);e.target.value='';});
  const hfi=$('#homeImportFile');if(hfi)hfi.addEventListener('change',e=>{if(e.target.files&&e.target.files[0])importBackup(e.target.files[0]);e.target.value='';});
  const itb=$('#importTextBtn');if(itb)itb.addEventListener('click',importBackupText);
  const cb=$('#copyBackupBtn');if(cb)cb.addEventListener('click',copyBackup);
  // 强制刷新（SW 已接管时，reload 会走 cache:'reload' 拉最新 app.js）
  const fub=$('#forceUpdateBtn');if(fub)fub.addEventListener('click',function(){ location.reload(true); });
  const trb=$('#topRefreshBtn');if(trb)trb.addEventListener('click',function(){ location.reload(true); });
  const vt=$('#verTip');if(vt)vt.textContent='当前代码 '+APP_VER;
  if(bind)bind();
  // 更新导航高亮
  $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.page===currentPage));
  content.scrollTop=0;
}

/* =========================================================
   初始化
   ========================================================= */
function init(){
  const sidebar=`
  <div class="sidebar">
    <div class="brand" id="brandHome" title="返回首页概览">💕<br>工作台</div>
    <div class="nav-list">
    ${NAV.map(n=>`<button class="nav-item" data-page="${n.id}"><span class="ico">${n.icon}</span><span class="label">${n.name}</span></button>`).join('')}
    </div>
  </div>`;
  document.querySelector('.app').innerHTML=sidebar+'<div class="content" id="content"></div>';
  $('#brandHome').addEventListener('click',()=>{currentPage='home';if(location.hash!=='#home')location.hash='home';render();});
  $$('.nav-item').forEach(n=>n.addEventListener('click',()=>{
    currentPage=n.dataset.page;
    if(location.hash!=='#'+n.dataset.page)location.hash=n.dataset.page;
    render();
  }));
  // 路由
  const h=location.hash.replace('#','');
  if(h==='home')currentPage='home';
  else if(NAV.some(n=>n.id===h))currentPage=h;
  render();
  window.addEventListener('hashchange',()=>{
    const hh=location.hash.replace('#','');
    if(hh==='home'){currentPage='home';render();}
    else if(NAV.some(n=>n.id===hh)&&hh!==currentPage){currentPage=hh;render();}
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
