/* Common player menu. Kept independent from story and exploration markup. */
(() => {
  'use strict';
  const game = () => window.storyGame;
  const chapters = Object.keys(window.chapterDisplay.entries).map(id => [id, window.chapterDisplay.name(id)]);
  const style = document.createElement('style');
  style.textContent = `
    #gameMenuOpen{position:fixed;z-index:20010;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));padding:10px 17px;background:rgba(11,29,42,.9);color:#e7f5ff;border:1px solid #658da5;border-radius:8px;font:600 13px/1.4 system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 16px #0008}
    .flow-head,.top{padding-inline-end:clamp(94px,11vw,124px)!important}
    #gameMenuShade{position:fixed;inset:0;z-index:20011;background:rgba(3,10,19,.86);display:grid;place-items:center;padding:18px;color:#e8f5ff;font:15px/1.65 system-ui,sans-serif}
    #gameMenuShade[hidden]{display:none}
    .gm-panel{position:relative;width:min(100%,530px);max-height:min(90vh,850px);overflow:auto;overscroll-behavior:contain;background:linear-gradient(145deg,#162e41,#0b1828);border:1px solid #6790a7;border-radius:13px;padding:24px;box-shadow:0 20px 80px #000b}
    .gm-panel h2{font-size:22px;margin:0 40px 10px 0;color:#f2fbff}.gm-panel p{margin:8px 0 17px;color:#b7d1e1}.gm-close{position:absolute;top:15px;right:16px}
    .gm-actions{display:grid;gap:9px}.gm-panel button,.gm-panel select{min-height:42px;border:1px solid #6f91a6;border-radius:7px;background:#1b364c;color:#effaff;padding:8px 14px;font:inherit;cursor:pointer;text-align:left}
    .gm-panel button:hover,.gm-panel button:focus-visible{background:#315873;outline:2px solid #8fd3f2;outline-offset:1px}.gm-panel button:disabled{opacity:.38;cursor:not-allowed}.gm-panel .gm-primary{background:#28627b;border-color:#8bcee5}.gm-panel .gm-danger{background:#583137;border-color:#c98b8b}.gm-panel .gm-back{margin:0 0 12px}
    .gm-panel .gm-meta{color:#92bacb;font-size:13px}.gm-line{border-bottom:1px solid #365569;padding:8px 0}.gm-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:8px 0}.gm-row input[type=range]{width:47%}.gm-row select{max-width:56%;min-width:115px}.gm-row input[type=checkbox]{width:20px;height:20px}
    .gm-warning{border:1px solid #a57872;background:#422831;padding:12px;border-radius:6px;color:#ffdddd!important}.gm-note{font-size:12px;color:#9bb9cc!important}.gm-toast{position:fixed;z-index:20020;bottom:20px;left:50%;transform:translateX(-50%);background:#502e35;color:#fff;padding:12px 20px;border:1px solid #cc9ba1;border-radius:7px}
    body.gm-scan-disabled #nanaScanner,body.gm-scan-disabled #flowScanToggle{display:none!important}
    body.gm-help-disabled .explore-note,body.gm-help-disabled .flow-camera-toolbar>span{display:none!important}
    body.gm-reduce-motion *,body.gm-reduce-motion *::before,body.gm-reduce-motion *::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
    @media(min-width:700px), (pointer:fine){
      #gameMenuOpen{font-size:1.05vw;padding:.7vw 1.2vw;min-width:7.4vw;min-height:3vw;top:max(.7vw,env(safe-area-inset-top));right:max(.7vw,env(safe-area-inset-right))}
      .flow-head,.top{padding-inline-end:10vw!important}
      #gameMenuShade{font-size:1vw;padding:1vw}
      .gm-panel{width:min(92vw,47vw);max-height:90dvh;padding:1.6vw;border-radius:.8vw}
      .gm-panel h2{font-size:1.55vw;margin-right:3vw}.gm-panel .gm-meta{font-size:.9vw}
      .gm-panel button,.gm-panel select{min-height:2.8vw;padding:.55vw .9vw}
      .gm-actions{gap:.6vw}.gm-row{gap:.8vw;padding:.5vw 0}
    }
    @media(max-width:650px) and (pointer:coarse){#gameMenuOpen{top:max(6px,env(safe-area-inset-top));right:max(6px,env(safe-area-inset-right));padding:8px 12px;min-width:44px;min-height:44px}.gm-open-label{display:none}.flow-head,.top{padding-inline-end:58px!important}.gm-panel{padding:clamp(12px,3vw,18px)}.gm-panel h2{font-size:19px}}
    @media(max-height:520px){#gameMenuShade{padding:8px}.gm-panel{max-height:calc(100dvh - 16px)}}
  `;
  document.head.append(style);
  const open = document.createElement('button');
  open.id = 'gameMenuOpen'; open.type = 'button'; open.innerHTML = '<span aria-hidden="true">☰</span> <span class="gm-open-label">メニュー</span>'; open.setAttribute('aria-label','メニュー');
  open.setAttribute('aria-haspopup','dialog');
  const shade = document.createElement('div');
  shade.id='gameMenuShade'; shade.hidden=true;
  shade.innerHTML='<section class="gm-panel" role="dialog" aria-modal="true" aria-label="ゲームメニュー"><button class="gm-close" type="button" aria-label="閉じる">×</button><div id="gameMenuBody"></div></section>';
  document.body.append(open,shade);
  const body = shade.querySelector('#gameMenuBody');
  const close = () => { shade.hidden=true; open.focus(); };
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button = (label,action,disabled=false,klass='') => `<button type="button" data-action="${action}" ${disabled?'disabled':''} class="${klass}">${escape(label)}</button>`;
  const data = () => game().menuSaveData();
  function show(html){body.innerHTML=html;shade.hidden=false;shade.querySelector('.gm-close').onclick=close;body.querySelector('button:not(:disabled)')?.focus();}
  function main(){
    const d=data();
    show(`<h2>ORBITAL SALVAGE</h2>${d.replay?'<p class="gm-note">章の再プレイ中です。本編の記録は保護されています。</p>':''}<div class="gm-actions">
      ${button('ゲームに戻る','close')}${button('続きから','continue',!d.hasSave || d.replay)}${button('最初から','new')}
      ${button('章を選ぶ','chapters',!d.hasSave || d.replay)}${button('セーブデータの確認','save')}${button('設定','settings')}
      ${d.replay?button('再プレイを終了して本編へ','exitReplay',false,'gm-primary'):''}
    </div>`);
  }
  function confirmNew(){show(`<h2>最初から</h2><p>ゲームを最初からやり直しますか？</p><p class="gm-warning">現在の進行状況は失われます。この操作は取り消せません。</p><div class="gm-actions">${button('キャンセル','main')}${button('最初からやり直す','doNew',false,'gm-danger')}</div>`);}
  function confirmReplayExit(){show(`<h2>再プレイを終了</h2><p>再プレイ中の進行状況は破棄され、本編の保存地点に戻ります。</p><div class="gm-actions">${button('キャンセル','main')}${button('本編に戻る','doExitReplay',false,'gm-primary')}</div>`);}
  function saveInfo(){
    const d=data();
    const fmt=d.savedAt?new Date(d.savedAt).toLocaleString('ja-JP'):'旧形式のため記録なし';
    const names=keys=>chapters.filter(([id])=>keys.includes(id)).map(([,label])=>label).join('、')||'なし';
    show(`<h2>セーブデータ</h2><div class="gm-line">現在の章：${escape(d.chapterName)}</div><div class="gm-line">最終保存：${escape(fmt)}</div><div class="gm-line">到達済み：${escape(names(d.reached))}</div><div class="gm-line">クリア済み：${escape(names(d.completed))}</div><div class="gm-line">自動セーブ：${d.healthy?'有効':'保存に失敗しました'}</div>${d.replay?'<p class="gm-note">再プレイ中。上記は保護された本編の記録です。</p>':''}<div class="gm-actions">${button('戻る','main')}${button('進行データを削除して最初から','new',!d.hasSave,'gm-danger')}</div>`);
  }
  function chaptersView(){
    const d=data();
    show(`<h2>章を選ぶ</h2><p>到達済みの章を選んで、もう一度遊べます。遊び終えたら本編の保存地点へ戻れます。</p><div class="gm-actions">${chapters.map(([id,name])=>button(`${name}${d.reached.includes(id)?'　↻ 選んで遊ぶ':'　🔒 未到達'}`,`replay:${id}`,!d.reached.includes(id))).join('')}${button('戻る','main')}</div><p class="gm-note">選んだ章は独立した状態で始まります。本編の所持品・進行状況・セーブデータは変更されません。</p>`);
  }
  function confirmReplay(id){
    if(!data().reached.includes(id))return;
    const name=chapters.find(([k])=>k===id)?.[1];
    show(`<h2>${escape(name)}</h2><p>この章を最初から再プレイしますか？　本編のセーブデータは変更されません。</p><div class="gm-actions">${button('キャンセル','chapters')}${button('この章を最初から再プレイ',`doReplay:${id}`,false,'gm-primary')}</div>`);
  }
  function settingRow(label,key,type,values){
    const s=game().readSettings(),v=s[key];
    if(type==='check')return `<label class="gm-row"><span>${escape(label)}</span><input type="checkbox" data-setting="${key}" ${v?'checked':''}></label>`;
    if(type==='range')return `<label class="gm-row"><span>${escape(label)} <output>${v}%</output></span><input type="range" min="0" max="100" step="5" data-setting="${key}" value="${Number(v)}"></label>`;
    return `<label class="gm-row"><span>${escape(label)}</span><select data-setting="${key}">${values.map(([k,text])=>`<option value="${k}" ${String(v)===String(k)?'selected':''}>${escape(text)}</option>`).join('')}</select></label>`;
  }
  function settingsView(){
    show(`<h2>設定</h2><div class="gm-meta">サウンド</div>${settingRow('マスター音量','master','range')}${settingRow('BGM音量','bgm','range')}${settingRow('効果音','effects','range')}${settingRow('環境音','ambient','range')}${settingRow('BGMミュート','bgmMute','check')}${settingRow('すべてミュート','mute','check')}<p class="gm-note">各章の専用BGMと控えめな船内環境音を再生します。</p><div class="gm-meta">文字表示</div>${settingRow('文字送り速度','textSpeed','select',[[18,'速い'],[34,'標準'],[65,'ゆっくり']])}${settingRow('文字をすぐ表示','instantText','check')}${settingRow('会話送り','advance','select',[['click','クリック・タップ＋キーボード'],['tap','クリック・タップ']])}<div class="gm-meta">演出</div>${settingRow('短縮演出','shortEffects','check')}${settingRow('動きを減らす','reduceMotion','check')}<div class="gm-meta">探索</div>${settingRow('スキャン表示','scan','check')}${settingRow('操作説明の表示','help','check')}<p class="gm-note">ズーム：ホイール／ピンチで拡大、ドラッグで移動。「表示リセット」で元に戻せます。</p><div class="gm-actions">${button('戻る','main')}</div>`);
    body.querySelectorAll('[data-setting]').forEach(el=>el.addEventListener('change',()=>{
      const key=el.dataset.setting;
      const value=el.type==='checkbox'?el.checked:el.type==='range'||key==='textSpeed'?Number(el.value):el.value;
      if(!game().updateSettings({[key]:value}))return toast('設定を保存できませんでした。');
      applySettings();
      if(el.type==='range')el.closest('label').querySelector('output').textContent=el.value+'%';
    }));
  }
  function applySettings(){const s=game().readSettings();document.body.classList.toggle('gm-scan-disabled',!s.scan);document.body.classList.toggle('gm-help-disabled',!s.help);document.body.classList.toggle('gm-reduce-motion',!!s.reduceMotion);window.gameBgm?.sync();window.gameSfx?.sync();}
  let toastTimer;
  function toast(message){let el=document.querySelector('.gm-toast');if(!el){el=document.createElement('div');el.className='gm-toast';el.setAttribute('role','alert');document.body.append(el);}el.textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),4800);}
  body.addEventListener('click',e=>{
    const name=e.target.closest('button[data-action]')?.dataset.action;
    if(!name)return;
    if(name.startsWith('replay:'))return confirmReplay(name.split(':')[1]);
    if(name.startsWith('doReplay:')){if(!game().beginReplay(name.split(':')[1]))toast('再プレイを開始できませんでした。');return;}
    switch(name){case 'main':main();break;case 'close':close();break;case 'continue':location.reload();break;case 'new':confirmNew();break;
      case 'doNew':if(!game().beginFromStart())toast('初期化できませんでした。保存領域をご確認ください。');break;
      case 'chapters':chaptersView();break;case 'save':saveInfo();break;case 'settings':settingsView();break;
      case 'exitReplay':confirmReplayExit();break;case 'doExitReplay':game().exitReplay();break;
    }
  });
  open.onclick=main;
  shade.addEventListener('click',e=>{if(e.target===shade)close();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!shade.hidden){e.stopImmediatePropagation();e.preventDefault();close();}
    if(e.key==='Escape'&&shade.hidden){e.stopImmediatePropagation();main();}
  },true);
  window.gameMenu={open:main,openStartConfirm:confirmNew,saveError:()=>toast('自動セーブに失敗しました。保存領域をご確認ください。')};
  applySettings();
})();
