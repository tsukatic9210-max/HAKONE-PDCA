import React, { useState, useEffect, useMemo } from "react";

/* =========================================================================
   8年度 箱根アクションプラン PDCA マネージャーアプリ（Netlify版）
   - 保存: localStorage（この端末のブラウザに保存）
   - AIアドバイス: Netlify Function (/.netlify/functions/advice) 経由
   予算データ出典：
     8年度箱根支店収支予算表 / 8年度客単価客数予算表 / 8年度物販売上仕入予算表
   ========================================================================= */

const MONTHS = ["4月","5月","6月","7月","8月","9月","10月","11月","12月","1月","2月","3月"];

// --- 予算データ（エクセル表より） ---------------------------------------
const SALES_BUDGET = [28055681,29324405,26768913,31273568,47436449,30154838,30269537,32220702,30192293,25302236,27412273,39400981];
const EXPENSE_BUDGET = [...SALES_BUDGET];
const UNITPRICE_BUDGET = Array(12).fill(5550);
const CUSTOMERS_BUDGET = [4327,4534,4158,4871,7615,4380,4314,4463,4584,3429,3780,6290];
const INBOUND_BUDGET = [865,907,832,974,1523,876,863,893,917,686,756,1258];
const REVIEW_TARGET = 200;
const GOODS_SALES_BUDGET = [3675000,4233600,3341800,3787700,5345900,3895500,4233600,5566400,4233600,3116400,3116400,4454100];
const GOODS_BUY_BUDGET    = [477750,550368,434434,492401,694967,506415,550368,723632,550368,405132,405132,579033];

function scoreHigher(actual, budget){
  if(budget<=0||actual===""||actual==null) return null;
  const r = Number(actual)/budget;
  return Math.max(0, Math.min(120, Math.round(r*100)));
}
function scoreLower(actual, budget){
  if(budget<=0||actual===""||actual==null) return null;
  const r = Number(actual)/budget;
  return Math.max(0, Math.min(120, Math.round((2-r)*100)));
}
function grade(s){
  if(s==null) return {label:"未入力", cls:"none"};
  if(s>=110) return {label:"卓越", cls:"sss"};
  if(s>=100) return {label:"達成", cls:"good"};
  if(s>=90)  return {label:"概ね達成", cls:"ok"};
  if(s>=75)  return {label:"要改善", cls:"warn"};
  return {label:"未達", cls:"bad"};
}
const yen = n => n==null||n===""?"—":"¥"+Number(n).toLocaleString();
const num = n => n==null||n===""?"—":Number(n).toLocaleString();

function buildItems(m){
  return [
    {key:"sales", no:"①", name:"売上", dir:"higher", budget:SALES_BUDGET[m], fmt:yen, src:"箱根支店収支予算表"},
    {key:"expense", no:"②", name:"支出", dir:"lower", budget:EXPENSE_BUDGET[m], fmt:yen, src:"箱根支店収支予算表",
     note:"※収支予算表に独立した支出予算行が無いため初期値は売上予算と同額。実態に合わせて調整可。"},
    {key:"profit", no:"③", name:"利益（売上−支出）", dir:"higher", budget:SALES_BUDGET[m]-EXPENSE_BUDGET[m], fmt:yen, derived:true, src:"①−②より算出"},
    {key:"unitprice", no:"④a", name:"客単価", dir:"higher", budget:UNITPRICE_BUDGET[m], fmt:yen, src:"客単価客数予算表"},
    {key:"customers", no:"④b", name:"客数", dir:"higher", budget:CUSTOMERS_BUDGET[m], fmt:num, src:"客単価客数予算表"},
    {key:"inbound", no:"⑤", name:"インバウンド客数", dir:"higher", budget:INBOUND_BUDGET[m], fmt:num, src:"客単価客数予算表"},
    {key:"reviews", no:"⑥", name:"Googleクチコミ数", dir:"higher", budget:REVIEW_TARGET, fmt:num, src:"目標 月間200件"},
    {key:"goodsSales", no:"⑦", name:"物販 売上", dir:"higher", budget:GOODS_SALES_BUDGET[m], fmt:yen, src:"物販売上仕入予算表"},
    {key:"goodsBuy", no:"⑧", name:"物販 仕入", dir:"lower", budget:GOODS_BUY_BUDGET[m], fmt:yen, src:"物販売上仕入予算表"},
  ];
}

