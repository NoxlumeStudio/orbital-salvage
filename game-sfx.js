/* Quiet synthetic interface, mechanical and interior ambience. No external audio assets. */
(() => {
  'use strict';
  const AudioType = window.AudioContext || window.webkitAudioContext;
  let ctx, noiseBuffer, ambience, ambienceGain, activeChapter=null, activeMode='story';
  const last=new Map();
  const clamp=x=>Math.max(0,Math.min(1,Number(x)||0));
  const prefs=()=>window.storyGame?.readSettings?.()||{};
  const master=()=>{const s=prefs();return s.mute?0:clamp((s.master??70)/100);};
  const effects=()=>master()*clamp((prefs().effects??70)/100);
  const ambientLevel=()=>master()*clamp((prefs().ambient??35)/100);
  function context(){
    if(!AudioType)return null;
    try{ctx ||= new AudioType();ctx.resume?.().catch?.(()=>{});return ctx;}catch(_){return null;}
  }
  function tone(frequency,duration,amp,shape='sine',offset=0,to=frequency){
    if(!ctx)return;
    const start=ctx.currentTime+offset,o=ctx.createOscillator(),g=ctx.createGain();
    o.type=shape;o.frequency.setValueAtTime(frequency,start);
    o.frequency.exponentialRampToValueAtTime(Math.max(20,to),start+duration);
    g.gain.setValueAtTime(.00001,start);
    g.gain.exponentialRampToValueAtTime(Math.max(.00001,amp),start+.014);
    g.gain.exponentialRampToValueAtTime(.00001,start+duration);
    o.connect(g);g.connect(ctx.destination);o.start(start);o.stop(start+duration+.01);
  }
  function hiss(duration,amp,cutoff=500,offset=0){
    if(!ctx)return;
    if(!noiseBuffer){
      noiseBuffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
      const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    }
    const t=ctx.currentTime+offset,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=noiseBuffer;source.loop=true;filter.type='lowpass';filter.frequency.value=cutoff;
    gain.gain.setValueAtTime(.00001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.00001,amp),t+.025);
    gain.gain.exponentialRampToValueAtTime(.00001,t+duration);
    source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);source.start(t);source.stop(t+duration+.01);
  }
  const patterns={
    ui:(v)=>tone(650,.045,v*.022),
    touch:v=>tone(420,.06,v*.025,'triangle',0,320),
    scan:v=>{tone(760,.15,v*.048,'sine',0,1250);tone(1100,.12,v*.02,'sine',.1,1500);},
    scanDone:v=>tone(1080,.12,v*.035,'sine',0,840),
    clue:v=>{tone(610,.13,v*.044);tone(830,.2,v*.035,'sine',.1);},
    success:v=>{tone(520,.16,v*.052);tone(780,.23,v*.05,'sine',.16);},
    trace:v=>{
      [540,660,780].forEach((frequency,i)=>tone(frequency,.13,v*.038,'sine',i*.34,frequency*1.07));
      tone(620,.32,v*.058,'sine',1.06,820);
      tone(930,.4,v*.044,'sine',1.18,1040);
    },
    error:v=>tone(225,.19,v*.043,'triangle',0,155),
    collect:v=>{tone(330,.07,v*.049,'triangle',0,230);tone(680,.1,v*.032,'sine',.1);},
    journal:v=>tone(720,.07,v*.023),
    close:v=>tone(510,.055,v*.016),
    metal:v=>{tone(260,.11,v*.053,'triangle',0,120);hiss(.11,v*.016,1700);},
    unlock:v=>{tone(310,.09,v*.05,'triangle');tone(185,.21,v*.05,'triangle',.12,105);hiss(.22,v*.012,700,.12);},
    paper:v=>hiss(.09,v*.012,1800),
    bootFail:v=>{tone(220,.12,v*.032,'sawtooth',0,100);hiss(.12,v*.012,650);},
    power:v=>{tone(160,.12,v*.035,'triangle',0,285);tone(620,.15,v*.033,'sine',.13,810);},
    diagnose:v=>{tone(480,.09,v*.028);tone(680,.09,v*.028,'sine',.12);tone(240,.18,v*.024,'triangle',.25);},
    standby:v=>tone(460,.28,v*.035,'triangle',0,120),
    repair:v=>{tone(310,.12,v*.045,'triangle');tone(690,.16,v*.045,'sine',.16);},
    startup:v=>{tone(115,.5,v*.045,'triangle',0,245);hiss(.5,v*.028,950);tone(680,.2,v*.045,'sine',.52,860);},
    cargoMove:v=>{hiss(1.38,v*.026,420);tone(85,1.4,v*.042,'triangle',0,115);tone(220,.16,v*.038,'triangle',1.43,115);},
    storage:v=>{tone(510,.11,v*.03);tone(720,.15,v*.026,'sine',.11);},
    glass:v=>tone(1260,.07,v*.011,'sine'),
    device:v=>{hiss(.10,v*.015,1700);tone(600,.15,v*.03,'triangle',.08,430);},
  };
  const cooldowns={ui:80,touch:90,scan:350,scanDone:300,clue:500,success:600,trace:2200,error:350,collect:350,journal:120,close:120,metal:250,unlock:750,paper:250,bootFail:400,power:450,diagnose:450,standby:350,repair:500,startup:1300,cargoMove:1500,storage:450,glass:300,device:450};
  function play(name){
    try{
      const fn=patterns[name],volume=effects(),now=performance.now();
      if(!fn||volume<=0||document.hidden||now-(last.get(name)||-1e6)<(cooldowns[name]||100))return false;
      if(!context())return false;
      last.set(name,now);fn(volume);return true;
    }catch(_){return false;}
  }
  function stopAmbience(){
    if(!ambience)return;
    const old=ambience,oldGain=ambienceGain;
    ambience=null;ambienceGain=null;
    try{oldGain.gain.setTargetAtTime(.00001,ctx.currentTime,.16);old.stop(ctx.currentTime+.9);}catch(_){}
  }
  function syncAmbience(){
    try{
      const volume=ambientLevel()*(activeMode==='explore'&&!document.hidden?.007:0);
      if(ambienceGain)ambienceGain.gain.setTargetAtTime(Math.max(.00001,volume),ctx.currentTime,.22);
    }catch(_){}
  }
  function setScene(chapter,mode='story'){
    const changed=chapter!==activeChapter;
    activeChapter=chapter;activeMode=mode;
    if(changed)stopAmbience();
    if(chapter&&mode==='explore'&&!ambience&&ambientLevel()>0){
      try{
        const ac=context();if(!ac)return;
        if(!noiseBuffer){noiseBuffer=ac.createBuffer(1,ac.sampleRate,ac.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
        const src=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain();
        src.buffer=noiseBuffer;src.loop=true;filter.type='lowpass';
        filter.frequency.value=({prologue:110,chapter4:175,arcade:240,freighter:95,epilogue:85})[chapter]||140;
        gain.gain.value=.00001;src.connect(filter);filter.connect(gain);gain.connect(ac.destination);
        src.start();ambience=src;ambienceGain=gain;
      }catch(_){}
    }
    syncAmbience();
  }
  // Reclaim audio permission only after a gesture, never block story progress.
  document.addEventListener('pointerdown',()=>{if(activeChapter&&activeMode==='explore'&&!ambience)setScene(activeChapter,'explore');},{passive:true});
  document.addEventListener('visibilitychange',syncAmbience);
  document.addEventListener('click',e=>{
    if(e.defaultPrevented)return;
    const btn=e.target.closest?.('button');if(!btn||btn.disabled)return;
    if(btn.matches('#nanaScanner,#flowScanToggle')){play(btn.getAttribute('aria-pressed')==='true'?'scanDone':'scan');return;}
    if(btn.matches('#flowJournal,#journalBtn')){play('journal');return;}
    if(btn.matches('#collectBtn,#teddyCollect')){play('collect');return;}
    if(btn.matches('#openDoor,#doorHandle')){play('metal');return;}
    if(btn.matches('.flow-hotspot,.hotspot,.flow-storage-marker'))return;
    if(btn.matches('[data-detail]')&&/戻る|閉じる/.test(btn.textContent)){play('close');return;}
    if(btn.matches('#storySkip,#storyAdvance,#storyReveal,#dialogueNext'))return;
    play('ui');
  },true);
  window.gameSfx={play,setScene,sync:syncAmbience};
})();
