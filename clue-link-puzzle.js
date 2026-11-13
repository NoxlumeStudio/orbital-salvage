/* Reusable optional clue-linking puzzle; all story facts remain in chapter config. */
(() => {
  'use strict';
  const isMatch = (attempt,solution) => !!attempt?.mirror && Array.isArray(attempt.order)
    && attempt.order.length === solution.length
    && new Set(attempt.order).size === solution.length
    && attempt.order.every((value,index)=>value===solution[index]);
  function create(config) {
    const symbols = [
      {id:'star',label:'星（点の痕）'},
      {id:'house',label:'家（直線の痕）'},
      {id:'bear',label:'熊（波の痕）'},
    ];
    const hintTexts = config.hints;
    const sourceIds = config.sources.map(source => source.id);
    const ready = () => sourceIds.every(id => config.hasClue(id));
    const title = config.title;
    let resolving = false;
    let revealTimer = null;
    function update() {
      if (!config.trigger) return;
      const total = sourceIds.filter(id=>config.hasClue(id)).length;
      config.trigger.textContent = config.isSolved() ? '記憶の照合：解析済み' : `記憶の照合：断片 ${total}/${sourceIds.length}`;
      config.trigger.classList.toggle('memory-ready',ready()&&!config.isSolved());
    }
    function records() {
      return config.sources.filter(source=>config.hasClue(source.id)).map(source => `<div class="memory-source unlocked"><strong>${source.title}</strong><p>${source.clue}</p></div>`).join('');
    }
    function selectMarkup(value,index) {
      return `<label class="memory-slot"><span>${index+1} 番目</span><select data-memory-slot="${index}" aria-label="${index+1}番目の記号"><option value="">記号を選ぶ</option>${symbols.map(s=>`<option value="${s.id}"${value===s.id?' selected':''}>${s.label}</option>`).join('')}</select></label>`;
    }
    function finishedRecord() {
      return `<div class="memory-analysis-record"><strong>解析過程 / TRACE CORRELATION</strong><ol><li>子供の落書き：点・直線・波の痕跡を星・家・熊に仮分類。</li><li>割れた写真立て：左から星・家・熊の位置関係を検出。ガラスの左右反転を補正。</li><li>小型音楽プレイヤー：波 → 直線 → 点の時間順を復元。</li></ol><p>照合結果：熊 → 家 → 星 ／ 写真補正：左右反転。3つの解析記録に共通する並びが確認された。</p><small>これは残留情報の照合結果です。描いた人物や記号の本来の意味を確定するものではありません。</small></div>`;
    }
    function open(status='') {
      update();
      const complete = config.isSolved();
      const draft = config.getDraft();
      const markup = `<div class="eyebrow">SCAN / TRACE CORRELATION</div><h3>${title}</h3><p class="memory-intro">微弱な痕跡を照合する。記号はスキャンで復元した仮の表示であり、背景画像に直接描かれていたものではない。</p><div class="memory-clue-tools"><button class="btn" id="memoryClueToggle" type="button" aria-expanded="${!ready()||complete}" aria-controls="memoryClueList">${!ready()||complete?'手掛かりを閉じる':'手掛かりを確認'}</button><span>取得済み ${sourceIds.filter(id=>config.hasClue(id)).length}/3</span></div><div class="memory-records" id="memoryClueList" ${ready()&&!complete?'hidden':''}>${records()}</div>${complete?`<div class="memory-success"><strong>TRACE LINK CONFIRMED / 照合完了</strong><p>${config.reward}</p></div>${finishedRecord()}`:ready()?`<div class="memory-board"><p>写真立ての像は、割れたガラスによって左右が反転している可能性がある。写真の向きを補正し、音の記録と一致する順に3つの記号を選ぼう。</p><button class="btn memory-flip" id="memoryFlip" type="button" aria-pressed="${draft.mirror}">写真の補正：${draft.mirror?'左右反転':'そのまま'}</button><div class="memory-slots">${draft.order.map(selectMarkup).join('')}</div><button class="btn primary" id="memorySubmit" type="button">痕跡を照合する</button></div>`:'<p class="memory-pending">照合には3つの対象の調査記録が必要だ。</p>'}<p class="memory-status" id="memoryStatus" role="status">${status}</p>${!complete?`<div class="memory-hint"><button class="btn" id="memoryHint" type="button">段階ヒントを見る（${Math.min(3,config.getHintLevel()+1)}/3）</button><p id="memoryHintText"></p></div>`:''}<div class="modalactions"><button class="btn primary" data-close>探索へ戻る</button></div>`;
      config.openModal(markup);
      // モーダルは成功時や再表示時にも描き直されるため、その都度「戻る」を結び直す。
      const closeButton=document.querySelector('[data-close]');
      if(closeButton)closeButton.onclick=()=>config.closeModal?.();
      const clues=document.getElementById('memoryClueList'),toggle=document.getElementById('memoryClueToggle');
      if(toggle)toggle.onclick=()=>{clues.hidden=!clues.hidden;toggle.setAttribute('aria-expanded',String(!clues.hidden));toggle.textContent=clues.hidden?'手掛かりを確認':'手掛かりを閉じる';};
      if (complete) return;
      const mirrorButton = document.getElementById('memoryFlip');
      if (mirrorButton) mirrorButton.onclick = () => {
        const current = config.getDraft();
        config.setDraft({ ...current, mirror:!current.mirror });
        open();
      };
      document.querySelectorAll('[data-memory-slot]').forEach(select => select.onchange = () => {
        const current = config.getDraft();
        current.order[Number(select.dataset.memorySlot)] = select.value;
        config.setDraft(current);
      });
      const submit = document.getElementById('memorySubmit');
      if (submit) submit.onclick=()=>{
        if (resolving) return;
        const attempt=config.getDraft();
        if (new Set(attempt.order).size!==3||attempt.order.includes('')) {
          document.getElementById('memoryStatus').textContent='同じ記号を重ねず、3つの痕跡を選ぼう。';
          return;
        }
        const solved = isMatch(attempt,config.solution);
        if (solved) {
          resolving=true;
          config.onSolved();
          showConfirmation(attempt);
        } else {
          window.gameSfx?.play('error');
          document.getElementById('memoryStatus').textContent='……まだ、記録がうまく重ならないみたい。手掛かりをもう一度見直してみよう。';
          submit.classList?.remove('memory-retry');void submit.offsetWidth;submit.classList?.add('memory-retry');
        }
      };
      const hint=document.getElementById('memoryHint');
      if (hint) hint.onclick=()=>{
        const next=Math.min(3,config.getHintLevel()+1);
        config.setHintLevel(next);
        document.getElementById('memoryHintText').textContent=hintTexts[next-1];
        hint.textContent=`段階ヒントを見る（${Math.min(3,next+1)}/3）`;
      };
    }
    function showConfirmation(attempt) {
      const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||document.body.classList.contains('gm-reduce-motion')||config.shortEffects?.();
      window.gameBgm?.duck(reduced?500:2200);
      window.gameSfx?.play(reduced?'success':'trace');
      const labels={star:'星',house:'家',bear:'熊'};
      const markup=`<div class="memory-link-animation" role="status" aria-live="polite"><div class="eyebrow">ARCHIVE / CORRELATION</div><h3>残された記憶の照合</h3><p>記録の結びつきを復元しています。</p><div class="memory-linked-symbols">${attempt.order.map((key,index)=>`<span class="memory-linked-symbol" style="--memory-step:${index}"><small>TRACE ${index+1}</small><strong>${labels[key]}</strong></span>`).join('')}</div><div class="memory-link-line" aria-hidden="true"></div><div class="memory-orientation">写真の補正：左右反転を適用</div><strong class="memory-confirm-title">TRACE LINK CONFIRMED</strong><p>3つの痕跡が一致しました。</p><div class="modalactions"><button class="btn" id="memorySkipConfirm" type="button">演出をスキップ</button></div></div>`;
      config.openModal(markup);
      let finished=false;
      const finish=()=>{if(finished)return;finished=true;clearTimeout(revealTimer);resolving=false;open();};
      document.getElementById('memorySkipConfirm').onclick=finish;
      revealTimer=setTimeout(finish,reduced?100:2200);
    }
    config.trigger?.addEventListener('click',()=>open());
    update();
    return {update,open,records,finishedRecord};
  }
  window.ClueLinkPuzzle={create,isMatch};
})();
