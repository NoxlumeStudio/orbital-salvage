/* A deliberately image-independent chapter-flow prototype.
   Replace stage artwork and story slides here as production assets arrive. */
(() => {
  'use strict';
  const root = () => document.getElementById('storyRoot');
  // Legacy scene IDs contain .png and are persisted in saves. Convert only the displayed URL.
  const publicImagePath = path => typeof path === 'string' ? path.replace(/\.png$/, '.webp') : path;
  const chapterFour = () => document.getElementById('gameApp');
  const openingStill = './opening-transport.png'; // 1672 x 941, supplied opening still.
  const deliveryStill = './prologue-keepsakes.png';
  const memoryStill = './prologue-memory.png';
  const capsuleStill = './interlude-capsule.png';
  const nanaMeetingStill = './interlude-nana.png';
  const ch4ArrivalStill = './ch4-arrival.png'; // スチル①「捨てられた街」
  const ch4ReturnStill = './ch4-teddy-return.png'; // スチル②「大切なもの」
  const ch4AfterStill = './ch4-aftermath.png'; // スチル③「小さな疑問」
  // 第5章の素材は後日差し替え。画像未登録時は共通ノベル背景を使用。
  const ch5OpeningStill = './ch5-opening.png';
  const ch5HeroStill = './ch5-hero.png';
  const ch5AccidentStill = './ch5-accident.png';
  const ch6ArrivalStill = './ch6-arrival.png'; // スチル①「眠れる輸送船」
  const ch6CargoArt = './ch6-cargo.png'; // 探索背景A「忘れられた貨物区画」
  const ch6CaseClosedArt = './ch6-case-locked.png'; // 探索背景B「閉じた貨物ケース」
  const ch6CaseOpenArt = './ch6-case-open.png'; // 探索背景C「開いた貨物ケース」
  const ch6LetterStill = './ch6-letter-discovery.png'; // スチル②「届かなかった手紙」
  const ch6DeliveryStill = './ch6-letter-delivery.png'; // スチル③「届いた想い」
  const epilogueStill = './epilogue-route.png'; // スチル④「二人の航路」
  const stageState = Object.create(null);
  let sequence = null;
  let typingTimer = null;
  let flowLocked = false;
  let activeStage = null;
  let signalAudio = null;
  const saveKey = 'orbital-salvage-save-v1';
  const replayKey = 'orbital-salvage-replay-v1';
  const replaySessionKey = 'orbital-salvage-replay-active';
  const settingsKey = 'orbital-salvage-settings-v1';
  const chapterOrder = ['prologue','chapter4','arcade','freighter'];
  const chapterNames = Object.fromEntries(chapterOrder.map(id => [id, window.chapterDisplay.name(id)]));
  const defaults = {master:70,effects:70,bgm:40,bgmMute:false,ambient:35,mute:false,textSpeed:34,instantText:false,advance:'click',shortEffects:false,reduceMotion:false,scan:true,help:true};
  let settings = readSettings();
  const effectVolume = value => settings.mute ? 0.0001 : Math.max(0.0001,value * (Number(settings.master)||0)/100 * (Number(settings.effects)||0)/100);
  function readSettings(){try{return {...defaults,...JSON.parse(localStorage.getItem(settingsKey)||'{}')};}catch(_){return {...defaults};}}
  function updateSettings(next){settings={...settings,...next};try{localStorage.setItem(settingsKey,JSON.stringify(settings));return true;}catch(_){return false;}}
  let replayMode = false;
  try { replayMode = !!sessionStorage.getItem(replaySessionKey); } catch (_) {}
  let replayChapter = null;
  try { replayChapter = sessionStorage.getItem(replaySessionKey); } catch (_) {}
  const saveTarget = () => replayMode ? replayKey : saveKey;
  let reachedChapters = new Set(['prologue']);
  let completedChapters = new Set();
  let saveHealthy = true;
  let latestStage = 'prologue';
  let restoringScene = null;
  let restoreActive = false;
  let missionNoticeTimer = null;
  let missionNoticeShown = new Set();
  let stageCamera = null;
  let cargoMotionFinish = null;
  function disposeStageCamera() { stageCamera?.destroy?.(); stageCamera = null; }

  function readSave(key = saveTarget()) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      return data?.version === 1 ? data : null;
    } catch (_) { return null; }
  }
  function saveProgress(mode) {
    if (restoreActive) return;
    try {
      const stageData = Object.fromEntries(Object.entries(stageState).map(([id, state]) => [id, {
        ...state, found: [...state.found], seen: [...state.seen], tools: [...state.tools],
      }]));
      const saveData = JSON.stringify({
        version: 1,
        mode: mode || (sequence ? 'story' : activeStage ? 'stage' : 'chapter4'),
        scene: sequence?.saveId || null,
        line: sequence?.index || 0,
        stage: activeStage || latestStage,
        stageData,
        missionNotice: [...missionNoticeShown],
        chapter4: window.chapterFourSave?.snapshot?.() || null,
        savedAt:new Date().toISOString(),
        reached:[...reachedChapters],completed:[...completedChapters],
      });
      localStorage.setItem(saveTarget(),saveData);
      saveHealthy = true;
    } catch (_) { saveHealthy = false; window.gameMenu?.saveError?.(); }
  }
  function restoreGame() {
    const saved = readSave();
    if (!saved) return opening();
    restoreActive = true;
    try {
      Object.entries(saved.stageData || {}).forEach(([id, data]) => {
        if (!stages[id]) return;
        stageState[id] = { ...data, found: new Set(data.found || []), seen: new Set(data.seen || []), tools: new Set(data.tools || []) };
      });
      missionNoticeShown = new Set(saved.missionNotice || []);
      latestStage = stages[saved.stage] ? saved.stage : 'prologue';
      const inferred = saved.mode==='chapter4'?'chapter4':saved.mode==='end'?'freighter':saved.stage || 'prologue';
      const rank = chapterOrder.indexOf(inferred);
      reachedChapters = new Set(saved.reached || chapterOrder.slice(0,Math.max(0,rank)+1));
      reachedChapters.add('prologue');
      completedChapters = new Set(saved.completed || []);
      if (saved.chapter4?.finished) completedChapters.add('chapter4');
      window.chapterFourSave?.restore?.(saved.chapter4);
    } finally { restoreActive = false; }
    if (saved.mode === 'end') return showEnd();
    if (saved.mode === 'chapter4') return saved.chapter4?.finished ? chapterFourReturn() : showChapterFourExploration();
    if (saved.mode === 'story') {
      const handler = storyResumers[saved.scene];
      if (handler) {
        restoringScene = saved;
        return handler();
      }
    }
    return renderStage(latestStage);
  }

  const storyResumers = {
    './opening-transport.png': opening,
    './prologue-keepsakes.png': prologueDelivery,
    './prologue-memory.png': prologueEnding,
    './interlude-capsule.png': capsuleDiscovery,
    './interlude-nana.png': nanaMeeting,
    './ch4-arrival.png': enterChapterFour,
    './ch4-teddy-return.png': chapterFourReturn,
    './ch4-aftermath.png': chapterFourAfter,
    './ch5-opening.png': chapterFiveOpening,
    'アーケード筐体': chapterFiveArcadeTalk,
    '映像端末の復旧': chapterFiveRepairLeadIn,
    './ch5-hero.png': chapterFiveHero,
    '帰還': chapterFiveReturnNarration,
    './ch5-accident.png': chapterFiveAccident,
    '壊れたもの': chapterFiveRepair,
    '次の仕事': chapterFiveNextJob,
    './ch6-arrival.png': chapterSixOpening,
    './ch6-letter-discovery.png': chapterSixLetterFound,
    '配達先への航路': chapterSixTravel,
    './ch6-letter-delivery.png': chapterSixDelivery,
    './epilogue-route.png': chapterSixEpilogue,
  };

  const stages = {
    prologue: {
      number: window.chapterDisplay.english('prologue'), title: '小さな形見',
      location: '破損した輸送船・船内',
      art: './transport-cabin.webp',
      objective: '個人ロッカーを調べ、子供の靴とノートを回収する。',
      required: ['shoe', 'notebook'],
      hotspots: [
        { id: 'locker', title: '左側の個人ロッカー', detail: true, x: 27, y: 40, w: 9, h: 60 },
        { id: 'locker-key', title: '宙に浮かぶ古い鍵', tool: 'lockerKey', x: 37, y: 59, w: 9, h: 11 },
        { id: 'notebook', title: '机の上のノート', collect: true, cargo: 'ノート', x: 51, y: 64, w: 13, h: 19 },
        { id: 'photo', title: '宙に浮く写真立て', text: '無重力の船内を漂う家族写真。並んだ人々の笑顔が、かつての船内の暮らしを伝えている。', x: 38, y: 27, w: 7, h: 12 },
        { id: 'papers', title: '漂う書類', text: '宙を漂う乗員の勤務記録らしい。書き込みや折り目が、ここで働いた人の手を感じさせる。', x: 55, y: 31, w: 6, h: 9 },
        { id: 'tools', title: '開いた工具ケース', text: '整備用の工具が入っている。古い鍵を見つければ、ロッカーを開けられそうだ。', x: 24, y: 81, w: 14, h: 13 },
        { id: 'jacket', title: '黄色い作業服', text: '左端のロッカーに掛かった作業服。袖口が擦り切れ、胸には古い識別タグが残っている。', x: 7, y: 50, w: 11, h: 39 },
        { id: 'bunks', title: '二段ベッド', text: '寝具がベルトで固定された二段ベッド。ここで交代しながら仮眠を取っていたのだろう。', x: 45, y: 29, w: 13, h: 26 },
        { id: 'mug', title: '漂う金属カップ', text: '宙に浮いた小さなカップ。持ち主が飲み物を口にした直後に、船が破損したのかもしれない。', x: 49, y: 17, w: 5, h: 9 },
        { id: 'extinguisher', title: '非常用消火器', text: '緊急設備は壁に固定されたままだ。赤い塗装に長年の傷がついている。', x: 68, y: 23, w: 5, h: 13 },
        { id: 'recorder', title: '宙に浮く作業ライト', text: '作業用のライトが無重力の室内をゆっくり漂っている。修理の途中で手を離したのだろうか。', x: 60, y: 58, w: 7, h: 13 },
        { id: 'luggage', title: '固定された貨物ケース', text: '金属ケースには輸送時の固定ベルトが残っている。中身よりも、ここで暮らした人の痕跡が目につく。', x: 90, y: 61, w: 15, h: 31 },
        { id: 'breach', title: '破損した船体の外壁', text: '右側の外壁が大きく破れ、船外にデブリが漂っている。これ以上近づくのは危険だ。', x: 83, y: 26, w: 18, h: 42 },
      ],
    },
    arcade: {
      number: window.chapterDisplay.english('arcade'), title: '忘れられたヒーロー',
      location: '廃娯楽施設・ゲームコーナー',
      art: './ch5-exploration.webp',
      objective: '電子基板・銅線・制御モジュールを回収し、古い映像端末を調べる。',
      required: ['board', 'copper', 'control'],
      hotspots: [
        { id: 'power-cell', title: '予備の電源セル', tool: 'powerCell', x: 70, y: 80, w: 8, h: 12 },
        { id: 'board', title: '電子基板', collect: true, cargo: '電子基板', x: 29, y: 73, w: 13, h: 23 },
        { id: 'copper', title: '露出した配線', collect: true, cargo: '銅線', x: 86, y: 44, w: 12, h: 23 },
        { id: 'control', title: '右手前の操作パネル', collect: true, cargo: '制御モジュール', text: '操作パネルの内部に、まだ使える制御ユニットが残っている。', x: 87, y: 78, w: 20, h: 26 },
        { id: 'hero', title: '古い映像端末', event: 'hero', x: 81, y: 25, w: 20, h: 25 },
        { id: 'arcade-machine', title: 'アーケード筐体', event: 'arcade-machine', x: 17, y: 35, w: 20, h: 25 },
        { id: 'claw', title: 'クレーンゲーム', speaker: 'ナナ', text: '「中の玩具を取るために、機械を操作するの？」', x: 54, y: 47, w: 21, h: 41 },
        { id: 'toy', title: '浮遊するぬいぐるみ', text: '玩具がいくつも浮かんでいる。ナナは人間が遊んでいた痕跡をじっと眺めている。', x: 35, y: 64, w: 9, h: 15 },
      ],
    },
    freighter: {
      number: window.chapterDisplay.english('freighter'), title: '届けられなかった手紙',
      location: '漂流輸送船・貨物区画',
      art: ch6CargoArt,
      objective: '高性能電子基板・バッテリーモジュール・補機部品を回収する。',
      required: ['board6', 'battery', 'aux'],
      hotspots: [
        { id: 'access-card', title: '破損した認証カード', tool: 'brokenCard', x: 53, y: 37, w: 10, h: 14 },
        { id: 'circuit-part', title: '修理用回路部品', tool: 'circuitPart', x: 19, y: 16, w: 9, h: 16 },
        { id: 'board6', title: '高性能電子基板', collect: true, cargo: '高性能電子基板', x: 10, y: 35, w: 16, h: 28 },
        { id: 'battery', title: 'バッテリーモジュール', collect: true, cargo: 'バッテリーモジュール', x: 29, y: 29, w: 15, h: 19 },
        { id: 'aux', title: '補機部品', collect: true, cargo: '補機部品', x: 22, y: 82, w: 26, h: 28 },
        { id: 'case', title: '古い貨物ケース', detail: true, x: 78, y: 26, w: 16, h: 19 },
        { id: 'log', title: '漂う貨物伝票', text: '積荷のリストが残っている。到着しなかった荷物の記録もある。', x: 56, y: 14, w: 8, h: 13 },
        { id: 'straps', title: '貨物固定ベルト', text: '金具は長年の振動に耐えていた。輸送船は無重力の貨物をこうして固定していたようだ。', x: 63, y: 51, w: 8, h: 15 },
        { id: 'safety-panel', title: '貨物安全制御盤', text: '中央の積荷に取り付けられた旧式の固定制御盤。', x: 46, y: 49, w: 13, h: 18 },
        { id: 'door', title: '貨物区画の隔壁', text: '古い隔壁。表面の傷から、この船が長い航路を走ってきたことが分かる。', x: 66, y: 28, w: 8, h: 22 },
      ],
    },
  };

  function st(id) {
    return stageState[id] ||= { found: new Set(), seen: new Set(), tools: new Set(), selectedTool: null, unlocked: false };
  }
  function journalSeenLabels(id, state) {
    const labels = {
      'locker-unlocked': '個人ロッカーを開錠',
      'hero-event': '古いヒーロー映像を再生',
      'letter-event': '古い手紙を発見',
      'letter-story': '手紙の配達を決意',
      'doll': '木彫りの人形を調査',
      'cargo-safety-complete': '貨物区画の安全制御：完了',
      'cargo-storage': '旧保管表示を解析',
    };
    const hotspots = stages[id].hotspots;
    return [...state.seen].map(key => hotspots.find(item => item.id === key)?.title || labels[key]).filter(Boolean);
  }
  function syncPrologueObservation(state) {
    // 旧セーブで解放済みの状態だけを継承する。両方調査済みでも自動正解にはしない。
    return !!state.observationUnlocked;
  }
  function showPrologueObservationHint() {
    const state = st('prologue');
    const hints = [
      '作業服と漂う書類は、同じ場所で使われていたようだ。二つの情報を調べよう。',
      '作業服の識別タグと、書類の管理記録にある番号を比べてみよう。',
      '作業服のスキャンで復元された末尾の番号と同じ管理番号を、書類の3件から選ぼう。',
    ];
    if (state.observationUnlocked) {
      return detail('観察のヒント', 'ロッカーに関わる補足記録は復元済み。調査記録で確認できる。', [{label:'探索に戻る',run:closeDetail}]);
    }
    state.observationHintLevel = Math.min(3,(state.observationHintLevel || 0)+1);
    saveProgress('stage');
    detail('観察のヒント', hints[state.observationHintLevel-1], [
      {label:'探索に戻る',run:closeDetail},
      ...(state.observationHintLevel < 3 ? [{label:'もう少しヒントを見る',run:showPrologueObservationHint}] : []),
    ]);
  }
  function toolMarkerVisible(id, state, item) {
    // 背景に描かれていない道具は別画像で重ねる。拾うと非表示になる。
    if (id === 'arcade') return !!item.tool && !state.tools.has(item.tool) && !state.terminalPower && !state.seen.has('hero-event');
    if (id === 'freighter' && item.tool === 'brokenCard') return !state.tools.has('brokenCard') && !state.tools.has('repairedCard');
    return false;
  }

  // 謎解き道具は回収依頼品と区別し、画像到着後に src を追加できる。
  const puzzleTools = {
    prologue: {
      lockerKey: { name: '古いロッカーの鍵', symbol: '⚿', src: './prologue-locker-key.webp' },
    },
    arcade: {
      powerCell: { name: '予備の電源セル', symbol: '▣', src: './ch5-power-cell.webp' },
    },
    freighter: {
      brokenCard: { name: '破損した認証カード', symbol: '▤', src: './ch6-card-damaged.webp' },
      circuitPart: { name: '修理用回路部品', symbol: '▦', src: './ch6-circuit-module.webp' },
      repairedCard: { name: '修復した認証カード', symbol: '▤', src: './ch6-card-repaired.webp' },
    },
  };
  function haltTyping() {
    if (typingTimer !== null) clearInterval(typingTimer);
    typingTimer = null;
  }
  function stageJumpButton() {
    return '';
  }

  function play(slides, onFinish, options = {}) {
    const sceneChapter = {'./opening-transport.png':'prologue','./ch4-arrival.png':'chapter4','./ch5-opening.png':'arcade','./ch6-arrival.png':'freighter'}[options.image];
    if (replayMode && sceneChapter && sceneChapter !== replayChapter) return showReplayEnd();
    if (sceneChapter && !replayMode) reachedChapters.add(sceneChapter);
    disposeStageCamera();
    haltTyping();
    chapterFour().hidden = true;
    const imageChapter={'./ch4-arrival.png':'chapter4','./ch4-teddy-return.png':'chapter4','./ch4-aftermath.png':'chapter4','./ch5-opening.png':'arcade','./ch5-hero.png':'arcade','./ch5-accident.png':'arcade','./ch6-arrival.png':'freighter','./ch6-letter-discovery.png':'freighter','./ch6-letter-delivery.png':'freighter','./epilogue-route.png':'epilogue'}[options.image];
    const labelChapter=/EPILOGUE/.test(options.label||'')?'epilogue':/CHAPTER 06/.test(options.label||'')?'freighter':/CHAPTER 05/.test(options.label||'')?'arcade':/CHAPTER 04/.test(options.label||'')?'chapter4':null;
    const storyChapter=options.image==='./opening-transport.png'?null:(imageChapter||labelChapter||latestStage);
    // Story routing above intentionally uses original scene identifiers and labels.
    const displayLabel = window.chapterDisplay.sceneLabel(options.label);
    window.gameBgm?.setScene(storyChapter,options.image==='./ch5-hero.png'?'hero':'story');
    root().hidden = false;
    activeStage = null;
    flowLocked = false;
    const saveId = options.image || options.title || './opening-transport.png';
    const resumeIndex = restoringScene?.scene === saveId ? Math.min(Math.max(0, restoringScene.line || 0), slides.length - 1) : 0;
    if (restoringScene?.scene === saveId) restoringScene = null;
    sequence = { slides, onFinish, options, index: resumeIndex, typed: false, saveId };
    saveProgress('story');
    root().innerHTML = `<div class="story-cinema" id="storyCinema" role="button" tabindex="0" aria-label="クリックまたはタップで物語を進める"><div class="story-still${options.image ? ' with-art' : ''}" id="storyStill" style="--story-fade-ms:${settings.reduceMotion?0:settings.shortEffects?200:options.fadeInMs||2000}ms;${options.image ? `background-image:url('${options.image.replace(/\.png$/, '.webp')}')` : ''}">${options.image ? '' : `<div class="story-intertitle"><small>${displayLabel || 'ORBITAL SALVAGE'}</small><span>${options.title || 'STORY ARTWORK / 未登録'}</span>${options.note ? `<em>${options.note}</em>` : ''}</div>`}</div><div class="story-vignette"></div><div class="story-caption" id="storyCaption"><span class="speaker" id="storySpeaker"></span><span id="storyWords"></span><button class="advance" id="storyAdvance" type="button" aria-label="次へ。文字送り中は全文を表示">次へ ▶</button><button class="story-skip" id="storySkip" type="button" aria-label="現在のシーンをスキップ">スキップ ≫</button></div></div>`;
    if (options.monitor) {
      document.getElementById('storyStill').innerHTML = `<div class="story-arcade-bezel" aria-label="古いゲーム筐体のモニター"><div class="story-arcade-screen"><div class="story-arcade-top">AC-07 <span>ARCADE / OFFLINE</span></div><div class="story-arcade-emblem"><span>★</span><strong>ASTRO<br>ARCADE</strong></div><div class="story-arcade-status">DEMO SYSTEM / NO SIGNAL</div><div class="story-arcade-scanlines"></div></div><div class="story-arcade-controls"><span>●</span><span>●</span><span>◉</span><small>1 PLAYER / STANDBY</small></div></div>`;
    }
    document.getElementById('storyCinema').addEventListener('click', nextLine);
    document.getElementById('storyCinema').addEventListener('keydown', e => { if (settings.advance !== 'tap' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nextLine(); } });
    document.getElementById('storyAdvance').addEventListener('click', e => { e.stopPropagation(); nextLine(); });
    document.getElementById('storyAdvance').addEventListener('keydown', e => e.stopPropagation());
    document.getElementById('storySkip').addEventListener('click', e => { e.stopPropagation(); finishSequence(true); });
    if (options.delayTextMs && resumeIndex === 0 && !settings.reduceMotion && !settings.shortEffects) {
      flowLocked = true;
      document.getElementById('storyCaption').hidden = true;
      const current = sequence;
      setTimeout(() => {
        if (sequence !== current) return;
        document.getElementById('storyCaption').hidden = false;
        flowLocked = false;
        displayLine();
      }, options.delayTextMs);
    } else displayLine();
  }

  function displayLine() {
    if (!sequence) return;
    const entry = sequence.slides[sequence.index];
    if (entry.pauseForSignal) return pauseForSignal();
    if (entry.holdStill) {
      const current = sequence;
      document.getElementById('storyCaption').hidden = true;
      sequence.typed = false;
      flowLocked = true;
      setTimeout(() => {
        if (sequence !== current) return;
        current.typed = true;
        flowLocked = false;
      }, entry.holdStill);
      return;
    }
    const words = document.getElementById('storyWords');
    const speaker = document.getElementById('storySpeaker');
    speaker.textContent = entry.speaker || '';
    words.textContent = '';
    sequence.typed = false;
    syncStoryControls();
    if (entry.zoom) document.getElementById('storyStill').classList.add('is-zooming');
    const letters = [...entry.text];
    let index = 0;
    haltTyping();
    typingTimer = setInterval(() => {
      if (!sequence) return haltTyping();
      index = Math.min(index + 1, letters.length);
      words.textContent = letters.slice(0, index).join('');
      if (index === letters.length) { sequence.typed = true; haltTyping(); syncStoryControls(); }
    }, settings.instantText ? 0 : Math.max(8,Number(settings.textSpeed)||34));
    if (settings.instantText) revealLine();
  }

  function warningBeep() {
    try {
      const AudioType = window.AudioContext || window.webkitAudioContext;
      if (!AudioType) return;
      signalAudio ||= new AudioType();
      signalAudio.resume();
      const t = signalAudio.currentTime + 0.03;
      [t, t + 0.33].forEach(time => {
        const tone = signalAudio.createOscillator();
        const gain = signalAudio.createGain();
        tone.type = 'sine'; tone.frequency.value = 950;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(effectVolume(0.10), time + 0.016);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
        tone.connect(gain); gain.connect(signalAudio.destination);
        tone.start(time); tone.stop(time + 0.18);
      });
    } catch (_) { /* 音声再生不可でも文章は進行する */ }
  }

  function pauseForSignal() {
    const current = sequence;
    flowLocked = true;
    document.getElementById('storyCaption').hidden = true;
    setTimeout(() => {
      if (sequence !== current) return;
      warningBeep();
      setTimeout(() => {
        if (sequence !== current) return;
        current.index++;
        document.getElementById('storyCaption').hidden = false;
        flowLocked = false;
        displayLine();
      }, 570);
    }, 2000);
  }

  function nextLine() {
    if (!sequence || flowLocked) return;
    if (sequence.slides[sequence.index].holdStill) return finishSequence();
    if (!sequence.typed) return revealLine();
    if (sequence.index + 1 < sequence.slides.length) {
      sequence.index++;
      saveProgress('story');
      displayLine();
    } else finishSequence();
  }

  function revealLine() {
    if (!sequence || flowLocked || sequence.typed || !sequence.slides[sequence.index].text) return;
    haltTyping();
    document.getElementById('storyWords').textContent = sequence.slides[sequence.index].text;
    sequence.typed = true;
    syncStoryControls();
  }
  function syncStoryControls() {
    const next = document.getElementById('storyAdvance');
    if (next) next.setAttribute('aria-label',sequence?.typed?'次の文章へ':'文字送りを完了して全文表示');
  }

  function finishSequence(force = false) {
    if (!sequence || (flowLocked && !force)) return;
    haltTyping();
    flowLocked = true;
    const next = sequence.onFinish;
    const withFade = sequence.options.fadeOut;
    const fadeDuration = settings.reduceMotion ? 0 : settings.shortEffects ? 200 : sequence.options.fadeOutMs || 1000;
    sequence = null;
    if (withFade) {
      const cinema = document.getElementById('storyCinema');
      cinema.style.setProperty('--story-exit-ms', `${fadeDuration}ms`);
      cinema.classList.add('exiting');
    }
    setTimeout(() => {
      flowLocked = false;
      next();
    }, withFade ? fadeDuration : 120);
  }

  function opening() {
    play([
      { text: '宇宙には音がない。' },
      { text: 'その静けさの中に、エステバン・モラレスはひとり浮かんでいた。' },
      { text: '今回の仕事は、ただのガラクタ漁りではない。', zoom: true },
      { text: '誰かの「形見」を拾いに来ている。' },
      { speaker: 'エステバン', text: '「……Vamos」' },
    ], () => {
      root().style.opacity = '0';
      setTimeout(() => { renderStage('prologue'); root().style.transition = 'opacity 1s'; root().style.opacity = '1'; }, 70);
    }, { image: openingStill, fadeOut: true });
  }

  function stageDialogue(who, text) {
    const el = document.getElementById('flowDialogue');
    if (!el) return;
    const role = who === 'ナナ' ? 'nana' : who === 'エステバン' ? 'esteban' : 'scan';
    el.innerHTML = `<div class="flow-face ${role}" aria-label="${who}"></div><div class="flow-dialogue-copy"><p>${text}</p></div>`;
  }

  // 単品画像が届くまでは、提供された探索絵の該当部分を拡大して表示する。
  // 回収品のカードと調査ポップアップで同じ画像定義を使用する。
  const prologueItemArt = {
    shoe: { name: '子供の靴', src: './prologue-locker-open.webp', x: 48, y: 75 },
    notebook: { name: 'ノート', src: './transport-cabin.webp', x: 54, y: 61 },
  };
  const arcadeItemArt = {
    board: { name: '電子基板', src: './ch5-exploration.webp', x: 29, y: 73 },
    copper: { name: '銅線', src: './ch5-exploration.webp', x: 86, y: 44 },
    control: { name: '制御モジュール', src: './ch5-exploration.webp', x: 87, y: 78 },
  };
  const freighterItemArt = {
    board6: { name: '高性能電子基板', src: ch6CargoArt, x: 10, y: 35 },
    battery: { name: 'バッテリーモジュール', src: ch6CargoArt, x: 29, y: 29 },
    aux: { name: '補機部品', src: ch6CargoArt, x: 22, y: 82 },
  };
  function itemPicture(key, stageId = 'prologue') {
    const entry = (stageId === 'arcade' ? arcadeItemArt : stageId === 'freighter' ? freighterItemArt : prologueItemArt)[key];
    return entry ? `<span class="flow-item-picture" role="img" aria-label="${entry.name}" style="background-image:url('${publicImagePath(entry.src)}');background-position:${entry.x}% ${entry.y}%"></span>` : '';
  }

  function mountExplorationCamera(id, stage, state) {
    const viewport = root().querySelector('.flow-art');
    const toolbar = document.createElement('div');
    toolbar.className = 'flow-camera-toolbar';
    const scanMode = id==='prologue'?'IDENTIFICATION / 識別':id==='arcade'?'SYSTEM DIAGNOSTIC / 診断':'ENVIRONMENT / 状態確認';
    toolbar.innerHTML = `<span>拡大：ホイール・ピンチ / 移動：ドラッグ</span><small class="flow-scan-mode" aria-label="この区画の解析対象">${scanMode}</small><button type="button" id="flowZoomReset" title="拡大・移動した表示を初期状態に戻す（等倍では無効）">表示を戻す</button><button type="button" id="flowScanToggle" aria-pressed="false">スキャン</button>${id==='prologue'?'<button type="button" id="flowRecordMatch">番号を照合</button>':''}`;
    viewport.before(toolbar);
    const scene = document.createElement('div');
    scene.className = `flow-camera-scene scan-${id}`;
    scene.style.backgroundImage = `url('${publicImagePath(stage.art)}')`;
    viewport.querySelectorAll('.flow-hotspot').forEach(hotspot => scene.appendChild(hotspot));
    if (id === 'freighter') {
      const motion = document.createElement('div');
      motion.className = 'cargo-motion-readout';
      motion.setAttribute('aria-hidden','true');
      motion.innerHTML = '<span>GUIDE / TRANSPORT</span><i></i><small>POSITION / LOCKED</small>';
      scene.appendChild(motion);
      const storage = document.createElement('button');
      storage.type = 'button';
      storage.className = 'flow-storage-marker flow-hotspot';
      storage.setAttribute('aria-label','旧保管表示を調査');
      storage.textContent = 'STORAGE / 旧保管表示';
      storage.hidden = !state.cargoShifted;
      storage.onclick = inspectCargoStorage;
      scene.appendChild(storage);
    }
    viewport.classList.add('camera-enabled');
    viewport.appendChild(scene);
    if (id === 'freighter') {
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'cargo-motion-skip';
      skip.textContent = '移動演出を完了';
      skip.hidden = true;
      skip.onclick = () => cargoMotionFinish?.();
      viewport.appendChild(skip);
    }
    if (id === 'prologue') {
      toolbar.querySelector('#flowRecordMatch').onclick = showPrologueRecordEntry;
    }
    stageCamera = window.ExplorationEnhancements.mount({
      viewport,scene,
      resetButton:toolbar.querySelector('#flowZoomReset'),
      scanButton:toolbar.querySelector('#flowScanToggle'),
      onScan:() => {
        if (id === 'arcade') {
          stageDialogue('ナナ', state.seen.has('hero-event')
            ? '「……端末の反応は安定しているよ。ほかの場所も調べてみよう。」'
            : state.terminalPower
              ? '「……電源は届いてる。でも映像信号の経路に異常があるみたい。」'
              : '「……古い映像端末から微弱な反応がある。電源系統を確認してみよう。」');
        } else if (id === 'freighter') {
          stageDialogue('ナナ', state.cargoShifted
            ? state.cargoStorageRead ? '「……旧い保管記録の解析は完了しているよ。」' : '「……動いた積荷の奥に、まだ調べていない表示があるみたい。」'
            : state.seen.has('log') && state.seen.has('straps')
              ? '「……伝票と固定ベルトに、関係があるみたい。中央の制御盤を調べよう。」'
              : '「……中央の積荷に固定機構の反応があるよ。周囲に記録が残っているかも。」');
        } else {
          const already = state.observationUnlocked;
          const one = state.seen.has('jacket') || state.seen.has('papers');
          stageDialogue('スキャン', already
            ? '作業記録の照合結果を保存済み。ほかにも小さな痕跡が残っている可能性があります。'
            : one
              ? '類似した管理表示を別の場所でも検出しています。'
              : '未調査の反応を検出。回収品以外にも調査可能な対象があります。');
        }
      },
    });
  }

  function renderStage(id) {
    cargoMotionFinish?.(false);
    if (replayMode && id !== replayChapter) return showReplayEnd();
    if (!replayMode) reachedChapters.add(id);
    disposeStageCamera();
    activeStage = id;
    latestStage = id;
    sequence = null;
    chapterFour().hidden = true;
    window.gameBgm?.setScene(id,'explore');
    root().hidden = false;
    const stage = stages[id];
    const state = st(id);
    if (id === 'prologue') syncPrologueObservation(state); // 旧セーブの解放フラグを維持
    root().innerHTML = `<div class="flow-wrap"><header class="flow-head"><div><div class="flow-brand">ORBITAL SALVAGE</div><span class="flow-kicker">${stage.number} / ${stage.title}</span></div><div class="flow-controls"><button class="flow-subaction" id="flowHint">ヒント</button><button class="flow-subaction" id="flowJournal">調査記録</button>${stageJumpButton()}</div></header><div class="flow-body"><div><div class="flow-location"><span>LOCATION / ${stage.location}</span><span>${stage.number}</span></div><div class="flow-art${stage.art ? ' has-art' : ''}" ${stage.art ? `style="background-image:url('${publicImagePath(stage.art)}')"` : ''} aria-label="${stage.art ? `${stage.location}の探索画像` : '仮の探索画面'}"><div class="flow-objective-banner">OBJECTIVE UPDATED / ${id === 'prologue' ? '輸送船内部を調査する' : stage.objective}</div>${stage.hotspots.map(it => `<button class="flow-hotspot${toolMarkerVisible(id, state, it) ? ' tool-pickup' : ''}${id === 'prologue' && it.id === 'locker-key' && !state.tools.has('lockerKey') && !state.unlocked ? ' floating-key-target' : ''}" data-target="${it.id}" aria-label="${it.title}" style="left:${it.x}%;top:${it.y}%;${it.w ? `width:${it.w}%;height:${it.h}%;` : ''}">${id === 'prologue' && it.id === 'locker-key' && !state.tools.has('lockerKey') && !state.unlocked ? '<img class="flow-floating-key" src="./prologue-locker-key.webp" alt="">' : ''}<span>${it.title}</span><small>クリックして調査</small></button>`).join('')}</div><div class="flow-dialogue" id="flowDialogue"><div class="flow-face esteban" aria-label="エステバン"></div><div class="flow-dialogue-copy"><p>${id === 'prologue' ? '「……磁気ブーツ、固定よし。小物は勝手に漂ってやがるな」' : '「回収対象を確認しろ。仕事を始めるぞ」'}</p></div></div></div><aside class="flow-side"><section class="flow-pane"><h2>RECOVERY ORDER / 回収依頼</h2><p>${stage.objective}</p><p id="flowProgress"></p><button class="flow-action" id="flowReturn" disabled>帰還する</button></section><section class="flow-pane"><h2>CARGO / 回収袋</h2><div id="flowCargo">未回収</div><div id="flowTools"></div></section><section class="flow-pane"><h2>SCAN LOG / 調査状況</h2><p id="flowScan">調査した箇所：0</p><p style="font-size:10px;color:#91a8b0">${stage.art ? '画像内の物品を直接クリックして調査できます。' : '※この章の探索画像は制作待ちです。'}</p></section></aside></div></div><div class="flow-detail" id="flowDetail" hidden></div>`;
    if (id === 'prologue' || id === 'arcade' || id === 'freighter') mountExplorationCamera(id, stage, state);
    root().querySelectorAll('[data-target]').forEach(btn => btn.onclick = () => inspect(id, btn.dataset.target));
    document.getElementById('flowReturn').onclick = () => completeStage(id);
    document.getElementById('flowHint').onclick = () => showStageHint(id);
    document.getElementById('flowJournal').onclick = () => {
      const category = id==='prologue'?'IDENTIFICATION / 識別情報':id==='arcade'?'SYSTEM REPAIR / 機械診断と復旧':'ENVIRONMENT / 環境と安全制御';
      const journal = `<div class="flow-journal-category">${category}</div>調査済み：${journalSeenLabels(id,state).join('、') || 'なし'}<br>回収品：${[...state.found].map(key => (id==='prologue' ? prologueItemArt[key]?.name : null) || stage.hotspots.find(item => item.id === key)?.cargo || key).join('、') || 'なし'}${id==='prologue' ? `<br>補足記録「残された作業記録」：${state.observationUnlocked?'復元済み。作業服の識別表示と漂う勤務書類を照合すると、同じ保管区画に関係する記録が見つかった。持ち主の身元は未確定。':'未発見'}` : ''}${id==='arcade' ? `<br>映像端末：${state.seen.has('hero-event')?'復旧・再生済み':state.terminalReady?'修理完了・再生待ち':state.terminalSignalFixed?'信号接続を修復済み':state.terminalDiagnosed?'電源は正常・映像信号に異常':state.terminalPower?'電源セルを接続済み':'未起動'}` : ''}${id==='freighter' ? `<br>補足調査「貨物区画の安全制御」：${state.cargoShifted?'完了。固定された積荷の一部を安全にずらした。':`未完了（伝票：${state.seen.has('log')?'確認済み':'未確認'}／固定ベルト：${state.seen.has('straps')?'確認済み':'未確認'}）。任意調査。`}<br>旧保管表示：${state.cargoStorageRead?'解析済み。旧式の貨物管理では保管位置と固定状態を別々に記録していた。':state.cargoShifted?'調査可能（未解析）':'積荷の奥に隠れている'}${state.seen.has('letter-event')?'<div class="flow-journal-letter">手紙：依頼品外の封筒を発見。記録とは別に、ナナが気にかけている。</div>':''}` : ''}`;
      detail('調査記録', journal, [{ label: '探索に戻る', run: closeDetail }]);
    };
    updateStage(id);
    saveProgress('stage');
  }

  function updateStage(id) {
    const stage = stages[id], state = st(id);
    // 手紙の発見後は技術的な解析表示を控えめにし、既存の会話を中心にする。
    root()?.classList.toggle('letter-discovered', id === 'freighter' && state.seen.has('letter-event'));
    const done = stage.required.filter(key => state.found.has(key)).length;
    document.getElementById('flowProgress').textContent = `回収品 ${done} / ${stage.required.length}${id === 'arcade' ? ` ・ 映像端末 ${state.seen.has('hero-event') ? '調査済み' : '未調査'}` : ''}${id === 'freighter' ? ` ・ 手紙 ${state.seen.has('letter-event') ? '発見済み' : '未発見'}` : ''}`;
    if (id === 'prologue' || id === 'arcade') {
      const artwork = id === 'arcade' ? arcadeItemArt : prologueItemArt;
      document.getElementById('flowCargo').innerHTML = `<div class="flow-inventory">${stage.required.map(key => state.found.has(key) ? `<div class="flow-cargo-slot" title="${artwork[key].name}">${itemPicture(key, id)}<small>${artwork[key].name}</small></div>` : '<div class="flow-cargo-slot empty" aria-label="空きスロット">＋</div>').join('')}</div>`;
    } else if (id === 'freighter') {
      document.getElementById('flowCargo').innerHTML = `<div class="flow-inventory">${stage.required.map(key => state.found.has(key) ? `<div class="flow-cargo-slot">${itemPicture(key, id)}<small>${freighterItemArt[key].name}</small></div>` : '<div class="flow-cargo-slot empty" aria-label="空きスロット">＋</div>').join('')}</div>${state.seen.has('letter-event') ? '<p class="flow-story-cargo">重要品：未配達の手紙（依頼品外）</p>' : ''}`;
    } else document.getElementById('flowCargo').textContent = [...state.found].join('、') || '未回収';
    const discoveredStorage = id === 'freighter' && !!state.cargoShifted;
    const scannedCount = stage.hotspots.filter(h => state.seen.has(h.id)).length + (discoveredStorage && state.cargoStorageRead ? 1 : 0);
    document.getElementById('flowScan').textContent = `調査した箇所：${scannedCount} / ${stage.hotspots.length + (discoveredStorage ? 1 : 0)}`;
    if (id === 'freighter') {
      const scene = root().querySelector('.flow-camera-scene');
      scene?.classList.toggle('cargo-shifted', !!state.cargoShifted);
      const marker = scene?.querySelector('.flow-storage-marker');
      if (marker) {
        marker.hidden = !state.cargoShifted;
        marker.classList.toggle('is-seen', !!state.cargoStorageRead);
      }
    }
    document.getElementById('flowReturn').disabled = done < stage.required.length || (id === 'arcade' && !state.seen.has('hero-event')) || (id === 'freighter' && !state.seen.has('letter-story'));
    root().querySelectorAll('[data-target]').forEach(btn => {
      const seen = state.seen.has(btn.dataset.target);
      btn.classList.toggle('is-seen', seen);
      btn.classList.toggle('is-collected', state.found.has(btn.dataset.target));
      if (!stage.art && seen) btn.style.borderColor = '#e1c29e';
    });
    if (id === 'prologue') root().querySelector('.flow-camera-scene')?.classList.toggle('record-solved',!!state.observationUnlocked);
    updatePuzzleInventory(id);
    if (isStageReady(id) && !missionNoticeShown.has(id)) {
      missionNoticeShown.add(id);
      showMissionNotice();
    }
    saveProgress('stage');
  }

  function isStageReady(id) {
    const state = st(id);
    return stages[id].required.every(key => state.found.has(key))
      && (id !== 'arcade' || state.seen.has('hero-event'))
      && (id !== 'freighter' || state.seen.has('letter-story'));
  }

  function getStageHint(id) {
    const state = st(id);
    if (isStageReady(id)) return '回収と必要な調査はすべて完了した。右の「帰還する」から次へ進もう。';
    if (id === 'prologue') {
      if (!state.found.has('shoe') && !state.unlocked && !state.tools.has('lockerKey')) return 'ロッカーは施錠されている。近くの宙を漂う鍵を探そう。';
      if (!state.found.has('shoe') && !state.unlocked) return '古い鍵を手に入れた。ロッカーを調べて使ってみよう。';
      if (!state.found.has('shoe')) return '開いたロッカーの奥に残されたものを調べよう。';
      return '机の上のオレンジ色のノートを調べて、回収しよう。';
    }
    if (id === 'arcade') {
      if (!state.seen.has('hero-event') && !state.terminalPower && !state.tools.has('powerCell')) return '映像端末は動かない。空中に浮かぶ予備電源セルを探そう。';
      if (!state.seen.has('hero-event') && !state.terminalPower) return '道具欄で予備電源セルを選び、壁の古い映像端末を調べよう。';
      if (!state.seen.has('hero-event') && state.terminalReady) return '端末の復旧が完了した。映像端末から古い映像を再生しよう。';
      if (!state.seen.has('hero-event') && !state.terminalDiagnosed) return '電源が戻った端末を調べ、診断情報から原因を確かめよう。';
      if (!state.seen.has('hero-event') && !state.terminalStandby && !state.terminalSignalFixed) return '通電中は接続部を修理できない。端末を待機状態に切り替えよう。';
      if (!state.seen.has('hero-event') && !state.terminalSignalFixed) return '待機状態で異常のある映像信号の接続を復旧しよう。';
      if (!state.seen.has('hero-event')) return '信号が回復した。通電テストで画面を起動しよう。';
      const missing = stages.arcade.hotspots.filter(h => h.collect && !state.found.has(h.id)).map(h => h.cargo);
      return `映像は見つかった。残る回収品は「${missing.join('・')}」だ。`;
    }
    const missing = stages.freighter.hotspots.filter(h => h.collect && !state.found.has(h.id)).map(h => h.cargo);
    if (!state.seen.has('letter-story')) {
      if (!state.tools.has('brokenCard') && !state.tools.has('repairedCard')) return '貨物室に漂う古い認証カードを探そう。';
      if (!state.tools.has('circuitPart') && !state.tools.has('repairedCard')) return '認証カードが壊れている。別の場所で修理用回路部品を探そう。';
      if (state.tools.has('brokenCard') && state.tools.has('circuitPart')) return '道具欄の「組み合わせる」でカードを修復しよう。';
      if (!state.unlocked) return '修復したカードを道具欄で選び、貨物ケースを調べよう。';
      if (!state.seen.has('letter-event')) return '開いた貨物ケースに古い封筒が残されている。';
      if (missing.length) return `手紙は発見した。依頼品「${missing.join('・')}」の回収を続けよう。`;
      return '依頼品は揃った。ナナと手紙について確認しよう。';
    }
    return `残る回収品は「${missing.join('・')}」。貨物区画を探そう。`;
  }

  function showStageHint(id) {
    const state = st(id);
    const signature = [id,[...state.found].sort().join(','),[...state.tools].sort().join(','),!!state.unlocked,!!state.terminalPower,!!state.terminalDiagnosed,!!state.terminalStandby,!!state.terminalSignalFixed,!!state.terminalReady,!!state.seen.has('hero-event'),!!state.seen.has('letter-event'),!!state.seen.has('letter-story')].join('|');
    if (state.stageHintSignature !== signature) {state.stageHintSignature=signature;state.stageHintLevel=0;}
    state.stageHintLevel=Math.min(3,(state.stageHintLevel||0)+1);
    const level=state.stageHintLevel;
    const early = {
      prologue:['回収品の周囲にも、調べられるものが残っている。','ロッカーや机の近くを観察して、手がかりを確かめよう。'],
      arcade:['端末がどんな状態なのか、周囲の装置も含めて確認しよう。','端末の表示と道具欄を照らし合わせ、どの系統を操作すべきか考えよう。'],
      freighter:['貨物の状態と、残された記録の両方を確認しよう。','保管物や認証装置の状態を調べ、何が足りないか比べてみよう。'],
    };
    const message=isStageReady(id)?getStageHint(id):level<3?early[id][level-1]:getStageHint(id);
    updateStage(id);
    detail(`探索ヒント ${level}/3`,message,[
      ...(id==='prologue'?[{label:'作業服・書類の照合ヒント',run:showPrologueObservationHint}]:[]),
      ...(level<3&&!isStageReady(id)?[{label:'次の段階を見る',run:()=>showStageHint(id)}]:[]),
      {label:'探索に戻る',run:closeDetail},
    ]);
  }

  function showMissionNotice() {
    const wrap = root().querySelector('.flow-wrap');
    if (!wrap) return;
    if (missionNoticeTimer) clearTimeout(missionNoticeTimer);
    wrap.querySelector('.flow-mission-notice')?.remove();
    const notice = document.createElement('div');
    notice.className = 'flow-mission-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML = '<strong>RECOVERY COMPLETE</strong><span>回収確認完了 — 帰還できます</span>';
    wrap.append(notice);
    document.getElementById('flowProgress')?.classList.add('recovery-flash');
    try {
      const AudioType = window.AudioContext || window.webkitAudioContext;
      if (AudioType) {
        signalAudio ||= new AudioType();
        signalAudio.resume();
        const now = signalAudio.currentTime;
        [523, 784].forEach((frequency, index) => {
          const osc = signalAudio.createOscillator(), gain = signalAudio.createGain();
          const start = now + index * .13;
          osc.type = 'sine'; osc.frequency.value = frequency;
          gain.gain.setValueAtTime(.0001, start);
          gain.gain.exponentialRampToValueAtTime(effectVolume(.05), start + .015);
          gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
          osc.connect(gain); gain.connect(signalAudio.destination);
          osc.start(start); osc.stop(start + .18);
        });
      }
    } catch (_) { /* 無音環境でも進行する */ }
    missionNoticeTimer = setTimeout(() => { notice.remove(); document.getElementById('flowProgress')?.classList.remove('recovery-flash'); }, 1700);
  }

  function updatePuzzleInventory(id) {
    const el = document.getElementById('flowTools');
    if (!el) return;
    const state = st(id), definitions = puzzleTools[id];
    if (!definitions) { el.innerHTML = ''; return; }
    const owned = [...state.tools].filter(key => definitions[key]);
    const help = id === 'arcade'
      ? state.seen.has('hero-event') ? '映像端末は起動済み。探索を続けよう。' : state.terminalPower ? '映像端末に電源が届いた。右上の端末を調べ、診断と修理を進めよう。' : state.tools.has('powerCell') ? '① 下の「予備の電源セル」をタップして選択 → ② 探索画像の右上にある映像端末をタップ。' : '探索画像に浮かぶ予備の電源セルを見つけて回収しよう。'
      : id === 'freighter' ? state.unlocked ? '貨物ケースの認証が完了しました。' : state.tools.has('repairedCard') ? '修復した認証カードをタップして選択 → 右側の貨物ケースをタップ。' : '破損した認証カードと修理用回路部品を回収すると、ここに「組み合わせる」ボタンが出る。'
      : '見つけた道具はここに入る。ロッカーの鍵は持っているだけで使える。';
    const canCombine = id === 'freighter' && state.tools.has('brokenCard') && state.tools.has('circuitPart');
    el.innerHTML = `<div class="flow-tools-heading">TOOLS / 道具・重要品</div><p class="flow-tool-help">${help}</p><div class="flow-tools-list">${owned.length ? owned.map(key => {
      const tool = definitions[key];
      return `<button class="flow-tool${state.selectedTool === key ? ' selected' : ''}" type="button" data-tool="${key}" aria-pressed="${state.selectedTool === key}" title="${tool.name}">${tool.src ? `<img src="${tool.src}" alt="">` : `<span aria-hidden="true">${tool.symbol}</span>`}<small>${tool.name}</small><em>${state.selectedTool === key ? '選択中 ✓' : 'タップして選択'}</em></button>`;
    }).join('') : '<span class="flow-tool-empty">まだ道具はありません</span>'}</div>${canCombine ? '<button class="flow-combine" id="flowCombine" type="button">認証カード ＋ 回路部品を組み合わせる</button>' : ''}${state.selectedTool ? `<p class="flow-selection-status">選択中：${definitions[state.selectedTool].name}</p>` : ''}`;
    el.querySelectorAll('[data-tool]').forEach(btn => btn.onclick = () => selectPuzzleTool(id, btn.dataset.tool));
    if (canCombine) document.getElementById('flowCombine').onclick = () => combineFreighterTools();
    saveProgress('stage');
  }

  function combineFreighterTools() {
    const state = st('freighter');
    if (!state.tools.has('brokenCard') || !state.tools.has('circuitPart')) return;
    state.tools.delete('brokenCard');
    state.tools.delete('circuitPart');
    state.tools.add('repairedCard');
    state.selectedTool = null;
    stageDialogue('エステバン', '「……よし。回路をつなぎ直した。これで認証くらいは通るだろ。カードを選んでケースに使え。」');
    updatePuzzleInventory('freighter');
  }

  function selectPuzzleTool(id, key) {
    const state = st(id);
    if (!state.tools.has(key)) return;
    if (state.selectedTool === key) {
      state.selectedTool = null;
      stageDialogue('調査', '道具の選択を解除した。');
    } else if (id === 'freighter' && ((state.selectedTool === 'brokenCard' && key === 'circuitPart') || (state.selectedTool === 'circuitPart' && key === 'brokenCard'))) {
      return combineFreighterTools();
    } else {
      state.selectedTool = key;
      stageDialogue('調査', `「${puzzleTools[id][key].name}」を選択中。対象をクリックして使用する。`);
    }
    updatePuzzleInventory(id);
  }

  function pickupPuzzleTool(id, key) {
    const state = st(id);
    if (state.tools.has(key) || (id === 'arcade' && state.terminalPower) || (id === 'freighter' && state.tools.has('repairedCard'))) {
      stageDialogue('調査', 'この道具はすでに回収した。');
      return;
    }
    state.tools.add(key);
    window.gameSfx?.play('collect');
    renderStage(id);
    stageDialogue('エステバン', id === 'prologue' ? '「……ロッカーの鍵か。どこからか漂ってきたんだな。試してみるか。」' : id === 'arcade' ? '「……予備の電源セルか。映像端末に使えるかもしれねえな。」' : key === 'brokenCard' ? '「……古い認証カードか。端子が傷んでやがる。」' : '「……小さな回路部品だ。認証カードの補修に使えるかもしれねえ。」');
  }

  function detail(title, body, actions, image) {
    const el = document.getElementById('flowDetail');
    el.hidden = false;
    const explicitPrimary = actions.some(action => action.primary);
    el.innerHTML = `<div class="flow-detail-inner${image ? ' with-scene' : ''}"><h2>${title}</h2>${image ? `<img class="flow-detail-scene" src="${publicImagePath(image)}" alt="${title}の拡大探索画面">` : ''}<p>${body}</p><div class="flow-detail-actions">${actions.map((x, i) => `<button class="${explicitPrimary ? (x.primary ? 'flow-action' : 'flow-subaction') : (i === actions.length - 1 ? 'flow-action' : 'flow-subaction')}" data-detail="${i}">${x.label}</button>`).join('')}</div></div>`;
    el.querySelectorAll('[data-detail]').forEach(btn => btn.onclick = () => actions[Number(btn.dataset.detail)].run());
  }
  function closeDetail() { const el = document.getElementById('flowDetail'); if (el) el.hidden = true; }
  function collect(stageId, key, name) {
    window.gameSfx?.play('collect');
    st(stageId).found.add(key);
    st(stageId).seen.add(key);
    closeDetail();
    stageDialogue('エステバン', `「${name}、確保した」`);
    updateStage(stageId);
    if (stageId === 'freighter') {
      if (st('freighter').letterPending && stages.freighter.required.every(item => st('freighter').found.has(item))) {
        st('freighter').letterPending = false;
        chapterSixItemTalk(key, chapterSixLetterFound);
      } else chapterSixItemTalk(key);
    }
  }

  function inspectPrologueItem(key, back) {
    const entry = prologueItemArt[key];
    const recovered = st('prologue').found.has(key);
    const context = key === 'shoe'
      ? '幼い子供が履いていた小さな靴だ。ここまで持ち主を待っていたのかもしれない。'
      : '机に残されたノート。表紙には子供が描いたような家の絵がある。';
    detail(entry.name, `${itemPicture(key)}<span class="flow-item-description">${recovered ? 'すでに回収袋へ収めた。' : context}</span>`, [
      { label: '戻る', run: back },
      ...(recovered ? [] : [{ label: '丁寧に回収する', run: () => collect('prologue', key, entry.name) }]),
    ]);
    document.getElementById('flowDetail').querySelector('.flow-detail-inner').classList.add('with-item');
  }

  function showArcadeRepair(message='') {
    const state = st('arcade');
    if (state.seen.has('hero-event')) return;
    const ready = !!state.terminalReady;
    const powered = !state.terminalStandby;
    const signal = state.terminalSignalFixed ? '正常 / LINK OK' : state.terminalDiagnosed ? '異常 / OPEN' : '未診断 / UNKNOWN';
    const actions = ready
      ? [{label:'古い映像を再生する',primary:true,run:startArcadeVideo},{label:'探索に戻る',run:closeDetail}]
      : [
        ...(!state.terminalDiagnosed ? [{label:'機械の状態を診断する',primary:true,run:()=>operateArcadeRepair('diagnose')}] : []),
        ...(state.terminalDiagnosed && !state.terminalSignalFixed ? [
          {label:powered?'待機状態に切り替える':'電源を戻す',run:()=>operateArcadeRepair('standby')},
          {label:'信号接続部を修理する',primary:true,run:()=>operateArcadeRepair('repair')},
        ] : []),
        ...(state.terminalSignalFixed ? [{label:'通電テストを行う',primary:true,run:()=>operateArcadeRepair('test')}] : []),
        {label:`診断ヒント（${Math.min(3,(state.terminalHintLevel||0)+1)}/3）`,run:showArcadeRepairHint},
        {label:'探索に戻る',run:closeDetail},
      ];
    const body = `<span class="arcade-service ${ready?'is-ready':powered?'is-powered':'is-standby'} ${state.terminalDiagnosed?'is-diagnosed':''} ${state.terminalSignalFixed?'is-linked':''} ${message.startsWith('電源供給と表示回路は正常')?'just-diagnosed':''}" role="group" aria-label="映像端末の診断情報">
      <span class="arcade-service-display"><span class="arcade-noise" aria-hidden="true"></span><span class="arcade-service-lamp" aria-hidden="true"></span><strong>${ready?'VIDEO SYSTEM / ONLINE':'VIDEO SYSTEM / DIAGNOSTIC'}</strong><span>${ready?'起動完了：信号復旧':powered?'電源投入中 / LIVE':'待機モード / SAFE'}</span></span>
      <span class="arcade-circuit" aria-hidden="true"><span class="arcade-node power-node">PWR<i></i></span><span class="arcade-circuit-link"></span><span class="arcade-node signal-node">SIG<i></i></span><span class="arcade-circuit-link"></span><span class="arcade-node display-node">DISP<i></i></span></span>
      <span class="arcade-service-rows"><span><strong>POWER / 電源供給</strong><em>${powered?'正常 / ON':'待機 / OFF'}</em></span><span><strong>SIGNAL / 映像信号</strong><em class="${state.terminalSignalFixed?'healthy':'warning'}">${signal}</em></span><span><strong>DISPLAY / 表示回路</strong><em>${state.terminalDiagnosed||ready?'正常 / OK':'未診断'}</em></span></span>
      <span class="arcade-service-note">${message|| (ready?'ノイズが消え、画面が安定している。':state.terminalSignalFixed?'信号経路が復旧した。通電テストで確認しよう。':state.terminalDiagnosed?'信号接続部に異常がある。通電状態を確認して、安全に修理しよう。':'電源セルの接続後も映像は映らない。どの系統に異常があるか診断できそうだ。')}</span>
    </span>`;
    detail('古い映像端末 / 故障診断', body, actions);
    document.getElementById('flowDetail')?.querySelector('.flow-detail-inner')?.classList.add('with-arcade-service');
  }
  function showArcadeRepairHint() {
    const state = st('arcade');
    state.terminalHintLevel = Math.min(3,(state.terminalHintLevel||0)+1);
    const hints = [
      '端末には複数の系統がある。まず診断表示で、どの部分が正常なのか確かめよう。',
      '電源と表示回路が正常なら、異常があるのは映像信号だ。接続部を触る前に電源状態を確認しよう。',
      '修理中は待機状態にする。信号接続部を直したら、通電テストで映像が安定するか確認しよう。',
    ];
    updateStage('arcade');
    showArcadeRepair(hints[state.terminalHintLevel-1]);
  }
  function operateArcadeRepair(action) {
    const state = st('arcade');
    if (!state.terminalPower || state.seen.has('hero-event')) return;
    let message = '';
    if (action === 'diagnose') {
      window.gameSfx?.play('diagnose');
      state.terminalDiagnosed = true;
      message = '電源供給と表示回路は正常。映像信号だけが途切れている。';
      stageDialogue('ナナ','「……電源は届いてる。でも映像の信号が途中で切れてるみたい。」');
    } else if (action === 'standby' && state.terminalDiagnosed && !state.terminalSignalFixed) {
      window.gameSfx?.play('standby');
      state.terminalStandby = !state.terminalStandby;
      message = state.terminalStandby ? '待機状態へ移行。接続部を安全に操作できる。' : '電源を再投入。信号接続部はまだ復旧していない。';
    } else if (action === 'repair') {
      if (!state.terminalDiagnosed) message = '原因の診断が必要だ。';
      else if (!state.terminalStandby) { message = '安全保護が作動。通電中の接続部には触れられない。診断画面で電源状態を確認しよう。'; window.gameSfx?.play('error'); }
      else {
        window.gameSfx?.play('repair');
        state.terminalSignalFixed = true;
        message = 'SIGNAL LINK RESTORED / 接続部の復旧を確認。';
        stageDialogue('エステバン','「……よし、信号の経路はつながった。あとは起動するかどうかだ。」');
      }
    } else if (action === 'test') {
      if (!state.terminalSignalFixed) message = 'まだ信号に異常がある。';
      else {
        window.gameSfx?.play('startup');
        state.terminalStandby = false;
        state.terminalReady = true;
        message = 'BOOT SEQUENCE COMPLETE / 映像信号が安定した。';
      }
    }
    updateStage('arcade');
    showArcadeRepair(message);
  }
  function startArcadeVideo() {
    const state = st('arcade');
    if (!state.terminalReady || state.seen.has('hero-event')) return;
    state.seen.add('hero-event');
    closeDetail();
    updateStage('arcade');
    chapterFiveRepairLeadIn();
  }
  function chapterFiveRepairLeadIn() {
    play([
      { speaker: 'エステバン', text: '「……よし、信号もつながった。今度こそ映像が出るはずだ。再生してみるぞ。」' },
      { speaker: 'ナナ', text: '「……あっ！ エステバン、画面が光った！」' },
    ], () => setTimeout(chapterFiveHero, 500), { label: 'CHAPTER 05 / REPAIR', title: '映像端末の復旧', fadeOut: true });
  }

  // 第6章の任意調査。元の回収品・手紙・認証カードの進行条件には関与しない。
  function inspectCargoStorage() {
    const state = st('freighter');
    if (!state.cargoShifted || root()?.querySelector('.cargo-animating')) return;
    const first = !state.cargoStorageRead;
    if(first)window.gameSfx?.play('storage');
    state.cargoStorageRead = true;
    state.seen.add('cargo-storage');
    updateStage('freighter');
    if (first) stageDialogue('スキャン','旧い貨物管理表示を解析。保管位置と固定状態の記録が分かれていることを確認しました。');
    detail('旧保管表示',`<div class="cargo-storage-detail"><strong>STORAGE / ARCHIVE</strong><span>旧式の貨物管理表示</span><p>この輸送船では、積荷の保管位置と固定機構の状態を別々の欄で管理していたらしい。移動後も照合できるよう、保管表示の記録が残されている。</p><small>${first?'新しい補足調査記録を保存しました。':'この表示は解析済みです。'}</small></div>`,[{label:'探索に戻る',run:closeDetail}]);
  }
  function showCargoSafety(message = '') {
    const state = st('freighter');
    const support = !!state.cargoSupport;
    const released = !!state.cargoLatch;
    const moved = !!state.cargoShifted;
    const clues = state.seen.has('log') && state.seen.has('straps');
    const warning = /安全装置|張力|インターロック/.test(message);
    const body = `<div class="cargo-safety ${moved?'cargo-complete':''} ${warning?'cargo-warning':''} ${support?'cargo-supported':''} ${released?'cargo-released':''}" role="group" aria-label="貨物固定装置の状態">
      <div class="cargo-safety-screen"><strong>${moved?'CARGO SHIFT / COMPLETE':'CARGO RESTRAINT / CONTROL'}</strong><span>${moved?'奥の保管表示を確認できた':'移動距離制限：短距離／安全保護：有効'}</span></div>
      <div class="cargo-safety-state"><span class="cargo-state-support">補助支持 A <b>${support?'荷重保持 / HOLD':'待機 / FREE'}</b></span><span class="cargo-state-latch">主固定 B <b>${released?'解除 / RELEASE':'固定 / LOCK'}</b></span><span class="cargo-state-guide">搬送ガイド <b>${moved?'位置変更完了':'停止 / PARK'}</b></span></div>
      <p role="status">${message || (moved?'中央のケースがわずかにスライドし、奥の保管表示が見えた。探索画面に戻って表示を調べられる。':clues?'伝票とベルトの調査記録が揃った。荷重を受け持つ機構と、解除すべき機構を見極めよう。':'安全制御盤は動作可能。操作前に、貨物伝票と実際の固定状態を調べるとよさそうだ。')}</p>
    </div>`;
    const actions = [{label:'探索に戻る',run:closeDetail}];
    if (!moved) {
      actions.push({label:support?'補助支持 A を待機に戻す':'補助支持 A を固定する',run:()=>operateCargoSafety('support')});
      actions.push({label:released?'主固定 B をかけ直す':'主固定 B を解除する',run:()=>operateCargoSafety('latch')});
      actions.push({label:'搬送ガイドを短距離スライド',primary:true,run:()=>operateCargoSafety('slide')});
      actions.push({label:`段階ヒントを見る（${Math.min(3,(state.cargoHintLevel||0)+1)}/3）`,run:showCargoSafetyHint});
    }
    detail('貨物区画の安全制御',body,actions);
    document.getElementById('flowDetail')?.querySelector('.flow-detail-inner')?.classList.add('with-cargo-safety');
  }
  function showCargoSafetyHint() {
    const state = st('freighter');
    state.cargoHintLevel = Math.min(3,(state.cargoHintLevel||0)+1);
    const hints = [
      '中央の積荷には二種類の固定機構がある。伝票とベルトの状態をそれぞれ調べよう。',
      '貨物伝票に記録された「補助支持 A」と「主固定 B」の役割を比べよう。荷重をどちらが受けているかが重要だ。',
      '先に補助支持 A に荷重を預け、それから主固定 B を解除する。最後に搬送ガイドを操作する。',
    ];
    updateStage('freighter');
    showCargoSafety(hints[state.cargoHintLevel-1]);
  }
  function cargoShiftSound(kind = 'slide') {
    try {
      const AudioType = window.AudioContext || window.webkitAudioContext;
      if (!AudioType) return;
      signalAudio ||= new AudioType();
      signalAudio.resume();
      const start = signalAudio.currentTime + .02;
      const tone = signalAudio.createOscillator();
      const gain = signalAudio.createGain();
      tone.type = kind === 'warning' ? 'square' : 'triangle';
      const pitches = {slide:[75,112],support:[310,390],latch:[360,260],warning:[210,145]};
      const [initial,final] = pitches[kind] || pitches.slide;
      const duration = kind === 'slide' ? .78 : .17;
      tone.frequency.setValueAtTime(initial,start);
      tone.frequency.linearRampToValueAtTime(final,start+duration*.78);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(effectVolume(kind==='warning'?.012:.024),start+.05);
      gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      tone.connect(gain);gain.connect(signalAudio.destination);
      tone.start(start);tone.stop(start+duration);
    } catch (_) { /* 無音環境でも探索は進行する */ }
  }
  function operateCargoSafety(action) {
    const state = st('freighter');
    if (state.cargoShifted) return showCargoSafety();
    let message = '';
    if (action === 'support') {
      if (state.cargoLatch) message = '主固定 B が解除中。補助支持 A の解除は安全装置により阻止された。';
      else { state.cargoSupport = !state.cargoSupport; message = state.cargoSupport?'補助支持 A が荷重を受け持った。':'補助支持 A を待機状態に戻した。'; }
    } else if (action === 'latch') {
      if (!state.cargoSupport && !state.cargoLatch) message = '固定ベルトに張力がかかっている。荷重の受け先がないため、解除を保留した。';
      else { state.cargoLatch = !state.cargoLatch; message = state.cargoLatch?'主固定 B を解除。積荷は補助支持 A に保持されている。':'主固定 B を再固定した。'; }
    } else if (action === 'slide') {
      if (!state.cargoSupport || !state.cargoLatch) message = '安全インターロック：荷重保持と主固定の状態が一致していない。搬送を中断した。';
      else {
        state.cargoShifted = true;
        state.seen.add('cargo-safety-complete');
        message = 'GUIDE SHIFT COMPLETE / 中央の積荷がわずかに移動した。奥に現れた旧保管表示を調べられる。';
        stageDialogue('ナナ','「……動いた！ ほんの少しだけど、隠れていた保管表示が見えるよ。」');
        updateStage('freighter'); // 成功状態を演出より先に保存し、再読み込みでも失わない。
        closeDetail();
        const scene = root().querySelector('.flow-camera-scene');
        const reduced = settings.reduceMotion || settings.shortEffects || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        window.gameSfx?.play('cargoMove');
        if (scene && !reduced) {
          const viewport = scene.parentElement;
          const skip = viewport?.querySelector('.cargo-motion-skip');
          const position = scene.querySelector?.('.cargo-motion-readout small');
          if (position) position.textContent = 'POSITION / MOVING';
          let completed = false;
          let timer;
          cargoMotionFinish = () => {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            scene.classList.remove('cargo-animating');
            if (position) position.textContent = 'POSITION / LOCKED';
            if (skip) skip.hidden = true;
            cargoMotionFinish = null;
          };
          scene.classList.add('cargo-animating');
          if (skip) skip.hidden = false;
          timer = setTimeout(() => cargoMotionFinish?.(), 1650);
        } // 成功後は探索画面を見せ続け、制御盤を自動で再表示しない。
        return;
      }
    }
    cargoShiftSound(/安全装置|張力|インターロック/.test(message)?'warning':action==='support'?'support':action==='latch'?'latch':'warning');
    updateStage('freighter');
    showCargoSafety(message);
  }

  function inspect(id, key) {
    const stage = stages[id], state = st(id), item = stage.hotspots.find(x => x.id === key);
    const firstDiscovery = !state.seen.has(key);
    window.gameSfx?.play(key==='straps'?'metal':key==='papers'?'paper':key==='jacket'?'scanDone':key==='hero'&&!state.terminalPower?'bootFail':'touch');
    state.seen.add(key);
    updateStage(id);
    if (firstDiscovery && ({prologue:['jacket','papers'],arcade:['hero'],freighter:['log','straps']}[id]||[]).includes(key)) {
      const target = root().querySelector(`[data-target="${key}"]`);
      target?.classList.add('trace-discovery');
      const notice = document.createElement('div');
      notice.className = 'flow-trace-notice';
      notice.setAttribute('role','status');
      notice.textContent = 'TRACE DETECTED / 調査情報を記録';
      root().appendChild(notice);
      window.setTimeout(() => target?.classList.remove('trace-discovery'), settings.reduceMotion || settings.shortEffects ? 120 : 850);
      window.setTimeout(() => notice.remove(), settings.reduceMotion || settings.shortEffects ? 260 : 1050);
    }
    if (id === 'freighter' && key === 'safety-panel') return showCargoSafety();
    if (id === 'freighter' && (key === 'log' || key === 'straps')) {
      const clue = key === 'log'
        ? '貨物伝票の安全欄：中央の積荷は「補助支持 A」で荷重を受け、「主固定 B」で移動を止める。安全に位置を変えるには、荷重の受け先を確保する必要がある。'
        : '固定状態の解析：主固定 B のベルトには張力が残っている。一方、補助支持 A は待機中。二つの機構では荷重のかかり方が違う。';
      stageDialogue('ナナ',key==='log'?'「……固定する仕組みが二つあるんだね。役割が違うみたい。」':'「……このベルト、まだ張ってる。二つの固定機構の状態が違うみたい。」');
      return detail(item.title,`${item.text}<br><br><strong>追加調査：${clue}</strong>`,[{label:'探索に戻る',run:closeDetail}]);
    }
    if (item.tool) {
      const tool = puzzleTools[id][item.tool];
      const acquired = state.tools.has(item.tool) || (id === 'freighter' && state.tools.has('repairedCard')) || (id === 'arcade' && (state.terminalPower || state.seen.has('hero-event'))) || (id === 'prologue' && state.unlocked);
      const description = id === 'prologue' ? '無重力の船内を漂っていた金属製の古い鍵。左側の個人ロッカーに合いそうだ。' : id === 'arcade' ? '古い娯楽施設の予備電源セル。映像端末を復旧できそうだ。' : item.tool === 'brokenCard' ? '認証用の回路が破損している。修理部品があれば復旧できるかもしれない。' : '小型の交換用回路モジュール。古い認証カードを修理できそうだ。';
      return detail(tool.name, `<img class="flow-tool-preview" src="${tool.src}" alt="${tool.name}"><span class="flow-item-description">${acquired ? 'すでに入手した。' : description}</span>`, [
        { label: '戻る', run: closeDetail },
        ...(!acquired ? [{ label: '道具として回収する', run: () => pickupPuzzleTool(id, item.tool) }] : []),
      ]);
    }
    if (state.selectedTool && !((id === 'prologue' && key === 'locker') || (id === 'arcade' && key === 'hero' && state.selectedTool === 'powerCell') || (id === 'freighter' && key === 'case' && state.selectedTool === 'repairedCard'))) {
      stageDialogue('エステバン', '「……そいつに使っても仕方ねえだろ。別の場所を探せ。」');
      return;
    }
    if (id === 'prologue' && key === 'locker') {
      if (state.tools.has('lockerKey') && !state.unlocked) {
        return detail('個人ロッカー', '古い鍵が鍵穴に合いそうだ。鍵を使って開けますか？', [
          { label: '鍵を使う', primary: true, run: () => {
            window.gameSfx?.play('unlock');
            state.unlocked = true;
            state.selectedTool = null;
            state.tools.delete('lockerKey');
            state.seen.add('locker-unlocked');
            updatePuzzleInventory(id);
            stageDialogue('エステバン', '「……カチッ。よし、開いた。中を調べるぞ。」');
            lockerDetail();
          } },
          { label: '使わない', run: lockerDetail },
        ], './prologue-locker-closed.webp');
      }
      return lockerDetail();
    }
    if (id === 'prologue' && key === 'notebook') return inspectPrologueItem('notebook', closeDetail);
    if (id === 'freighter' && key === 'case') {
      if (state.selectedTool === 'repairedCard') {
        window.gameSfx?.play('unlock');
        state.unlocked = true;
        state.selectedTool = null;
        updatePuzzleInventory(id);
        stageDialogue('エステバン', '「……認証が通った。これでケースを開けられるぞ。」');
      }
      return letterDetail();
    }
    if (id === 'arcade' && key === 'arcade-machine') return chapterFiveArcadeTalk();
    if (item.event === 'hero') {
      if (!state.seen.has('hero-event') && state.selectedTool === 'powerCell') {
        state.selectedTool = null;
        state.tools.delete('powerCell');
        state.terminalPower = true;
        window.gameSfx?.play('power');
        state.terminalStandby = false;
        state.terminalDiagnosed = false;
        state.terminalSignalFixed = false;
        state.terminalReady = false;
        updateStage('arcade');
        return showArcadeRepair('予備電源セルを取り付けた。電源表示は点灯したが、画面はまだノイズだけだ。');
      }
      if (!state.seen.has('hero-event') && state.terminalPower) return showArcadeRepair();
      return detail('古い映像端末', state.seen.has('hero-event') ? 'ヒーローアニメを再生した端末。ナナはまだその物語を忘れられない。' : '電源が入らない。予備の電源セルを探して、道具欄で選択してからこの端末をクリックしよう。', [{ label: '戻る', run: closeDetail }]);
    }
    if (item.collect) {
      const alreadyCollected = state.found.has(item.id);
      detail(item.title, `${id === 'arcade' || id === 'freighter' ? itemPicture(item.id, id) : ''}<span class="flow-item-description">${alreadyCollected ? 'すでに回収袋へ収めた。' : item.text || `${item.cargo}を回収できそうだ。`}</span>`, [
        { label: '戻る', run: closeDetail },
        ...(!alreadyCollected ? [{ label: '回収する', run: () => collect(id, item.id, item.cargo) }] : []),
      ]);
      if (id === 'arcade' || id === 'freighter') document.getElementById('flowDetail').querySelector('.flow-detail-inner').classList.add('with-item');
      return;
    }
    stageDialogue(item.speaker || '調査', item.text || 'ここにはかつて誰かが暮らしていた痕跡がある。');
    if (id === 'prologue' && (key === 'jacket' || key === 'papers') && !state.observationUnlocked) {
      const scanNote = key === 'jacket'
        ? 'スキャン復元：識別タグの一部「整備区画 / 末尾 27」。ほかの文字は読み取れない。'
        : 'スキャン復元：勤務書類の管理記録は「R-14」「R-27」「R-42」の3件。どれが作業服の記録かは未確認。';
      detail(item.title, `${item.text}<br><br>${scanNote}`, [
        {label:'探索を続ける',run:closeDetail},
        ...(state.seen.has('jacket') && state.seen.has('papers') ? [{label:'管理記録を照合する',primary:true,run:showPrologueRecordChoices}] : [{label:key==='jacket'?'書類の管理番号も調べる':'作業服の識別タグも調べる',run:()=>inspect('prologue',key==='jacket'?'papers':'jacket')}]),
      ]);
    }
  }
  function showPrologueRecordEntry() {
    const progress = st('prologue');
    if (progress.observationUnlocked) return detail('残された作業記録','照合は完了しています。結果は調査記録から確認できます。',[{label:'探索に戻る',run:closeDetail}]);
    if (progress.seen.has('jacket') && progress.seen.has('papers')) return showPrologueRecordChoices();
    return detail('番号照合の手がかり','これは回収とは別の、任意の補足調査です。黄色い作業服の識別タグと、漂う書類の管理番号を比べます。番号は下の対象を調べると表示されます。',[
      {label:'作業服の識別タグを調べる',run:()=>inspect('prologue','jacket')},
      {label:'書類の管理番号を調べる',run:()=>inspect('prologue','papers')},
      {label:'探索に戻る',run:closeDetail},
    ]);
  }
  function showPrologueRecordChoices(message = '') {
    const state = st('prologue');
    if (state.observationUnlocked || !state.seen.has('jacket') || !state.seen.has('papers')) return;
    state.observationChoiceOpen = true;
    saveProgress('stage');
    detail('残された作業記録の照合', `<span class="flow-match-clues"><span>作業服：識別タグ末尾 <strong>27</strong></span><span>書類：管理記録 3件</span></span><br>識別タグに対応する管理記録を選んでください。${message ? `<br><span class="flow-match-error" role="status">${message}</span>` : ''}`, [
      {label:'R-14',run:()=>choosePrologueRecord('R-14')},
      {label:'R-27',run:()=>choosePrologueRecord('R-27')},
      {label:'R-42',run:()=>choosePrologueRecord('R-42')},
      {label:'後で調べる',run:closeDetail},
    ]);
    document.getElementById('flowDetail')?.querySelector('.flow-detail-inner')?.classList.add('with-record-choices');
  }
  function prologueMatchSound() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      const context = new Audio();
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(630, context.currentTime);
      oscillator.frequency.linearRampToValueAtTime(900,context.currentTime+.16);
      gain.gain.setValueAtTime(effectVolume(.025),context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.21);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime+.22);
      oscillator.onended = () => context.close();
    } catch (_) { /* 音声禁止の環境でも照合を進める */ }
  }
  function choosePrologueRecord(code) {
    const state = st('prologue');
    if (state.observationUnlocked || !state.seen.has('jacket') || !state.seen.has('papers')) return;
    if (code !== 'R-27') {
      window.gameSfx?.play('error');
      state.observationAttempts = (state.observationAttempts || 0) + 1;
      saveProgress('stage');
      stageDialogue('スキャン', '照合不一致。作業服の識別タグに残った数字をもう一度確かめよう。');
      return showPrologueRecordChoices('記録の末尾が一致しない。何度でも確認できます。');
    }
    state.observationUnlocked = true;
    state.observationChoiceOpen = false;
    state.observationRecord = code;
    updateStage('prologue'); // 演出中に再読み込みしても解放結果を保持
    prologueMatchSound();
    stageDialogue('スキャン', '作業服の識別情報と勤務記録の一致を確認。補足記録を保存しました。');
    detail('TRACE RESTORED / 残された作業記録', `<span class="flow-record-match" role="status" aria-label="作業服と書類の記録が一致した"><span class="match-source"><span>01 / 識別タグ</span><strong>末尾 27</strong></span><span class="match-trace"><span></span></span><span class="match-source"><span>02 / 勤務記録</span><strong>R-27</strong></span><span class="match-result">RECORD MATCHED <small>管理記録の照合に成功</small></span></span><span class="match-story">識別タグと管理記録が同じ保管区画に関係することを確認した。個人ロッカーに関わる記録らしい。誰が使っていたかまでは分からない。<br>新しい調査記録を保存しました。</span>`, [{label:'演出を省略',run:skipPrologueMatchAnimation},{label:'探索を続ける',primary:true,run:closeDetail}]);
    const matchPrefs = typeof settings === 'undefined' ? {} : settings;
    if (matchPrefs.shortEffects || matchPrefs.reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) skipPrologueMatchAnimation();
  }
  function skipPrologueMatchAnimation() {
    document.querySelector('.flow-record-match')?.classList.add('skip-animation');
  }

  function lockerDetail() {
    const state = st('prologue');
    const open = state.unlocked;
    const recovered = state.found.has('shoe');
    detail('個人ロッカー', open ? (recovered ? '小さな靴はすでに回収した。' : '鍵が開いた。奥の棚に、持ち主の小さな靴が残されている。') : '……鍵がかかっている。扉はびくともしない。どこかに鍵が残っていればいいが。', open ? [
      { label: '探索画面へ戻る', run: closeDetail },
    ] : [
      { label: '探索画面へ戻る', run: closeDetail },
    ], open ? './prologue-locker-open.webp' : './prologue-locker-closed.webp');
    // 画像上で直接調べる方式は、第4章の熊のぬいぐるみと統一する。
    const image = document.getElementById('flowDetail').querySelector('.flow-detail-scene');
    const wrapper = document.createElement('div');
    wrapper.className = 'flow-locker-scene';
    image.replaceWith(wrapper);
    wrapper.appendChild(image);
    if (!recovered) {
      const button = document.createElement('button');
      button.className = 'flow-locker-target';
      button.type = 'button';
      if (open) {
        button.classList.add('shoe');
        button.setAttribute('aria-label', 'ロッカーの中の子供の靴を調べる');
        button.title = '子供の靴';
        button.onclick = () => inspectPrologueItem('shoe', lockerDetail);
      } else {
        button.classList.add('handle');
        button.setAttribute('aria-label', 'ロッカーの留め具を調べる');
        button.title = '留め具';
        button.onclick = () => detail('施錠されたロッカー', '鍵穴がある。どうやら壊れてはいない。鍵さえ見つかれば開きそうだ。', [{ label: '戻る', run: lockerDetail }], './prologue-locker-closed.webp');
      }
      wrapper.appendChild(button);
    }
  }

  function letterDetail() {
    const state = st('freighter');
    if (!state.unlocked) {
      detail('古い貨物ケース', '電子ロックがかかっている。認証カードの端子も傷んでいるようだ。修復したカードを道具欄で選び、このケースに使おう。', [
        { label: '貨物区画に戻る', run: closeDetail },
      ], ch6CaseClosedArt);
      return;
    }
    detail('開いた貨物ケース', '衣類や緩衝材の間に、古い封筒と小さな木彫りの人形が入っている。', [
      { label: '貨物区画に戻る', run: closeDetail },
      { label: '木彫りの人形を調べる', run: chapterSixDoll },
      ...(!state.seen.has('letter-event') ? [{ label: '古い封筒を調べる', run: () => {
        state.seen.add('letter-event');
        closeDetail();
        if (stages.freighter.required.every(key => state.found.has(key))) chapterSixLetterFound();
        else {
          state.letterPending = true;
          updateStage('freighter');
          stageDialogue('ナナ', '「……宛先が書かれた手紙だ。回収作業を終えたら、エステバンに相談したい。」');
        }
      } }] : [{ label: '手紙は確認済み', run: closeDetail }]),
    ], ch6CaseOpenArt);
  }

  function chapterSixDoll() {
    st('freighter').seen.add('doll');
    closeDetail();
    play([
      { speaker: 'ナナ', text: '「……小さな人形。木でできてるんだね。少し形がいびつだけど……誰かが、一生懸命作ったみたい。」' },
      { speaker: 'エステバン', text: '「手彫りか。売り物にしちゃ出来が悪いが……まあ、こういうもんを好きな奴もいるんだろうな。」' },
    ], () => { renderStage('freighter'); letterDetail(); }, { label: 'CHAPTER 06 / OPTIONAL', title: '木彫りの人形', fadeOut: true });
  }

  function chapterSixItemTalk(key, onFinish = () => renderStage('freighter')) {
    let slides;
    if (key === 'board6') slides = [
      { speaker: 'エステバン', text: '「……おお、こいつは上物だ。ほとんど酸化してねえ。こんな状態で残ってるとはな。……へへっ、今日は運が向いてるぜ。」' },
      { speaker: 'ナナ', text: '「……きれいな部品だね。エステバンがそんなに嬉しそうにしてると、ぼくまで少し嬉しくなるよ。」' },
      { speaker: 'エステバン', text: '「そりゃ結構。こいつを売れば、船の修理代もしばらく浮く。……お前がまた何か壊さなきゃ、の話だがな。」' },
      { speaker: 'ナナ', text: '「……うん。もう同じ失敗はしないようにする。ちゃんと覚えてるよ。」' },
    ];
    else if (key === 'battery') slides = [
      { speaker: 'ナナ', text: '「……エステバン、この電池、すごく大きいね。こんなものまで、誰かに届ける予定だったんだ。」' },
      { speaker: 'エステバン', text: '「大型機械用のバッテリーだ。状態がよけりゃ高く売れる。……まったく、こんな宝の山を放っておくなんて、もったいねえ話だぜ。」' },
    ];
    else slides = [
      { speaker: 'エステバン', text: st('freighter').found.size === 3 ? '「……よし。これで依頼品は揃ったな。今日は久しぶりに、まともな稼ぎになりそうだ。」' : '「……よし、補機部品を確保した。残りも探すぞ。」' },
      { speaker: 'ナナ', text: '「……よかったね、エステバン。今日は少し、いつもより楽しそうに見えるよ。」' },
    ];
    play(slides, onFinish, { label: 'CHAPTER 06 / RECOVERY', title: '貨物を回収', fadeOut: true });
  }

  function completeStage(id) {
    if (!stages[id].required.every(key => st(id).found.has(key))) return;
    if (!replayMode) completedChapters.add(id);
    if (id === 'prologue') return prologueDelivery();
    if (id === 'arcade') {
      if (!st('arcade').seen.has('hero-event')) return;
      if (st('arcade').returning) return;
      st('arcade').returning = true;
      document.getElementById('flowReturn').disabled = true;
      return chapterFiveReturn();
    }
    if (id === 'freighter') {
      if (!st('freighter').seen.has('letter-story') || st('freighter').returning) return;
      st('freighter').returning = true;
      document.getElementById('flowReturn').disabled = true;
      return chapterSixTravel();
    }
  }

  // 第1幕と幕間は別イベント。ナナの登場は第1幕のエンディング後に限定する。
  function prologueDelivery() {
    // 探索 UI を暗転させ、スチル①に切り替える。
    root().style.transition = 'opacity 1s';
    root().style.opacity = '0';
    setTimeout(() => {
      play([
        { text: '回収した品を届けるため、エステバンは宇宙ステーションへ立ち寄った。' },
        { text: '指定された受け渡し場所には、一人の女性が待っていた。' },
        { speaker: 'エステバン', text: '「……依頼の品だ。」' },
        { text: 'エステバンは、小さな靴とノートを差し出した。' },
        { text: '女性はそれを両手で受け取ると、しばらく動かなかった。' },
        { speaker: '依頼人', text: '「……これ……あの子の……」' },
        { text: '女性の指が、小さな靴の表面をそっとなぞる。' },
        { text: 'まるで、そこに残された温もりを確かめるように。' },
        { speaker: '依頼人', text: '「……ありがとう……本当に……ありがとう……」' },
        { text: '声が震えていた。' },
        { text: 'エステバンは返す言葉を見つけられず、視線をそらした。' },
        { speaker: 'エステバン', text: '「……仕事だからな。」' },
        { text: '女性は靴とノートを胸に抱きしめた。' },
        { text: 'エステバンはそれ以上何も言わず、静かにその場を離れた。' },
      ], prologueEnding, { image: deliveryStill, fadeInMs: 1500, delayTextMs: 1500, fadeOut: true });
      root().style.transition = 'none';
      root().style.opacity = '1';
    }, 1000);
  }

  function prologueEnding() {
    play([
      { text: '仕事は終わった。' },
      { text: 'エステバンは操縦席に深く腰を下ろした。' },
      { text: 'いつもの仕事だった。依頼された物を回収し、届ける。それだけだ。' },
      { text: 'だが、あの小さな靴の輪郭が、どうしても頭から離れなかった。' },
      { speaker: 'エステバン', text: '「…………」' },
      { text: 'ポケットから煙草を取り出す。' },
      { text: '口元へ運び、ライターに指をかける。' },
      { text: 'しかし、火をつけることはできなかった。' },
      { text: 'あの靴を見た瞬間、胸の奥で何かが軋んだ。' },
      { text: 'ずっと昔に押し込めたはずの記憶。' },
      { text: '思い出したところで、何も戻りはしない。' },
      { speaker: 'エステバン', text: '「……くそ。」' },
      { text: 'エステバンは煙草を指に挟んだまま、窓の外へ目を向けた。' },
      { text: '宇宙は、いつもと変わらず静かだった。' },
      { pauseForSignal: true },
      { speaker: '効果音', text: 'ピッ……ピッ……。' },
      { text: '不意に、航行端末が短い電子音を鳴らした。' },
      { speaker: 'エステバン', text: '「……あ？」' },
      { text: '表示されたのは、航路付近を漂う物体からの微弱な信号だった。' },
      { text: '古い識別コード。発信源は、近くのデブリ漂着帯。' },
      { speaker: 'エステバン', text: '「……こんなところで、まだ生きてる信号があるのか。」' },
      { text: 'エステバンは端末を操作し、信号の位置を確かめた。' },
      { text: '通常の救難信号とは違う。発信元の情報も判然としない。' },
      { speaker: 'エステバン', text: '「……使える部品でも残ってりゃ、儲けもんだ。」' },
      { text: 'そうつぶやくと、エステバンは操縦桿に手を伸ばした。' },
      { text: '船の向きがゆっくりと変わる。' },
      { text: '星々の間に、無数の残骸が漂う暗い領域が見えてきた。' },
    ], capsuleDiscovery, { image: memoryStill, fadeInMs: 1500, delayTextMs: 1500, fadeOut: true });
  }

  // 幕間「拾われた少年」。原作第2章の出会いをノベルイベントとして接続する。
  function capsuleDiscovery() {
    play([
      { text: '無数の残骸が漂う、暗い宇宙の一角。' },
      { text: 'エステバンは信号の発信源へと近づいていた。' },
      { speaker: 'エステバン', text: '「……この辺りのはずなんだがな。まったく、こんなガラクタの墓場で何が信号を出してやがる。」' },
      { text: '折れ曲がった船体、壊れた機械、打ち捨てられた貨物コンテナ。' },
      { text: 'その中に、ひとつだけ奇妙な物体が浮かんでいた。' },
      { speaker: 'エステバン', text: '「……なんだ、こいつは。見たこともねえ型だな。」' },
      { text: 'それは、人間一人が収まりそうな大きさのカプセルだった。' },
      { text: '外装には傷があるものの、周囲の残骸と比べて保存状態がいい。' },
      { text: '側面には、かすかな青い光が点滅していた。' },
      { speaker: 'エステバン', text: '「まだ電源が生きてやがる……。ずいぶんしぶとい代物だな。」' },
      { text: 'エステバンは携帯スキャナーを向けた。' },
      { text: '内部に反応がある。しかし、何が入っているのかまでは分からない。' },
      { speaker: 'エステバン', text: '「……厄介なもんじゃなきゃいいが。こういう拾い物に限って、ろくなことにならねえ。」' },
      { text: 'しばらくカプセルを見つめた後、エステバンは回収用の固定具を取り出した。' },
      { text: '少なくとも、ただのスクラップではなさそうだった。' },
      { speaker: 'エステバン', text: '「……まあ、見捨てるには惜しいか。持って帰って調べてみるとするかね。」' },
      { text: 'カプセルを回収船へ固定すると、エステバンは漂着帯を後にした。' },
    ], nanaMeeting, { image: capsuleStill, fadeInMs: 1500, delayTextMs: 1500, fadeOut: true });
  }

  function nanaMeeting() {
    play([
      { text: '船内の作業スペース。' },
      { text: 'エステバンは回収したカプセルを作業台に固定し、外装を調べていた。' },
      { speaker: 'エステバン', text: '「……妙な構造だな。貨物用にしちゃ、ずいぶん丁寧に作られてやがる。」' },
      { text: '通常の貨物カプセルとは違う。' },
      { text: '内部には独立した電源と、精密な生命維持装置にも似た機構が組み込まれていた。' },
      { text: 'エステバンが封鎖機構を解除すると、カプセルの蓋がゆっくりと開いた。' },
      { speaker: 'エステバン', text: '「……は？ おいおい……冗談だろ。なんでこんなところにガキが入ってんだ？」' },
      { text: '中にいたのは、小柄な少年だった。' },
      { text: 'いや、人間ではない。' },
      { text: '皮膚の質感、関節の構造、かすかに点滅する虹彩。' },
      { text: '少年の姿をしたアンドロイドだった。' },
      { speaker: 'エステバン', text: '「……ったく、悪い冗談にもほどがあるぜ。」' },
      { text: '少年の瞳に、淡い光が灯る。' },
      { text: '小さな身体がゆっくりと起き上がった。' },
      { speaker: 'ナナ', text: '「…………」' },
      { speaker: 'エステバン', text: '「おい……聞こえてんのか？ 俺の声が分かるなら、何か答えてみろ。」' },
      { speaker: 'ナナ', text: '「……うん。聞こえるよ。あなたの声、ちゃんと届いてる。」' },
      { text: '少年はエステバンを見上げた。' },
      { text: 'その視線には、警戒も恐怖もない。ただ純粋な好奇心だけがあった。' },
      { speaker: 'ナナ', text: '「……ここは、どこ？ さっきまで、とても暗かった気がするんだ。」' },
      { speaker: 'エステバン', text: '「俺の船だ。宇宙のゴミ溜めから、お前ごとそのカプセルを拾ってきたんだよ。」' },
      { speaker: 'ナナ', text: '「……あなたは？ ぼくを、ここへ連れてきてくれた人？」' },
      { speaker: 'エステバン', text: '「エステバン。エステバン・モラレスだ。……別に、助けたつもりはねえぞ。」' },
      { text: '少年はその名前を確かめるように、ゆっくりと繰り返した。' },
      { speaker: 'ナナ', text: '「……エステバン。うん、覚えた。もう忘れないと思う。」' },
      { speaker: 'エステバン', text: '「で、お前はいったい何なんだ？ ただの作業ロボットってわけでもなさそうだが。」' },
      { speaker: 'ナナ', text: '「……ナナ。」' },
      { speaker: 'エステバン', text: '「……ナナ？ そいつは名前か？ ずいぶん変わった名前だな。」' },
      { speaker: 'ナナ', text: '「うん。ぼくの名前。……あなたにも、そう呼んでほしい。」' },
      { text: 'エステバンは深いため息をついた。' },
      { text: '高価な機械を拾ったつもりが、とんでもない厄介事を抱え込んだのかもしれない。' },
      { speaker: 'エステバン', text: '「……ったく。金になるもんでも入ってるかと思えば、おしゃべりなガキの機械かよ。とんだ拾い物だぜ。」' },
      { speaker: 'ナナ', text: '「……ぼくは、面倒？ エステバンは、ぼくを拾って……困ってるの？」' },
      { speaker: 'エステバン', text: '「……今のところはな。まあ、拾っちまったもんは仕方ねえ。少しは大人しくしてろよ。」' },
      { text: 'ナナは少し首をかしげた。' },
      { text: 'その言葉の意味を理解しようとしているようだった。' },
      { text: 'エステバンは結局、ナナを船から追い出すことができなかった。' },
      { text: '次の仕事を探す間も、ナナは船内のあらゆる物に興味を示した。' },
      { speaker: 'ナナ', text: '「エステバン。この道具は何に使うの？ 先が変わった形をしてるね。」' },
      { speaker: 'エステバン', text: '「……工具だよ。船の修理に使うんだ。危ねえから勝手に触るな。」' },
      { speaker: 'ナナ', text: '「じゃあ、これは？ さっきから、ずっと音がしてる。」' },
      { speaker: 'エステバン', text: '「……予備のフィルターだ。そいつが止まったら、俺は息もできなくなる。」' },
      { speaker: 'ナナ', text: '「そっか。じゃあ、これは？ これも大切なもの？」' },
      { speaker: 'エステバン', text: '「……お前、少しは黙ってられねえのか。質問ばっかりしやがって、仕事になりゃしねえ。」' },
      { text: 'そんなやり取りを繰り返すうちに、新しい依頼が届いた。' },
      { text: '廃棄された都市衛星の居住区から、生活用品を回収する仕事だった。' },
      { speaker: 'ナナ', text: '「エステバン。ぼくも一緒に行っていい？ 外には、まだ知らないものがたくさんあるんでしょう？」' },
      { speaker: 'エステバン', text: '「……好きにしろ。ただし仕事の邪魔はするな。勝手なことをしたら、置いてくからな。」' },
      { speaker: 'ナナ', text: '「うん、分かった。……ありがとう、エステバン。」' },
      { text: 'こうして、エステバンとナナの最初の共同探索が始まった。' },
    ], enterChapterFour, { image: nanaMeetingStill, fadeInMs: 1500, delayTextMs: 1500, fadeOut: true });
  }

  function enterChapterFour() {
    play([
      { text: '巨大な都市衛星が、暗い宇宙に浮かんでいた。' },
      { text: 'かつて大勢の人々が暮らしていた居住リングは、今では無残に引き裂かれている。' },
      { text: '破損した外壁の向こうには、住人を失った部屋や通路がむき出しになっていた。' },
      { speaker: 'ナナ', text: '「……すごい。あんなに大きな場所に、人が住んでいたの？」' },
      { speaker: 'エステバン', text: '「ああ。何千人もな。昔はそれなりに賑やかな場所だったらしいぜ。……今じゃ見る影もねえがな。」' },
      { speaker: 'ナナ', text: '「でも……誰もいないね。みんな、どこへ行ったの？」' },
      { speaker: 'エステバン', text: '「さあな。逃げた奴もいりゃ、逃げられなかった奴もいる。……宇宙じゃ珍しくもねえ話だ。」' },
      { text: 'ナナは窓の向こうに広がる廃墟を、じっと見つめていた。' },
      { text: '壊れた居住区には、家具や生活用品が取り残されている。' },
      { text: 'つい昨日まで、誰かがそこに暮らしていたかのように。' },
      { speaker: 'ナナ', text: '「……あの部屋、まだベッドがある。机も、食器も……。どうして、みんな置いていったんだろう。」' },
      { speaker: 'エステバン', text: '「持って逃げる余裕なんざなかったんだろ。命と荷物を天秤にかけりゃ、答えは決まってる。」' },
      { speaker: 'ナナ', text: '「……そうなんだ。でも、あそこに残ったものは、もう誰も使わないの？」' },
      { speaker: 'エステバン', text: '「だから俺たちの仕事になるんだよ。使えるもんを拾って、必要な奴に売る。それがサルベージだ。」' },
      { text: 'エステバンは航行端末に回収依頼のリストを表示した。' },
      { text: '今回の仕事は、廃棄された居住区から生活用品と再利用可能な資材を回収することだった。' },
      { speaker: 'エステバン', text: '「食器、照明モジュール、使えそうな生活用品……。まあ、たいした稼ぎにゃならねえが、手ぶらで帰るよりはマシだ。」' },
      { speaker: 'ナナ', text: '「……ねえ、エステバン。ぼくも、何か見つけられるかな。」' },
      { speaker: 'エステバン', text: '「そりゃお前次第だ。だが、面白そうだからって何でも拾うなよ。俺たちはゴミ収集屋じゃねえんだからな。」' },
      { speaker: 'ナナ', text: '「うん。……でも、何が大切なものなのか、まだよく分からない。」' },
      { speaker: 'エステバン', text: '「値がつくかどうかだ。……ま、仕事してりゃそのうち分かる。」' },
      { text: 'ナナはもう一度、窓の外へ目を向けた。' },
      { text: '捨てられた部屋。壊れた家具。宇宙を漂う無数の小さな物。' },
      { text: 'その一つひとつに、誰かが触れていた時間があることを、ナナはまだ知らなかった。' },
      { speaker: 'エステバン', text: '「……よし、着いたぞ。命綱を忘れるなよ。はぐれたって迎えにゃ行かねえからな。」' },
      { speaker: 'ナナ', text: '「了解。……エステバン、ぼく、ちゃんとついていくよ。」' },
      { text: '二人は装備を確認すると、静まり返った居住区へと足を踏み入れた。' },
    ], showChapterFourExploration, { image: ch4ArrivalStill, label: 'CHAPTER 04 / ARRIVAL', title: '捨てられた街', note: 'オープニングスチル① 制作待ち', fadeInMs: 1500, delayTextMs: 1500, fadeOut: true });
  }

  function showChapterFourExploration() {
    haltTyping(); sequence = null;
    root().hidden = true;
    chapterFour().hidden = false;
    window.gameBgm?.setScene('chapter4','explore');
    latestStage = 'prologue';
    saveProgress('chapter4');
    chapterFour().style.transition = 'none';
    chapterFour().style.opacity = '0';
    activeStage = 'chapter4';
    setTimeout(() => {
      chapterFour().style.transition = 'opacity 1s';
      chapterFour().style.opacity = '1';
    }, 30);
  }

  function afterChapterFour() {
    if (activeStage !== 'chapter4') return;
    if (!replayMode) completedChapters.add('chapter4');
    window.gameBgm?.setScene('chapter4','story');
    chapterFour().style.transition = 'opacity 1s';
    chapterFour().style.opacity = '0';
    setTimeout(chapterFourReturn, 1000);
  }

  function chapterFourReturn() {
    play([
      { text: '回収を終えた二人は、宇宙ステーションの受け渡し区画へ戻っていた。' },
      { text: 'エステバンが回収品を確認していると、一人の小さな男の子が近づいてきた。' },
      { text: '少年の視線は、ナナが持っている回収袋に釘付けになっていた。' },
      { speaker: '男の子', text: '「……あっ……！ それ……そのクマ……！」' },
      { text: 'ナナが袋から片目のない熊のぬいぐるみを取り出す。' },
      { text: '男の子は息をのんだ。' },
      { speaker: '男の子', text: '「……ぼくの……ぼくのクマだ……！」' },
      { text: '震える手が伸びてくる。' },
      { text: 'ナナは少し戸惑いながら、熊を差し出した。' },
      { text: '男の子はぬいぐるみを受け取ると、小さな胸にぎゅっと抱きしめた。' },
      { speaker: '男の子', text: '「……よかった……もう、会えないと思ってた……。ずっと、探してたんだ……。」' },
      { text: '男の子の頬を涙が伝った。' },
      { text: 'けれど、その顔には確かな笑顔が浮かんでいた。' },
      { speaker: 'ナナ', text: '「……泣いてる。でも……笑ってる。エステバン、あの子は悲しいの？ それとも、嬉しいの？」' },
      { speaker: 'エステバン', text: '「……嬉しいんだろ。ずっと探してたもんが、戻ってきたんだからな。」' },
      { speaker: 'ナナ', text: '「嬉しい……。でも、このクマは壊れているよ。片目もないし、布も傷んでる。新しいものの方が、きっときれいなのに。」' },
      { speaker: 'エステバン', text: '「……そういう問題じゃねえんだよ。あのガキにとっちゃ、あれじゃなきゃ駄目なんだ。」' },
      { speaker: 'ナナ', text: '「……あのクマじゃなきゃ、駄目？ 同じ形の新しいクマでも、駄目なの？」' },
      { speaker: 'エステバン', text: '「ああ。どれだけ古くなろうが、ボロボロになろうがな。……代わりの利かねえもんってのは、あるんだよ。」' },
      { text: 'ナナは熊を抱きしめる男の子を見つめた。' },
      { text: '市場では、ほとんど値段のつかない古いぬいぐるみ。' },
      { text: 'それなのに、少年はまるで宝物を取り戻したかのように喜んでいる。' },
      { speaker: '男の子', text: '「……ありがとう。見つけてくれて……本当に、ありがとう。もう、なくさないから……。」' },
      { speaker: 'ナナ', text: '「……うん。見つかって、よかったね。ずっと、大切にしてあげて。」' },
      { text: 'ナナの虹彩が、淡く揺れた。' },
      { text: 'それは計算だけでは説明できない、初めて触れる感情だった。' },
      { holdStill: 2000 },
    ], chapterFourAfter, { image: ch4ReturnStill, label: 'CHAPTER 04 / RETURN', title: '大切なもの', note: 'エンディングスチル② 制作待ち', fadeInMs: 1500, delayTextMs: 1500, fadeOut: true });
  }

  function chapterFourAfter() {
    play([
      { text: '帰りの船内で、ナナはいつになく静かだった。' },
      { text: '助手席に座り、自分の手のひらをじっと見つめている。' },
      { text: 'その手には、もう熊のぬいぐるみはなかった。' },
      { speaker: 'エステバン', text: '「……どうした。さっきから、ずいぶん静かじゃねえか。いつもの質問攻めはどうしたよ。」' },
      { speaker: 'ナナ', text: '「……考えてたんだ。あの子、あんなに嬉しそうだった。クマを抱きしめたとき、まるで……何かが戻ってきたみたいだった。」' },
      { speaker: 'エステバン', text: '「……そりゃ、なくしたもんが戻ってきたんだからな。あのガキにとっちゃ、大事なもんだったんだろ。」' },
      { speaker: 'ナナ', text: '「でも、エステバンは最初、あのクマには価値がないって言ってたよね。」' },
      { speaker: 'エステバン', text: '「売り物としちゃな。……だが、持ち主にとっては話が別だ。値札なんぞ、関係ねえこともある。」' },
      { speaker: 'ナナ', text: '「……不思議だね。同じものなのに、誰が持っているかで、大切さが変わるんだ。」' },
      { text: 'エステバンは答えず、航行端末へ視線を戻した。' },
      { text: '計器の青白い光が、疲れた横顔を静かに照らしている。' },
      { speaker: 'ナナ', text: '「……ねえ、エステバン。ぼくにも、いつか大切なものができるのかな。なくしたら悲しくて、戻ってきたら嬉しくなるようなものが。」' },
      { speaker: 'エステバン', text: '「……さあな。そんなもん、俺に聞くな。欲しいと思って手に入るもんでもねえしな。」' },
      { text: 'ナナはもう一度、自分の手のひらに目を落とした。' },
      { text: 'さっきまで、あの小さな熊を抱えていた手。' },
      { text: '今は何も持っていない。' },
      { speaker: 'ナナ', text: '「……そっか。でも、あの子が嬉しそうで……ぼくも、なんだか嬉しかった。」' },
      { text: 'エステバンは、その言葉にわずかに手を止めた。' },
      { text: 'ナナはまだ、自分の手のひらを見つめていた。' },
      { text: 'その幼い仕草が、一瞬だけ、遠い記憶と重なる。' },
      { text: '小さな手。無邪気な声。' },
      { text: '胸の奥で、古い傷がかすかに疼いた。' },
      { speaker: 'エステバン', text: '「……ったく。変なことばっかり覚えやがって。」' },
      { speaker: 'ナナ', text: '「……変なこと？」' },
      { speaker: 'エステバン', text: '「……いや。なんでもねえ。」' },
      { text: 'エステバンはそれ以上何も言わなかった。' },
      { text: '船は静かに航路へ戻っていく。' },
      { text: 'ナナは窓の外を眺めながら、まだ知らない人間の感情について考えていた。' },
      { text: 'そしてエステバンもまた、遠い昔の記憶を振り払うように、操縦桿を握り直した。' },
    ], chapterFiveOpening, { image: ch4AfterStill, label: 'CHAPTER 04 / AFTER', title: '小さな疑問', fadeInMs: 1500, delayTextMs: 1500, fadeOut: true, fadeOutMs: 1500 });
  }

  // CHAPTER 05: スチルは三つとも制作待ち。共通ノベルエンジンと探索画面を再使用。
  function chapterFiveOpening() {
    play([
      { text: '次の回収先は、廃棄された娯楽施設だった。' },
      { text: 'かつては人々の笑い声と明るい音楽に満ちていた場所。' },
      { text: '今では照明も消え、壊れた設備と色褪せた広告だけが残されている。' },
      { speaker: 'ナナ', text: '「……エステバン、見て。変わった建物だね。あんなにたくさんの色が使われてる。ここは、何をする場所だったの？」' },
      { speaker: 'エステバン', text: '「遊び場だよ。昔はゲームだの玩具だのに金を使う連中で賑わってたらしい。……今じゃ、電気代も払えねえ廃墟だがな。」' },
      { speaker: 'ナナ', text: '「遊び場……。人間は、仕事をしなくてもいい場所をわざわざ作って、そこへ集まっていたの？」' },
      { speaker: 'エステバン', text: '「ああ。生きてくには息抜きも必要ってことだろ。……もっとも、俺みたいな貧乏人にゃ、あんまり縁のねえ場所だが。」' },
      { text: '施設の外壁には、かつての広告や装飾の残骸が残っていた。' },
      { text: '色鮮やかだったであろう看板は剥がれ、壊れた照明が宇宙空間へ突き出している。' },
      { text: 'ナナはその光景を興味深そうに眺めていた。' },
      { speaker: 'ナナ', text: '「……ここに来た人たちは、楽しかったのかな。こんなに大きな場所を作るくらいだから、きっとすごく大切なことだったんだね。」' },
      { speaker: 'エステバン', text: '「さあな。だが、遊んだところで腹は膨れねえ。俺たちが探すのは電子基板と銅線だ。余計なもんに気を取られるなよ。」' },
      { speaker: 'ナナ', text: '「うん、分かった。……でも、少しだけ見てもいい？ ぼく、人間がどうやって遊んでいたのか、知りたいんだ。」' },
      { speaker: 'エステバン', text: '「……仕事の邪魔にならねえ程度にな。ったく、お前を連れてると、どこへ行っても社会見学だぜ。」' },
      { text: 'エステバンは船を施設の破損した接続区画へ近づけた。' },
      { text: '二人の宇宙服に備わった磁気固定ブーツが、金属製の床をしっかり捉える。周囲では古い玩具や小物が無重力のまま漂っていた。' },
      { text: '二人は装備を確認し、長い間誰にも使われていない娯楽施設へと入っていった。' },
    ], () => renderStage('arcade'), { image: ch5OpeningStill, label: 'CHAPTER 05 / OPENING', title: '忘れられた遊び場', note: 'スチル① 準備中', fadeInMs: 1500, delayTextMs: 1500, fadeOut: true });
  }

  function chapterFiveArcadeTalk() {
    closeDetail();
    play([
      { speaker: 'ナナ', text: '「エステバン。この大きな機械、何をするものなの？ 画面もボタンもたくさんあるのに、仕事の道具には見えないよ。」' },
      { speaker: 'エステバン', text: '「ゲーム機だよ。昔の連中は、金払ってこんなもんで遊んでたんだ。……俺には、金を払ってまで機械に負けに行く気が知れねえがな。」' },
      { speaker: 'ナナ', text: '「お金を払って……遊ぶ？ 何か手に入るの？ それとも、遊ぶこと自体が目的なの？」' },
      { speaker: 'エステバン', text: '「さあな。楽しかったんだろ。何の役にも立たねえことに夢中になる奴もいる。……まあ、悪いことばかりじゃねえんだろうが。」' },
      { speaker: 'ナナ', text: '「……楽しいって、どんな感じなんだろう。ぼくにも分かるのかな。」' },
      { speaker: 'エステバン', text: '「……そいつは自分で覚えるしかねえな。誰かに説明されたって、分かるもんでもねえだろ。」' },
    ], () => renderStage('arcade'), { label: 'CHAPTER 05 / INVESTIGATION', title: 'アーケード筐体', monitor: true });
  }

  function chapterFiveHero() {
    warningBeep();
    play([
      { text: 'ナナが古い映像端末に触れた、そのときだった。' },
      { text: '暗かった画面が突然明るくなり、陽気な音楽が流れ始めた。' },
      { text: '画面いっぱいに、鮮やかな色の衣装をまとったヒーローが現れる。' },
      { text: 'ナナが思わず腕を伸ばす。反動で身体がわずかに揺れたが、磁気固定ブーツが金属床を捉えていた。' },
      { speaker: 'ナナ', text: '「……エステバン！ 見て、見て！ この人、すごいよ！ あんなに危ないのに、全然逃げないんだ！」' },
      { speaker: 'エステバン', text: '「……あ？ なんだ、ガキ向けのアニメじゃねえか。こんな古いもんが、まだ動くとはな……。」' },
      { speaker: 'ナナ', text: '「この人、みんなを守ってる。自分が傷つくかもしれないのに……。どうして、あんなに嬉しそうに笑ってるの？」' },
      { speaker: 'エステバン', text: '「……そういう話なんだよ。ヒーローってのはな。どんなに怖くたって、最後には誰かを助けに行く。……現実じゃ、そう簡単にはいかねえが。」' },
      { speaker: 'ナナ', text: '「……ぼくも、こんなふうになれるかな。誰かが困っていたら、怖くても助けに行けるような……そんなヒーローに。」' },
      { speaker: 'エステバン', text: '「……やめとけ。ヒーローなんざ、ろくなもんじゃねえ。誰かを守るなんて、口で言うほど簡単じゃねえんだよ。」' },
      { speaker: 'ナナ', text: '「……でも、誰かを守れるって、すごいことだと思う。ぼく、このヒーローが好きだな。見てると、なんだか胸のあたりが……明るくなるんだ。」' },
      { text: 'エステバンは答えなかった。' },
      { text: '画面の中では、ヒーローが笑っていた。' },
      { text: 'その姿を夢中で見つめていた、小さな背中が脳裏によみがえる。' },
      { text: 'かつて同じように目を輝かせ、テレビの前でヒーローの真似をしていた幼い姿。' },
      { text: '工具を握っていたエステバンの指が、わずかに止まった。' },
      { speaker: 'エステバン', text: '「……くそ。なんで今さら、こんなもんを……。忘れたつもりだったってのによ。」' },
      { text: 'ナナはエステバンの変化に気づかず、画面のヒーローを夢中で見つめていた。' },
      { text: 'その瞳には、先ほどまで知らなかった喜びの光が宿っていた。' },
    ], () => { renderStage('arcade'); stageDialogue('ナナ', '「……ぼくも、あんなヒーローになれるかな。」'); }, { image: ch5HeroStill, label: 'CHAPTER 05 / DISCOVERY', title: '目覚めたヒーロー', note: 'スチル② 準備中', fadeInMs: 1500, delayTextMs: 500, fadeOut: true });
  }

  function chapterFiveReturn() {
    root().style.transition = 'opacity 1s';
    root().style.opacity = '0';
    setTimeout(() => {
      root().style.transition = 'none';
      root().style.opacity = '1';
      chapterFiveReturnNarration();
    }, 1000);
  }

  function chapterFiveReturnNarration() {
    play([
      { text: '回収作業を終え、二人は船へ戻った。' },
      { text: 'だが、ナナの興奮はまだ収まっていなかった。' },
      { text: '船内に戻ってからも、覚えたばかりのヒーローのポーズを何度も真似している。' },
      { text: 'エステバンは作業台で機器の点検を続けながら、何度目か分からないため息をついた。' },
      { text: 'ナナは近くにあったスクラップを剣に見立て、勢いよく腕を振り上げた。' },
    ], chapterFiveAccident, { label: 'CHAPTER 05 / RETURN', title: '帰還', fadeOut: true });
  }

  function chapterFiveAccident() {
    warningBeep();
    play([
      { text: 'バチッ！' },
      { text: '突然、船内の警告灯が赤く点滅した。' },
      { text: 'ナナが振り回していたスクラップが、作業台の機器にぶつかっていた。' },
      { text: '焦げた配線から、細い煙が立ち上っている。' },
      { speaker: 'エステバン', text: '「……っ！ ミゲル！ 何やってんだ！ 危ねえだろうが！ 何度言えば分かるんだ、お前は！」' },
      { text: '怒鳴った瞬間、エステバンの身体が凍りついた。' },
      { text: 'そこにいたのは、ミゲルではなかった。' },
      { text: '目の前にいるのは、宇宙の残骸から拾った少年型アンドロイド、ナナだった。' },
      { speaker: 'ナナ', text: '「……エステバン？ どうしたの……？ ぼく、何か……すごく悪いことをした？」' },
      { speaker: 'エステバン', text: '「…………」' },
      { speaker: 'ナナ', text: '「……ごめんなさい。ぼく、壊しちゃった。ヒーローみたいに動いてみたかっただけなんだ。……怒らせるつもりは、なかったのに。」' },
      { speaker: 'エステバン', text: '「……分かってる。もういい。そこを動くな。……頼むから、これ以上何も触らないでくれ。」' },
      { speaker: 'ナナ', text: '「……ねえ、エステバン。さっきの……ミゲルって、誰？ ぼくのことを見て、そう呼んだよね。」' },
      { text: 'エステバンの手が止まった。' },
      { text: '長い間、誰にも呼ばせなかった名前だった。' },
      { text: '胸の奥に押し込めていた記憶が、突然こじ開けられたようだった。' },
      { speaker: 'エステバン', text: '「……お前には関係ねえ。知らなくていいことだ。……もう、聞くな。」' },
      { speaker: 'ナナ', text: '「……でも、ぼくを見て、その名前を呼んだよ。エステバン、あのとき……すごく悲しそうな顔をしてた。」' },
      { speaker: 'エステバン', text: '「……もう、その話はするな。俺にも……どう話せばいいのか、分からねえんだよ。」' },
      { text: 'ナナはそれ以上何も聞かなかった。' },
      { text: 'ただ、エステバンがひどく悲しそうな顔をしていることだけは、分かった。' },
      { text: 'ナナは手にしていたスクラップを静かに置き、作業台から一歩離れた。' },
    ], chapterFiveRepair, { image: ch5AccidentStill, label: 'CHAPTER 05 / ACCIDENT', title: '呼んではいけない名前', fadeInMs: 500, delayTextMs: 500, fadeOut: true });
  }

  function chapterFiveRepair() {
    play([
      { text: 'エステバンは壊れた機器の修理を始めた。' },
      { text: '焦げた配線を外し、予備の部品を組み込み、慎重に接続を確かめる。' },
      { text: 'ナナは少し離れた場所に座り、その作業を黙って見つめていた。' },
      { text: 'いつものように質問することも、ヒーローの真似をすることもなかった。' },
      { speaker: 'ナナ', text: '「……エステバン。ぼく、もう勝手に工具を使わないよ。ヒーローみたいになりたかったけど……誰かを困らせるなら、きっと違うんだよね。」' },
      { speaker: 'エステバン', text: '「……そうだな。ヒーローってのは、物をぶっ壊して回る奴のことじゃねえ。……まあ、俺も少し怒鳴りすぎた。」' },
      { text: 'ナナは顔を上げた。' },
      { text: 'エステバンは作業を続けたまま、ナナを見ようとはしない。' },
      { speaker: 'ナナ', text: '「……エステバンも、間違えることがあるの？」' },
      { speaker: 'エステバン', text: '「……あるさ。数えきれねえくらいにな。……取り返しのつかねえ間違いだって、ある。」' },
      { text: 'エステバンの手が一瞬だけ止まった。' },
      { text: 'しかし、すぐに工具を握り直す。' },
      { speaker: 'ナナ', text: '「……そっか。じゃあ、ぼくも……間違えたら、ちゃんと覚えるようにする。もう誰かを悲しませないように。」' },
      { speaker: 'エステバン', text: '「……ああ。それでいい。……それで十分だ。」' },
      { text: '修理が終わる頃には、船内の警告灯はすべて消えていた。' },
      { text: '計器が正常な数値を示し、いつもの低い機械音が戻ってくる。' },
      { text: 'けれど、二人の間にはまだ少しだけ、ぎこちない沈黙が残っていた。' },
      { speaker: 'エステバン', text: '「……よし。これで動く。ったく、余計な仕事を増やしやがって。」' },
      { speaker: 'ナナ', text: '「……ごめんなさい。次は、ちゃんと役に立てるようにするね。」' },
      { speaker: 'エステバン', text: '「……別に、無理して役に立とうとしなくていい。……壊さずにいてくれりゃ、それで十分だ。」' },
      { text: 'ナナはその言葉を静かに受け止めた。' },
      { text: 'エステバンは操縦席へ戻り、次の回収依頼を確認するために端末を開いた。' },
    ], chapterFiveNextJob, { label: 'CHAPTER 05 / REPAIR', title: '壊れたもの', fadeInMs: 1000, delayTextMs: 1000, fadeOut: true });
  }

  function chapterFiveNextJob() {
    play([
      { text: '航行端末には、いくつもの回収案件が並んでいた。' },
      { text: '破損した通信衛星、廃棄された貨物コンテナ、旧式の作業艇。' },
      { text: 'その中に、ひとつだけエステバンの目を引く情報があった。' },
      { text: '長期間漂流している古い輸送船。' },
      { text: '貨物区画には、保存状態のよい補機部品や電子機器が残されている可能性があるという。' },
      { speaker: 'エステバン', text: '「……おいおい、こいつは悪くねえな。まともな部品が残ってりゃ、しばらくは食いっぱぐれずに済むぞ。」' },
      { speaker: 'ナナ', text: '「……次のお仕事？ 今度は、どんなものを探しに行くの？」' },
      { speaker: 'エステバン', text: '「古い輸送船だ。中身が無事なら、ちょっとした宝の山かもしれねえ。……まあ、開けてみなきゃ分からねえがな。」' },
      { speaker: 'ナナ', text: '「……宝の山。そっか。そこにも、誰かが大切にしていたものが残っているのかな。」' },
      { speaker: 'エステバン', text: '「……またその話かよ。俺は金になるもんを探しに行くんだぞ。……まあ、何が出てくるかは分からねえが。」' },
      { text: 'ナナは窓の外へ目を向けた。' },
      { text: 'エステバンは航路を設定し、船の進行方向をゆっくりと変える。' },
      { text: '先ほどまでのぎこちなさは、まだ完全には消えていない。' },
      { text: 'それでも二人は、同じ船に乗って次の仕事へ向かっていた。' },
      { text: '次の目的地は、長い間宇宙を漂い続けている、一隻の古い輸送船。' },
      { text: 'そこに、二人の旅を少しだけ変える一通の手紙が残されていることを、彼らはまだ知らなかった。' },
    ], chapterSixOpening, { label: 'CHAPTER 05 / END', title: '次の仕事', fadeOut: true, fadeOutMs: 1500 });
  }

  // 第6章とエピローグ。完成スチルは定数を差し替えるだけで同じ演出に合流する。
  function chapterSixOpening() {
    play([
      { text: '長い航行の末、二人は目的の輸送船へたどり着いた。' },
      { text: '古びた巨大な船体が、星々の間に静かに浮かんでいる。' },
      { text: '外装には長い年月の傷が刻まれているが、貨物区画は比較的原形を保っているようだった。' },
      { speaker: 'エステバン', text: '「……ほう。思ったより状態がいいじゃねえか。こいつは当たりかもしれねえな。中身が残ってりゃ、しばらくは食い扶持に困らずに済むぞ。」' },
      { speaker: 'ナナ', text: '「……大きな船だね。こんなにたくさんの荷物を積んで、どこへ行こうとしていたんだろう。」' },
      { speaker: 'エステバン', text: '「さあな。目的地に着けなかったってことだけは確かだ。……ま、積み荷まで道連れにすることはねえ。使えるもんは使わせてもらおうぜ。」' },
      { text: 'エステバンは貨物管理情報を確認した。' },
      { text: '記録には、電子基板、バッテリーモジュール、補機部品などの名前が並んでいる。' },
      { text: '保存状態がよければ、どれも高値で取引される品物だった。' },
      { speaker: 'エステバン', text: '「見ろよ、ナナ。この部品だけでも相当な値がつく。……へへっ、久しぶりにまともな飯が食えそうだ。」' },
      { speaker: 'ナナ', text: '「エステバン、嬉しそう。……でも、この荷物を運んでいた人たちは、どうなったのかな。」' },
      { speaker: 'エステバン', text: '「……お前は相変わらずだな。今は仕事だ。昔の持ち主のことまで考えてたら、いつまで経っても終わらねえぞ。」' },
      { speaker: 'ナナ', text: '「……うん。でも、どんな人が使うはずだったものなのか、少しだけ気になるんだ。」' },
      { text: 'エステバンは短くため息をつき、船の接続装置を作動させた。' },
      { text: '第3章の出来事以来、二人の間にはまだ少しだけぎこちなさが残っていた。' },
      { text: 'それでも、ナナは以前と変わらずエステバンの隣にいた。' },
      { speaker: 'エステバン', text: '「……よし、行くぞ。今回は高いもんがゴロゴロしてるはずだ。目を皿にして探せよ。ただし、勝手に機械をいじるな。……この前みたいになるからな。」' },
      { speaker: 'ナナ', text: '「……うん。今度は気をつける。ぼくも、エステバンの役に立てるものを探すよ。」' },
      { text: '二人は輸送船の貨物区画へと入っていった。' },
    ], () => renderStage('freighter'), { image: ch6ArrivalStill, label: 'CHAPTER 06 / OPENING', title: '眠れる輸送船', fadeInMs: 1500, delayTextMs: 1500, fadeOut: true });
  }

  function chapterSixLetterFound() {
    window.gameBgm?.duck(2800);
    st('freighter').seen.add('letter-story');
    play([
      { text: 'ナナは古い箱の中から、一通の手紙を取り出した。' },
      { text: '封筒は黄ばみ、端が少し傷んでいる。' },
      { text: 'だが、そこには確かに誰かの名前と宛先が記されていた。' },
      { speaker: 'ナナ', text: '「……エステバン。これ、手紙だよ。誰かに届けるために書かれたものなのに……まだ、ここに残ってる。」' },
      { speaker: 'エステバン', text: '「……手紙？ そんなもん、今どき珍しいな。だが、ずいぶん古いじゃねえか。届ける相手だって、もういるかどうか分からねえぞ。」' },
      { text: 'ナナは封筒をそっと裏返した。' },
      { text: '宛名の部分を、指先で確かめる。' },
      { speaker: 'ナナ', text: '「……でも、ここに名前が書いてある。きっと、誰かがこの手紙を受け取るはずだったんだよね。……その人は、ずっと待っていたかもしれない。」' },
      { speaker: 'エステバン', text: '「……そうかもしれねえが、そんな昔の手紙に値なんざつかねえ。俺たちの仕事は郵便配達じゃねえんだぞ。」' },
      { speaker: 'ナナ', text: '「……うん。分かってる。これは依頼されたものじゃないし、お金にもならない。……でも、ぼく、どうしても気になるんだ。」' },
      { text: 'ナナは手紙を両手で包み込むように持った。' },
      { text: 'その姿は、以前、古い熊のぬいぐるみを大切に抱えていたときに似ていた。' },
      { speaker: 'エステバン', text: '「……おい。まさか、そいつを持って帰るつもりじゃねえだろうな。」' },
      { speaker: 'ナナ', text: '「……エステバン。ぼく、この手紙を届けたい。」' },
      { speaker: 'エステバン', text: '「……はあ？ お前、簡単に言うなよ。どれだけ時間が経ってると思ってんだ。届けたところで、一銭にもならねえぞ。」' },
      { speaker: 'ナナ', text: '「……うん。お金にならないのは分かってる。でも、あのクマを受け取った子は、すごく嬉しそうだった。……この手紙にも、きっと誰かの大切な気持ちが残ってると思うんだ。」' },
      { speaker: 'エステバン', text: '「……届かねえかもしれねえぞ。相手がもう死んでるかもしれねえ。それでも行くってのか。」' },
      { speaker: 'ナナ', text: '「……うん。それでも、届けたい。もし待っている人がいるなら、その人に渡してあげたい。……ぼくが、そうしたいんだ。」' },
      { text: 'その声は、いつもの質問でも、命令への返答でもなかった。' },
      { text: 'ナナ自身の、はっきりとした願いだった。' },
      { text: 'エステバンはしばらく黙っていた。' },
      { text: '目の前の少年型アンドロイドは、もう単に言われたことを実行するだけの存在ではなくなっていた。' },
      { speaker: 'エステバン', text: '「……ったく。お前って奴は、どうしてそう面倒なことばっかり思いつくんだ。……まあ、次の補給港からそう遠くねえ。ついでに寄るくらいなら、できなくもねえが。」' },
      { speaker: 'ナナ', text: '「……本当？ エステバン、いいの？」' },
      { speaker: 'エステバン', text: '「……勘違いすんなよ。ちょうど航路の近くだからだ。わざわざ遠回りするわけじゃねえ。……それでいいなら、付き合ってやる。」' },
      { speaker: 'ナナ', text: '「……うん。ありがとう、エステバン。ぼく、この手紙をちゃんと届けたい。」' },
      { text: 'エステバンは短く鼻を鳴らし、回収した貨物の確認に戻った。' },
      { text: 'その背中を見ながら、ナナは封筒を大切に抱え直した。' },
      { text: '二人は輸送船を後にし、手紙に記された宛先へ向かった。' },
    ], () => { renderStage('freighter'); stageDialogue('ナナ', '「……この手紙を、ぼくが届けたいんだ。」'); }, { image: ch6LetterStill, label: 'CHAPTER 06 / LETTER', title: '届かなかった手紙', fadeInMs: 1500, delayTextMs: 1500, fadeOut: true });
  }

  function chapterSixTravel() {
    root().style.transition = 'opacity 1s';
    root().style.opacity = '0';
    setTimeout(() => {
      root().style.transition = 'none';
      root().style.opacity = '1';
      play([
        { text: '船は手紙に記された宛先へ向かっていた。' },
        { text: 'ナナは助手席で、古い封筒を膝の上に大切に置いている。' },
        { text: 'エステバンは航行端末を確認しながら、静かに操縦を続けていた。' },
        { speaker: 'ナナ', text: '「……ねえ、エステバン。あの人、手紙を受け取ったら、どんな顔をするんだろう。あのクマの子みたいに、嬉しそうに笑ってくれるかな。」' },
        { speaker: 'エステバン', text: '「……さあな。喜ぶかもしれねえし、悲しむかもしれねえ。……人間ってのは、そんなに単純じゃねえんだ。」' },
        { speaker: 'ナナ', text: '「……そっか。でも、どんな顔をしても……ちゃんと渡せたら、ぼくは嬉しいと思う。」' },
        { speaker: 'エステバン', text: '「……ああ。お前がそう思うなら、それでいいんじゃねえか。……結果まで全部、思いどおりになるわけじゃねえしな。」' },
        { text: 'ナナは静かに頷いた。' },
        { text: '第3章の出来事以来、二人の間に残っていたぎこちなさが、ほんの少しだけ薄れていた。' },
        { text: 'やがて、船は古い居住ステーションへ到着した。' },
      ], chapterSixDelivery, { label: 'CHAPTER 06 / TRANSIT', title: '配達先への航路', fadeInMs: 1000, delayTextMs: 1000, fadeOut: true });
    }, 1000);
  }

  function chapterSixDelivery() {
    play([
      { text: '手紙に記された住所は、古びた居住区の一角にあった。' },
      { text: '色褪せた扉の向こうから、ゆっくりと足音が近づいてくる。' },
      { text: 'やがて扉が開き、一人の年老いた女性が姿を見せた。' },
      { speaker: '老婦人', text: '「……どちらさまかしら。こんなところまで、何かご用？」' },
      { speaker: 'ナナ', text: '「……こんにちは。ぼく、ナナっていいます。あの……これ、あなたに届けたくて来ました。」' },
      { text: 'ナナは両手で大切に持っていた封筒を差し出した。' },
      { text: '老婦人は不思議そうにそれを受け取り、宛名を見つめた。' },
      { text: 'その指が、ぴたりと止まる。' },
      { speaker: '老婦人', text: '「……これは……。まさか……この字……。そんな……そんなはずは……。」' },
      { text: '老婦人の手が小さく震え始めた。' },
      { text: '封筒の表面を何度も撫で、差出人の筆跡を確かめる。' },
      { speaker: '老婦人', text: '「……あの人の字だわ。間違いない……。船に乗る前、いつも手紙を書いてくれた……あの人の……。」' },
      { text: '老婦人は封筒を胸に抱きしめた。' },
      { text: '長い年月が経っても、忘れることのできなかった筆跡。' },
      { text: 'もう二度と届かないと思っていた、大切な人からの便りだった。' },
      { speaker: '老婦人', text: '「……帰ったら、一緒に夕陽を見ようって……。いつも、そう言ってくれたの。……もう、帰ってこないって分かっていたのに……。」' },
      { text: '老婦人の頬を涙が伝った。' },
      { text: 'けれど、その顔には、かすかな笑顔が浮かんでいた。' },
      { speaker: 'ナナ', text: '「……泣いてる。でも……少し、嬉しそう。……あのときのクマの子と、同じだ。」' },
      { speaker: '老婦人', text: '「……ありがとう。こんなに長い時間が経ってから……あの人の言葉が、私のところへ帰ってくるなんて……。本当に、ありがとう。」' },
      { speaker: 'ナナ', text: '「……うん。届けられて、よかった。ぼく、この手紙を見つけたとき、どうしてもあなたに渡したいって思ったんだ。」' },
      { text: '老婦人は封筒をもう一度胸に抱きしめた。' },
      { text: 'ナナはその姿を静かに見つめていた。' },
      { text: '人間の感情をすべて理解できたわけではない。' },
      { text: 'それでも、自分が選んだ行動によって、誰かの心に確かに何かが届いたことを感じていた。' },
      { speaker: 'エステバン', text: '「……よかったな、ナナ。どうやら、無駄足じゃなかったみてえだ。」' },
      { speaker: 'ナナ', text: '「……うん。エステバン、連れてきてくれてありがとう。ぼく一人じゃ、ここまで届けられなかった。」' },
      { speaker: 'エステバン', text: '「……礼なら、その人に言ってもらえ。俺は船を出しただけだ。……届けたいって言い出したのは、お前だろ。」' },
      { text: 'ナナはエステバンを見上げた。' },
      { text: 'エステバンは少し照れくさそうに視線をそらした。' },
      { text: 'その仕草を見て、ナナはほんの少しだけ笑った。' },
      { text: 'かつてエステバンは、誰かの形見を仕事として届けたことがあった。' },
      { text: 'あのときは、依頼された物を渡し、報酬を受け取ることしかできなかった。' },
      { text: 'けれど今回は違う。' },
      { text: '報酬も依頼もない。ただ、ナナが届けたいと願ったから、ここまで来た。' },
      { text: '失ったものが戻るわけではない。' },
      { text: '過去の痛みが消えるわけでもない。' },
      { text: 'それでも、誰かのためにできることが、まだ残っている。' },
      { text: 'エステバンはそんなことを、少しだけ考えていた。' },
      { holdStill: 2000 },
    ], chapterSixEpilogue, { image: ch6DeliveryStill, label: 'CHAPTER 06 / DELIVERY', title: '届いた想い', fadeInMs: 1500, delayTextMs: 1500, fadeOut: true, fadeOutMs: 1500 });
  }

  function chapterSixEpilogue() {
    play([
      { text: '手紙を届け終えた二人は、再び宇宙船へ戻っていた。' },
      { text: '船内には、いつもの機械音が静かに響いている。' },
      { text: 'エステバンは操縦席に腰を下ろし、次の仕事の情報を確認していた。' },
      { text: '隣の助手席では、ナナが窓の外に広がる星々を眺めている。' },
      { speaker: 'ナナ', text: '「……ねえ、エステバン。あのおばあさん、最後は笑ってたね。涙も流してたけど……なんだか、とても大切なものを見つけたみたいだった。」' },
      { speaker: 'エステバン', text: '「……ああ。長いこと待ってたんだろうな。あの手紙を。……届いてよかったじゃねえか。」' },
      { speaker: 'ナナ', text: '「……うん。ぼく、嬉しかった。あの人が笑ってくれて……それが、すごく嬉しかったんだ。」' },
      { speaker: 'エステバン', text: '「……そりゃよかったな。お前も少しは、人間のことが分かってきたってことか。」' },
      { speaker: 'ナナ', text: '「……まだ、分からないことばかりだよ。嬉しいのに泣いたり、悲しいのに笑ったり……。でも、もっと知りたいって思う。」' },
      { speaker: 'エステバン', text: '「……そうかい。ま、急いで分かる必要もねえさ。人間だって、自分の気持ちが分からなくなることがあるんだからな。」' },
      { text: 'ナナは少し考えるように首をかしげた。' },
      { text: 'それから、窓の外へ視線を戻した。' },
      { text: '暗い宇宙には、無数の小さな星が輝いている。' },
      { text: 'その間には、古い船の残骸や、誰にも拾われないまま漂い続ける物がある。' },
      { speaker: 'ナナ', text: '「……ねえ、エステバン。また、誰かの大切なものを見つけられるかな。宇宙には、まだたくさん残っているんでしょう？」' },
      { speaker: 'エステバン', text: '「……そりゃもう、山ほどな。ガラクタも、お宝も、くだらねえもんも……。宇宙は広いからな。まだまだ拾いきれねえよ。」' },
      { speaker: 'ナナ', text: '「……そっか。じゃあ、また一緒に探しに行こうよ。今度は、どんなものが見つかるんだろうね。」' },
      { speaker: 'エステバン', text: '「……ったく、お前は本当に物好きだな。……まあ、次の仕事もあるしな。行くとするか。」' },
      { speaker: 'ナナ', text: '「……うん！ エステバン、次はどこへ行くの？」' },
      { speaker: 'エステバン', text: '「……さあな。行ってみなきゃ分からねえ。……それが、この仕事の面白いところだろ。」' },
      { text: 'エステバンは航行端末に次の目的地を入力した。' },
      { text: '船のエンジンが低く唸り、静かに推進力を増していく。' },
      { text: 'ナナは窓の外を見つめながら、小さく笑った。' },
      { text: 'エステバンはそんなナナを一度だけ横目で見て、再び前方へ視線を戻した。' },
      { text: 'かつて、この操縦室にはエステバン一人しかいなかった。' },
      { text: '今は、隣にナナがいる。' },
      { text: 'それだけのことだった。' },
      { text: 'けれど、その小さな違いが、これまでとは少し違う航路を二人に示していた。' },
      { text: '宇宙には、無数の残骸が漂っている。' },
      { text: '壊れた船。忘れられた道具。誰かが大切にしていた、小さな物。' },
      { text: 'その一つひとつに、かつて誰かが生きていた時間が残されている。' },
      { text: 'そして、まだ誰にも届いていない想いが、どこかに眠っている。' },
      { text: '二人のサルベージは、これからも続いていく。' },
    ], showEnd, { image: epilogueStill, label: 'EPILOGUE', title: '小さな光', fadeInMs: 2000, delayTextMs: 2000, fadeOut: true, fadeOutMs: 3000 });
  }

  function showEnd() {
    if (replayMode) return showReplayEnd();
    sequence = null;
    chapterFour().hidden = true;
    window.gameBgm?.setScene(null);
    root().hidden = false;
    root().innerHTML = `<div class="flow-end"><div><span class="flow-kicker">EPILOGUE / 小さな光</span><h1>オービタルサルベージ</h1><p>誰かが大切にしていた、小さな物。<br>二人のサルベージは、これからも続いていく。</p><button class="flow-action" id="flowRestart">最初から</button></div></div>`;
    saveProgress('end');
    document.getElementById('flowRestart').onclick = () => window.gameMenu?.openStartConfirm?.();
  }
  function showReplayEnd(){
    haltTyping(); sequence=null; chapterFour().hidden=true; root().hidden=false;
    window.gameBgm?.setScene(null);
    root().innerHTML='<div class="flow-end"><div><span class="flow-kicker">CHAPTER REPLAY / COMPLETE</span><h1>章の再プレイ完了</h1><p>本編の進行状況は変更されていません。</p><button class="flow-action" id="replayExit">本編に戻る</button></div></div>';
    saveProgress('end');
    document.getElementById('replayExit').onclick=exitReplay;
  }
  function beginReplay(chapter){
    if (replayMode || !chapterOrder.includes(chapter) || !reachedChapters.has(chapter)) return false;
    return beginIsolatedChapter(chapter);
  }
  function beginIsolatedChapter(chapter){
    if(!chapterOrder.includes(chapter))return false;
    const scenes={prologue:'./opening-transport.png',chapter4:'./ch4-arrival.png',arcade:'./ch5-opening.png',freighter:'./ch6-arrival.png'};
    const data={version:1,mode:'story',scene:scenes[chapter],line:0,stage:chapter==='chapter4'?'prologue':chapter,stageData:{},chapter4:{},missionNotice:[],reached:[chapter],completed:[]};
    try { localStorage.setItem(replayKey,JSON.stringify(data));sessionStorage.setItem(replaySessionKey,chapter);location.reload();return true; }
    catch (_) { try {sessionStorage.removeItem(replaySessionKey);} catch (_) {} return false; }
  }
  function exitReplay(){
    if (!replayMode) return;
    try { sessionStorage.removeItem(replaySessionKey);localStorage.removeItem(replayKey); } catch (_) {}
    location.reload();
  }
  function beginFromStart(){
    try {localStorage.removeItem(saveKey);sessionStorage.removeItem(replaySessionKey);localStorage.removeItem(replayKey);location.reload();return true;}
    catch (_) {return false;}
  }
  function menuSaveData(){
    const main=readSave(saveKey);
    const chapter=main?.mode==='chapter4'?'chapter4':main?.stage || 'prologue';
    const rank=Math.max(0,chapterOrder.indexOf(chapter));
    const reached=new Set(main?.reached || chapterOrder.slice(0,rank+1));
    reached.add('prologue');
    const completed=new Set(main?.completed || []);
    if(main?.chapter4?.finished)completed.add('chapter4');
    return {hasSave:!!main,chapter,chapterName:chapterNames[chapter]||chapterNames.prologue,savedAt:main?.savedAt || null,reached:[...reached],completed:[...completed],healthy:saveHealthy,replay:replayMode,replayChapter};
  }
  function openStageJump() {
    detail('開発用：安全な章別テスト', '本編の保存データには触れず、選んだ章を独立した初期状態から確認します。再プレイ終了後は本編へ戻ります。', [
      { label: '戻る', run: closeDetail },
      { label: `${window.chapterDisplay.japanese('prologue')}：最初から音響テスト`, run: () => confirmIsolatedChapter('prologue') },
      { label: `${window.chapterDisplay.japanese('chapter4')}：最初から音響テスト`, run: () => confirmIsolatedChapter('chapter4') },
      { label: `${window.chapterDisplay.japanese('arcade')}：探索・修理・ヒーロー映像テスト`, run: () => confirmIsolatedChapter('arcade') },
      { label: `${window.chapterDisplay.japanese('freighter')}：探索からエピローグまでテスト`, run: () => confirmIsolatedChapter('freighter') },
      ...(replayMode && replayChapter==='freighter'?[{ label: `${window.chapterDisplay.japanese('freighter')}・安全制御を再テスト（再プレイ限定）`, run: confirmCargoSafetyRetest }]:[]),
    ]);
  }
  function confirmIsolatedChapter(chapter){
    detail('開発用：章別テストを開始', 'この章の新しいテスト記録を開始します。本編のセーブ・回収品・設定は保持されます。現在の再プレイ内容は破棄されます。', [
      {label:'キャンセル',run:openStageJump},
      {label:'本編を保護してテスト開始',primary:true,run:()=>{
        if(!beginIsolatedChapter(chapter))detail('テストを開始できませんでした','保存領域の設定を確認してください。',[{label:'戻る',run:openStageJump}]);
      }},
    ]);
  }
  function confirmCargoSafetyRetest() {
    detail(`開発用：${window.chapterDisplay.japanese('freighter')}の安全制御を再テスト`, '貨物伝票・固定ベルト・安全制御・旧保管表示の調査状態だけを未クリアに戻します。回収品、認証カード、手紙、各章の物語は残ります。続けますか？', [
      {label:'戻る',run:openStageJump},
      {label:'安全制御だけ初期化する',primary:true,run:()=>{
        const state=st('freighter');
        for(const key of ['cargoSupport','cargoLatch','cargoShifted','cargoStorageRead','cargoHintLevel']) delete state[key];
        for(const key of ['log','straps','safety-panel','cargo-safety-complete','cargo-storage']) state.seen.delete(key);
        renderStage('freighter'); // 既存の持ち物・回収品・手紙フラグは保持して自動セーブ
      }},
    ]);
  }
  window.storyGame = { start: restoreGame, enterChapterFour, afterChapterFour, openStageJump, saveProgress,
    menuSaveData, beginReplay, exitReplay, beginFromStart, readSettings, updateSettings,
    reset: () => window.gameMenu?.openStartConfirm?.() };
})();