const PDCA_FIELDS = [
  {k:"plan", label:"Plan（計画）", ph:"目標達成のための今月の打ち手・施策を記入"},
  {k:"do",   label:"Do（実行）",   ph:"実際に行った行動・取り組みを記入"},
  {k:"check",label:"Check（評価）", ph:"結果の振り返り・うまくいった点/課題を記入"},
  {k:"act",  label:"Act（改善）",   ph:"次月への改善アクションを記入"},
];
const blankPDCA = () => ({plan:"",do:"",check:"",act:""});
const STORE_KEY = "hakone_pdca_store";   // 新形式（年度対応）
const OLD_KEY   = "hakone_pdca_8";        // 旧形式（8年度のみ・自動移行）
const YEARS = [8,9,10,11,12];             // 管理できる年度（後で増やせる）

export default function App(){
  const [year, setYear] = useState(8);
  const [month, setMonth] = useState(0);
  const [store, setStore] = useState({years:{}, summaries:{}});
  const [loaded, setLoaded] = useState(false);
  const [advice, setAdvice] = useState({});
  const [loadingKey, setLoadingKey] = useState(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [carried, setCarried] = useState(false);
  const [carriedFrom, setCarriedFrom] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(()=>{
    let st = {years:{}, summaries:{}};
    try{
      const raw = localStorage.getItem(STORE_KEY);
      if(raw){ st = JSON.parse(raw); }
      else {
        // 旧データ（年度なし）があれば8年度として移行
        const old = localStorage.getItem(OLD_KEY);
        if(old){ st = {years:{8:JSON.parse(old)}, summaries:{}}; }
      }
    }catch(e){}
    if(!st.years) st.years={};
    if(!st.summaries) st.summaries={};
    setStore(st);
    setLoaded(true);
  },[]);

  const persistStore = (next)=>{
    setStore(next);
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(next));
      setSaveMsg("保存しました"); setTimeout(()=>setSaveMsg(""),1500);
    }catch(e){ setSaveMsg("保存に失敗"); }
  };

  // 現在の年度の月データ（data）を従来どおり扱えるようにする
  const data = (store.years&&store.years[year]) || {};
  const persist = (nextData)=>{
    persistStore({...store, years:{...store.years, [year]:nextData}});
  };

  // 前月のPDCA/課題を当月へ引き継ぐ（当月が未入力のときだけ） ------------
  const hasPDCAContent = (md)=>{
    if(!md) return false;
    const anyPdca = Object.values(md.pdca||{}).some(p=>p&&(p.plan||p.do||p.check||p.act));
    const anyTask = (md.tasks||[]).length>0;
    return anyPdca || anyTask;
  };
  useEffect(()=>{
    if(!loaded) return;
    const cur = data[month];
    if(hasPDCAContent(cur)) return; // 当月に既に中身があれば触らない

    // 4月（月0）は前年度3月から、それ以外は同年度の前月から引き継ぐ
    let prev, fromLabel;
    if(month===0){
      const prevYearData = (store.years&&store.years[year-1]) || {};
      prev = prevYearData[11]; // 前年度3月
      fromLabel = (year-1)+"年度3月";
    } else {
      prev = data[month-1];
      fromLabel = MONTHS[month-1];
    }
    if(!hasPDCAContent(prev)) return;

    const carriedPdca = {};
    Object.entries(prev.pdca||{}).forEach(([k,p])=>{
      if(p&&(p.plan||p.do||p.check||p.act)) carriedPdca[k]={...p};
    });
    const carriedTasks = (prev.tasks||[]).map((t,i)=>({
      id:"t"+Date.now()+"_"+i, title:t.title, progress:0,
      pdca:{...(t.pdca||blankPDCA())}
    }));
    persist({...data,[month]:{actuals:(cur&&cur.actuals)||{}, pdca:carriedPdca, tasks:carriedTasks}});
    setCarriedFrom(fromLabel);
    setCarried(true);
    setTimeout(()=>setCarried(false),4500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[month,year,loaded]);

  const mData = data[month] || {actuals:{}, pdca:{}, tasks:[]};
  const tasks = mData.tasks || [];
  const items = useMemo(()=>buildItems(month),[month]);

  // フリー課題 CRUD ------------------------------------------------------
  const setTasks = (nextTasks)=>{
    persist({...data,[month]:{...mData,tasks:nextTasks}});
  };
  const addTask = ()=>{
    const t={id:"t"+Date.now(), title:"", progress:0, pdca:blankPDCA()};
    setTasks([...tasks, t]);
  };
  const updateTask = (id, patch)=>{
    setTasks(tasks.map(t=>t.id===id?{...t,...patch}:t));
  };
  const updateTaskPDCA = (id, field, val)=>{
    setTasks(tasks.map(t=>t.id===id?{...t,pdca:{...(t.pdca||blankPDCA()),[field]:val}}:t));
  };
  const removeTask = (id)=>{
    setTasks(tasks.filter(t=>t.id!==id));
  };

  const actualOf = (key)=>{
    if(key==="profit"){
      const s=mData.actuals.sales, e=mData.actuals.expense;
      if(s===""||s==null||e===""||e==null) return "";
      return Number(s)-Number(e);
    }
    return mData.actuals[key] ?? "";
  };
  const scoreOf = (it)=>{
    const a = actualOf(it.key);
    return it.dir==="lower"? scoreLower(a,it.budget): scoreHigher(a,it.budget);
  };
  const setActual = (key,val)=>{
    const next={...data,[month]:{...mData,actuals:{...mData.actuals,[key]:val===""?"":Number(val)}}};
    persist(next);
  };
  const setPDCA = (key,field,val)=>{
    const cur = mData.pdca[key]||blankPDCA();
    const next={...data,[month]:{...mData,pdca:{...mData.pdca,[key]:{...cur,[field]:val}}}};
    persist(next);
  };

  const overall = useMemo(()=>{
    const ss = items.map(scoreOf).filter(s=>s!=null);
    if(!ss.length) return null;
    return Math.round(ss.reduce((a,b)=>a+b,0)/ss.length);
  },[items,mData]);

  // AIアドバイス共通呼び出し
  const callAdvice = async (adviceKey, prompt)=>{
    setLoadingKey(adviceKey);
    try{
      const res = await fetch("/.netlify/functions/advice",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt})
      });
      const d = await res.json();
      setAdvice(prev=>({...prev,[adviceKey]: d.text || d.error || "アドバイスを取得できませんでした。"}));
    }catch(e){
      setAdvice(prev=>({...prev,[adviceKey]:"通信エラーが発生しました。時間をおいて再度お試しください。"}));
    }
    setLoadingKey(null);
  };

  const getAdvice = async (it)=>{
    const a = actualOf(it.key);
    const s = scoreOf(it);
    const p = mData.pdca[it.key]||blankPDCA();
    const prompt =
`あなたは箱根の体験型店舗（吹きガラス・陶芸・とんぼ玉・物販等）の経営アドバイザーです。
店舗マネージャーが${MONTHS[month]}の「${it.name}」項目をPDCA管理しています。

【数値】
予算/目標: ${it.fmt(it.budget)}
当月実績: ${a===""?"未入力":it.fmt(a)}
評価点: ${s==null?"未算出":s+"点"}（${it.dir==="lower"?"少ないほど良い":"多いほど良い"}項目）

【マネージャー記入のPDCA】
Plan: ${p.plan||"（未記入）"}
Do: ${p.do||"（未記入）"}
Check: ${p.check||"（未記入）"}
Act: ${p.act||"（未記入）"}

この項目の目標達成に向け、現場で実行できる具体的アドバイスを日本語で簡潔に提示してください。
構成: ①現状評価(1-2文) ②今月の重点打ち手3つ(箇条書き) ③来月への改善1つ。
専門用語は避け、現場目線で。全体250字程度。`;
    await callAdvice(it.key, prompt);
  };

  const getTaskAdvice = async (t)=>{
    const p = t.pdca||blankPDCA();
    const prompt =
`あなたは箱根の体験型店舗（吹きガラス・陶芸・とんぼ玉・物販等）の経営・組織アドバイザーです。
店舗マネージャーが${MONTHS[month]}に、施設運営上のフリー課題をPDCA管理しています。

【課題】${t.title||"（タイトル未記入）"}
【自己評価の達成度】${t.progress}%

【マネージャー記入のPDCA】
Plan: ${p.plan||"（未記入）"}
Do: ${p.do||"（未記入）"}
Check: ${p.check||"（未記入）"}
Act: ${p.act||"（未記入）"}

この課題の達成に向け、現場で実行できる具体的アドバイスを日本語で簡潔に提示してください。
（売上などの数値目標ではなく、職場環境・採用・人材育成・安全衛生・コンプライアンス等の運営課題として扱う）
構成: ①現状評価(1-2文) ②今月の重点打ち手3つ(箇条書き) ③来月への改善1つ。
専門用語は避け、現場目線で。全体250字程度。`;
    await callAdvice("task_"+t.id, prompt);
  };

  // 年度総括レポート（AI） ------------------------------------------------
  const buildYearReportPrompt = ()=>{
    const lines = [];
    for(let m=0;m<12;m++){
      const md = data[m];
      if(!md) { lines.push(`${MONTHS[m]}：実績入力なし`); continue; }
      const its = buildItems(m);
      const parts = its.map(it=>{
        let a;
        if(it.key==="profit"){
          const s=md.actuals?.sales, e=md.actuals?.expense;
          a=(s==null||s===""||e==null||e==="")?"":Number(s)-Number(e);
        } else a = md.actuals?.[it.key] ?? "";
        const sc = it.dir==="lower"? scoreLower(a,it.budget): scoreHigher(a,it.budget);
        return `${it.name}=${a===""?"未":it.fmt(a)}(予算${it.fmt(it.budget)}/評価${sc==null?"-":sc}点)`;
      });
      const pdcaTxt = Object.entries(md.pdca||{}).map(([k,p])=>{
        const it = its.find(x=>x.key===k); if(!p) return null;
        const t=[p.plan&&"P:"+p.plan,p.do&&"D:"+p.do,p.check&&"C:"+p.check,p.act&&"A:"+p.act].filter(Boolean).join(" / ");
        return t?`  ・${it?it.name:k}→${t}`:null;
      }).filter(Boolean);
      const taskTxt = (md.tasks||[]).map(t=>`  ・課題「${t.title||"無題"}」達成度${t.progress||0}%`);
      lines.push(`【${MONTHS[m]}】 ${parts.join(" / ")}` +
        (pdcaTxt.length?`\n${pdcaTxt.join("\n")}`:"") +
        (taskTxt.length?`\n${taskTxt.join("\n")}`:""));
    }
    return `あなたは箱根の体験型店舗（吹きガラス・陶芸・とんぼ玉・物販等）の経営アドバイザーです。
以下は${year}年度（4月〜翌3月）の月次PDCA管理データです。これを基に、年度の総括レポートを作成してください。

${lines.join("\n")}

次の構成で、日本語で、店舗マネージャーと経営層が読む報告書として作成してください（全体900〜1200字）。
1. 年度総評（数値目標①〜⑧の達成状況を総括。好調だった項目・苦戦した項目を具体的に）
2. PDCAの振り返り（実施した施策のうち効果が出たもの／不発だったもの。フリー課題の進捗も含む）
3. 来年度への提言（重点的に取り組むべきこと3〜5点。具体的なアクションで）
4. 来年度4月にすぐ着手すべきこと（1〜2点）
見出しは【】で示し、箇条書きを適度に使って読みやすく。`;
  };

  const generateYearReport = async ()=>{
    setSummaryLoading(true);
    const prompt = buildYearReportPrompt();
    try{
      const res = await fetch("/.netlify/functions/advice",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt})
      });
      const d = await res.json();
      const text = d.text || d.error || "総括レポートを生成できませんでした。";
      persistStore({...store, years:{...store.years,[year]:data},
        summaries:{...store.summaries,[year]:{text, createdAt:new Date().toLocaleString("ja-JP")}}});
    }catch(e){
      persistStore({...store, summaries:{...store.summaries,
        [year]:{text:"通信エラーが発生しました。時間をおいて再度お試しください。", createdAt:new Date().toLocaleString("ja-JP")}}});
    }
    setSummaryLoading(false);
  };

  const yearSummary = store.summaries?.[year];
  const prevYearSummary = store.summaries?.[year-1];

  if(!loaded) return <div style={{padding:40,fontFamily:"sans-serif"}}>読み込み中…</div>;

  return (
    <div className="wrap">
      <style>{CSS}</style>
      <header className="hd">
        <div className="hd-mark">PDCA</div>
        <div>
          <h1>{year}年度 箱根アクションプラン管理</h1>
          <p className="sub">箱根クラフトハウス／マネージャー用 数値目標 × PDCA ・ 4月〜3月 月次管理</p>
        </div>
        {saveMsg && <span className="savechip">{saveMsg}</span>}
      </header>

      <nav className="years">
        <span className="years-lbl">年度</span>
        {YEARS.map(y=>(
          <button key={y} className={"ybtn"+(y===year?" on":"")}
            onClick={()=>{setYear(y); setMonth(0);}}>{y}年度</button>
        ))}
      </nav>

      {prevYearSummary && (
        <details className="prevsum">
          <summary>前年度（{year-1}年度）の総括を見る <span className="chev">▾</span></summary>
          <div className="prevsum-body">{prevYearSummary.text}</div>
        </details>
      )}

      <nav className="months">
        {MONTHS.map((m,i)=>{
          const d=data[i]; const filled = d && Object.values(d.actuals||{}).some(v=>v!==""&&v!=null);
          return <button key={i} className={"mbtn"+(i===month?" on":"")+(filled?" has":"")}
            onClick={()=>setMonth(i)}>{m}{filled&&<i className="dot"/>}</button>;
        })}
      </nav>

      {carried && (
        <div className="carry-banner">
          {carriedFrom}のPDCA・課題を引き継ぎました。内容を確認・更新してください。
        </div>
      )}

      <section className="summary">
        <div className="sum-score">
          <span className="sum-lbl">{MONTHS[month]} 総合評価</span>
          <span className={"sum-num "+(overall==null?"":grade(overall).cls)}>{overall==null?"—":overall}</span>
          <span className="sum-unit">{overall==null?"実績未入力":grade(overall).label}</span>
        </div>
        <div className="sum-bars">
          {items.map(it=>{const s=scoreOf(it);return(
            <div key={it.key} className="minibar" title={it.name}>
              <span className="mb-fill" style={{height:s==null?"4%":Math.min(100,s)+"%",
                background:`var(--${grade(s).cls})`}}/>
              <span className="mb-lbl">{it.no}</span>
            </div>);})}
        </div>
      </section>

      <main className="grid">
        {items.map(it=>{
          const a=actualOf(it.key); const s=scoreOf(it); const g=grade(s);
          const p=mData.pdca[it.key]||blankPDCA();
          return (
          <article key={it.key} className="card">
            <div className="card-top">
              <div className="ct-name"><b className="no">{it.no}</b>{it.name}</div>
              <span className={"badge "+g.cls}>{s==null?"—":s+"点"}<small>{g.label}</small></span>
            </div>
            <div className="kpis">
              <div className="kpi"><span>予算/目標</span><b>{it.fmt(it.budget)}</b></div>
              <div className="kpi">
                <span>当月実績{it.derived&&"（自動）"}</span>
                {it.derived
                  ? <b className={a!==""&&a<0?"neg":""}>{a===""?"—":it.fmt(a)}</b>
                  : <input className="num-in" type="number" inputMode="numeric"
                      value={mData.actuals[it.key]??""} placeholder="入力"
                      onChange={e=>setActual(it.key,e.target.value)} />}
              </div>
              <div className="kpi"><span>達成率</span>
                <b>{s==null?"—":(it.budget>0?Math.round(Number(a)/it.budget*100):0)+"%"}</b></div>
            </div>
            <div className="srcline">出典：{it.src}{it.note&&<em>{it.note}</em>}</div>
            <details className="pdca">
              <summary>PDCA を記入 <span className="chev">▾</span></summary>
              <div className="pdca-body">
                {PDCA_FIELDS.map(f=>(
                  <label key={f.k} className="pf">
                    <span className={"pf-lbl "+f.k}>{f.label}</span>
                    <textarea value={p[f.k]} placeholder={f.ph} rows={2}
                      onChange={e=>setPDCA(it.key,f.k,e.target.value)}/>
                  </label>
                ))}
                <button className="ai-btn" disabled={loadingKey===it.key}
                  onClick={()=>getAdvice(it)}>
                  {loadingKey===it.key?"AI が考えています…":"AI に改善アドバイスを聞く"}
                </button>
                {advice[it.key] && <div className="ai-out">{advice[it.key]}</div>}
              </div>
            </details>
          </article>);
        })}
      </main>

      {/* フリー課題（施設内の取組み） */}
      <section className="freehd">
        <div>
          <h2>施設内の取組み（フリー課題）</h2>
          <p className="sub">数値目標①〜⑧とは別に、ハラスメント防止・採用強化・安全衛生・接客改善などを自由に追加してPDCA管理できます。</p>
        </div>
        <button className="add-btn" onClick={addTask}>＋ 課題を追加</button>
      </section>

      {tasks.length===0 ? (
        <div className="empty">
          まだ課題がありません。「＋ 課題を追加」から、今月取り組む施設内テーマを登録しましょう。
          <span className="eg">例：ハラスメント防止対策／求人募集率を上げる取組／店内清掃ルール徹底／クチコミ返信体制づくり</span>
        </div>
      ) : (
        <div className="grid">
          {tasks.map((t,idx)=>{
            const p=t.pdca||blankPDCA(); const akey="task_"+t.id;
            const pg=Number(t.progress)||0;
            const pgCls = pg>=100?"sss":pg>=75?"good":pg>=50?"ok":pg>=25?"warn":"bad";
            return (
            <article key={t.id} className="card task">
              <div className="card-top">
                <div className="ct-name task-name">
                  <b className="no">課題{idx+1}</b>
                  <input className="title-in" value={t.title} placeholder="課題のタイトルを入力"
                    onChange={e=>updateTask(t.id,{title:e.target.value})}/>
                </div>
                <button className="del-btn" title="この課題を削除"
                  onClick={()=>{ if(confirm("この課題を削除しますか？")) removeTask(t.id); }}>×</button>
              </div>

              <div className="prog-row">
                <div className="prog-top">
                  <span>達成度（自己評価）</span>
                  <b className={pgCls+"-txt"}>{pg}%</b>
                </div>
                <input className={"slider "+pgCls} type="range" min="0" max="100" step="5"
                  value={pg} onChange={e=>updateTask(t.id,{progress:Number(e.target.value)})}/>
              </div>

              <details className="pdca" open>
                <summary>PDCA を記入 <span className="chev">▾</span></summary>
                <div className="pdca-body">
                  {PDCA_FIELDS.map(f=>(
                    <label key={f.k} className="pf">
                      <span className={"pf-lbl "+f.k}>{f.label}</span>
                      <textarea value={p[f.k]} placeholder={f.ph} rows={2}
                        onChange={e=>updateTaskPDCA(t.id,f.k,e.target.value)}/>
                    </label>
                  ))}
                  <button className="ai-btn" disabled={loadingKey===akey}
                    onClick={()=>getTaskAdvice(t)}>
                    {loadingKey===akey?"AI が考えています…":"AI に改善アドバイスを聞く"}
                  </button>
                  {advice[akey] && <div className="ai-out">{advice[akey]}</div>}
                </div>
              </details>
            </article>);
          })}
        </div>
      )}

      {/* 年度総括レポート */}
      <section className="yearend">
        <div className="ye-head">
          <div>
            <h2>{year}年度 総括レポート（AI）</h2>
            <p className="sub">1年分（4月〜3月）の数値達成状況とPDCAをAIがまとめ、評価・振り返り・次年度への提言を作成します。</p>
          </div>
          <button className="ye-btn" disabled={summaryLoading} onClick={generateYearReport}>
            {summaryLoading?"AI が年度を分析中…":(yearSummary?"レポートを再生成":"年度総括を作成")}
          </button>
        </div>
        {yearSummary && (
          <div className="ye-out">
            <div className="ye-meta">作成日時：{yearSummary.createdAt}</div>
            <div className="ye-text">{yearSummary.text}</div>
            <div className="ye-note">この総括は{year}年度に保存され、{year+1}年度を開くと「前年度の総括」として表示されます。</div>
          </div>
        )}
      </section>

      <footer className="ft">
        入力内容はこのブラウザに自動保存されます。年度・月をまたいで記録を継続できます。
      </footer>
    </div>
  );
}

const CSS = `
*{box-sizing:border-box}
body{margin:0}
.wrap{--ink:#1d2b2a;--paper:#f3efe6;--card:#fffdf8;--line:#e0d8c8;
  --kiln:#c2603a;--kiln2:#e0824f;--sea:#2f6b6b;--glass:#7fa9a3;
  --sss:#1f7a5a;--good:#2f6b6b;--ok:#7a9a3a;--warn:#d3a020;--bad:#c2603a;--none:#c9c2b4;
  font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;
  color:var(--ink);background:
   radial-gradient(circle at 12% -5%,rgba(194,96,58,.10),transparent 40%),
   radial-gradient(circle at 95% 0%,rgba(47,107,107,.10),transparent 38%),var(--paper);
  min-height:100vh;padding:22px;max-width:1180px;margin:0 auto}
h1{font-size:22px;margin:0;letter-spacing:.02em}
.sub{margin:3px 0 0;font-size:12.5px;color:#6c6555}
.hd{display:flex;align-items:center;gap:16px;margin-bottom:18px;position:relative}
.hd-mark{width:54px;height:54px;border-radius:14px;flex:none;display:grid;place-items:center;
  background:linear-gradient(135deg,var(--kiln),var(--kiln2));color:#fff;font-weight:800;
  letter-spacing:.06em;font-size:14px;box-shadow:0 6px 18px rgba(194,96,58,.32)}
.carry-banner{background:#eef4f2;border:1px solid #cfe0db;border-left:4px solid var(--sea);
  border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#23403c;font-weight:600}
.years{display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.years-lbl{font-size:11px;color:#7a7363;font-weight:700;margin-right:2px}
.ybtn{border:1px solid var(--line);background:var(--card);color:#6c6555;padding:6px 14px;
  border-radius:20px;font-size:12.5px;font-weight:700;cursor:pointer;transition:.15s}
.ybtn:hover{border-color:var(--kiln)}
.ybtn.on{background:var(--kiln);color:#fff;border-color:var(--kiln)}
.prevsum{background:#fff8f3;border:1px solid #f0dcce;border-radius:12px;
  padding:12px 16px;margin-bottom:14px}
.prevsum summary{cursor:pointer;font-size:13px;font-weight:700;color:var(--kiln);list-style:none;
  display:flex;justify-content:space-between;align-items:center}
.prevsum summary::-webkit-details-marker{display:none}
.prevsum[open] .chev{transform:rotate(180deg)}
.prevsum-body{margin-top:10px;font-size:12.5px;line-height:1.8;white-space:pre-wrap;color:#4a3f33}
.yearend{margin-top:30px;padding-top:20px;border-top:2px solid var(--line)}
.ye-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.yearend h2{font-size:18px;margin:0;letter-spacing:.02em}
.ye-btn{flex:none;background:linear-gradient(135deg,var(--kiln),var(--kiln2));color:#fff;border:none;
  border-radius:10px;padding:11px 18px;font-size:13.5px;font-weight:700;cursor:pointer;
  box-shadow:0 4px 14px rgba(194,96,58,.3)}
.ye-btn:disabled{opacity:.6;cursor:wait}
.ye-out{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.ye-meta{font-size:11px;color:#9a9180;margin-bottom:10px}
.ye-text{font-size:13px;line-height:1.9;white-space:pre-wrap;color:var(--ink)}
.ye-note{margin-top:14px;padding-top:10px;border-top:1px dashed var(--line);font-size:11.5px;color:#7a7363}
.savechip{position:absolute;right:0;top:0;background:var(--sea);color:#fff;font-size:11px;
  padding:4px 10px;border-radius:20px}
.months{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.mbtn{position:relative;border:1px solid var(--line);background:var(--card);color:#6c6555;
  padding:7px 13px;border-radius:9px;font-size:13px;cursor:pointer;font-weight:600;transition:.15s}
.mbtn:hover{border-color:var(--kiln)}
.mbtn.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.mbtn .dot{position:absolute;top:5px;right:5px;width:5px;height:5px;border-radius:50%;background:var(--kiln)}
.mbtn.on .dot{background:#ffd9c5}
.summary{display:flex;gap:20px;align-items:center;background:var(--card);border:1px solid var(--line);
  border-radius:16px;padding:16px 20px;margin-bottom:18px;flex-wrap:wrap}
.sum-score{display:flex;flex-direction:column;align-items:center;min-width:140px}
.sum-lbl{font-size:12px;color:#6c6555}
.sum-num{font-size:54px;font-weight:800;line-height:1;font-feature-settings:"tnum"}
.sum-num.sss{color:var(--sss)}.sum-num.good{color:var(--good)}.sum-num.ok{color:var(--ok)}
.sum-num.warn{color:var(--warn)}.sum-num.bad{color:var(--bad)}
.sum-unit{font-size:12px;color:#6c6555;margin-top:2px}
.sum-bars{display:flex;gap:9px;align-items:flex-end;flex:1;min-width:260px;height:78px;padding-top:4px}
.minibar{flex:1;height:100%;background:#ece5d6;border-radius:5px;position:relative;display:flex;
  align-items:flex-end;overflow:hidden;min-width:20px}
.mb-fill{width:100%;border-radius:5px 5px 0 0;transition:height .4s}
.mb-lbl{position:absolute;bottom:2px;left:0;right:0;text-align:center;font-size:9px;color:#7a7363;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;
  box-shadow:0 2px 10px rgba(40,30,15,.04)}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.ct-name{font-weight:700;font-size:15px}
.no{display:inline-block;color:var(--kiln);margin-right:6px;font-size:13px}
.badge{flex:none;display:flex;flex-direction:column;align-items:center;border-radius:10px;
  padding:5px 11px;font-weight:800;font-size:16px;color:#fff;line-height:1.1}
.badge small{font-size:9.5px;font-weight:600;opacity:.92}
.badge.sss{background:var(--sss)}.badge.good{background:var(--good)}.badge.ok{background:var(--ok)}
.badge.warn{background:var(--warn)}.badge.bad{background:var(--bad)}.badge.none{background:var(--none)}
.kpis{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:14px 0 6px}
.kpi{background:#faf6ec;border:1px solid var(--line);border-radius:10px;padding:8px 9px}
.kpi span{display:block;font-size:10.5px;color:#7a7363;margin-bottom:3px}
.kpi b{font-size:14px;font-feature-settings:"tnum"}
.kpi b.neg{color:var(--bad)}
.num-in{width:100%;border:1px solid var(--kiln);border-radius:7px;padding:5px 7px;font-size:14px;
  font-weight:700;background:#fff;color:var(--ink)}
.num-in:focus{outline:2px solid var(--kiln2);outline-offset:1px}
.srcline{font-size:10.5px;color:#9a9180;margin-top:2px}
.srcline em{display:block;color:var(--kiln);font-style:normal;margin-top:2px}
.pdca{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px}
.pdca summary{cursor:pointer;font-size:13px;font-weight:700;color:var(--sea);list-style:none;
  display:flex;justify-content:space-between;align-items:center}
.pdca summary::-webkit-details-marker{display:none}
.chev{transition:.2s}
.pdca[open] .chev{transform:rotate(180deg)}
.pdca-body{margin-top:10px;display:flex;flex-direction:column;gap:9px}
.pf{display:block}
.pf-lbl{display:inline-block;font-size:11px;font-weight:700;color:#fff;padding:2px 8px;border-radius:6px;margin-bottom:4px}
.pf-lbl.plan{background:var(--sea)}.pf-lbl.do{background:var(--glass)}
.pf-lbl.check{background:var(--kiln)}.pf-lbl.act{background:var(--ok)}
.pf textarea{width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px;font-size:12.5px;
  font-family:inherit;resize:vertical;background:#fff;color:var(--ink)}
.pf textarea:focus{outline:2px solid var(--sea);outline-offset:1px}
.ai-btn{margin-top:4px;background:linear-gradient(135deg,var(--sea),var(--glass));color:#fff;border:none;
  border-radius:9px;padding:9px;font-size:13px;font-weight:700;cursor:pointer}
.ai-btn:disabled{opacity:.6;cursor:wait}
.ai-out{background:#eef4f2;border:1px solid #cfe0db;border-left:4px solid var(--sea);border-radius:8px;
  padding:10px 12px;font-size:12.5px;line-height:1.7;white-space:pre-wrap;color:#23403c}
.ft{margin-top:22px;text-align:center;font-size:11.5px;color:#9a9180}
.freehd{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;
  margin:30px 0 14px;padding-top:18px;border-top:2px solid var(--line);flex-wrap:wrap}
.freehd h2{font-size:18px;margin:0;letter-spacing:.02em}
.add-btn{flex:none;background:var(--ink);color:#fff;border:none;border-radius:10px;
  padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;transition:.15s}
.add-btn:hover{background:var(--kiln)}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:22px;
  text-align:center;font-size:13px;color:#7a7363;display:flex;flex-direction:column;gap:8px}
.empty .eg{font-size:11.5px;color:#9a9180}
.card.task{border-top:3px solid var(--sea)}
.task-name{display:flex;align-items:center;gap:8px;flex:1}
.title-in{flex:1;border:none;border-bottom:1.5px solid var(--line);background:transparent;
  font-size:15px;font-weight:700;font-family:inherit;color:var(--ink);padding:3px 2px}
.title-in:focus{outline:none;border-bottom-color:var(--sea)}
.del-btn{flex:none;width:28px;height:28px;border-radius:8px;border:1px solid var(--line);
  background:#faf6ec;color:#9a9180;font-size:18px;line-height:1;cursor:pointer}
.del-btn:hover{background:#f7e3da;color:var(--bad);border-color:var(--bad)}
.prog-row{margin:14px 0 4px}
.prog-top{display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px;color:#7a7363;margin-bottom:6px}
.prog-top b{font-size:18px;font-feature-settings:"tnum"}
.sss-txt{color:var(--sss)}.good-txt{color:var(--good)}.ok-txt{color:var(--ok)}
.warn-txt{color:var(--warn)}.bad-txt{color:var(--bad)}
.slider{width:100%;-webkit-appearance:none;appearance:none;height:7px;border-radius:5px;
  background:#ece5d6;outline:none}
.slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;
  background:var(--sea);cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.slider::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--sea);
  cursor:pointer;border:2px solid #fff}
.slider.sss::-webkit-slider-thumb{background:var(--sss)}
.slider.good::-webkit-slider-thumb{background:var(--good)}
.slider.ok::-webkit-slider-thumb{background:var(--ok)}
.slider.warn::-webkit-slider-thumb{background:var(--warn)}
.slider.bad::-webkit-slider-thumb{background:var(--bad)}
@media(max-width:560px){.kpis{grid-template-columns:1fr 1fr}.sum-num{font-size:42px}}
`;
