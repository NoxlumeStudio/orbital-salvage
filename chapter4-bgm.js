/* Original score controller, retaining the legacy script URL. */
(() => {
  'use strict';
  const files = {
    prologue: './OS_BGM_CH01_EXPLORATION_BITTERSWEET_COSMOS_v3.mp3',
    chapter4: './OS_BGM_CH04_MEMORY_MATCH_NOSTALGIC_LULLABY_v3.mp3',
    arcade: './OS_BGM_CH05_HERO_ANIME_RETRO_8BIT_v2.mp3',
    freighter: './OS_BGM_CH06_LETTER_EMOTIONAL_PIANO_v2.mp3',
    epilogue: './OS_BGM_EPILOGUE_HOPEFUL_DAWN_v2.mp3',
  };
  const FADE_MS=1700, EPILOGUE_FADE_MS=2400, TICK_MS=40;
  const trims={prologue:1,chapter4:1.35,arcade:1,freighter:1,epilogue:1};
  const tracks=new Map(), envelopes=new Map();
  let current=null, context='explore', duckUntil=0, timer=null, lastTick=Date.now();
  let duckingPrevious=false, sequentialUntil=0;
  const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
  function getTrack(id){
    if(!tracks.has(id)){
      const audio=new Audio(files[id]);audio.loop=true;audio.preload='none';audio.volume=0;
      tracks.set(id,audio);envelopes.set(id,{gain:0,target:0});
    }
    return tracks.get(id);
  }
  function level(){
    const s=window.storyGame?.readSettings?.()||{};
    return s.mute||s.bgmMute||document.hidden?0:clamp((s.master??70)/100)*clamp((s.bgm??40)/100);
  }
  function desiredGain(){
    const sceneGain=current==='arcade'?(context==='hero'?.78:context==='explore'?.14:.24):context==='story'?.4:1;
    const gain=level()*sceneGain*(trims[current]||1)*(Date.now()<duckUntil?.30:1);
    return clamp(gain);
  }
  function stopTimer(){if(timer)clearInterval(timer);timer=null;}
  function startTimer(){if(!timer){lastTick=Date.now();timer=setInterval(tick,TICK_MS);}}
  function tick(){
    const now=Date.now(),elapsed=Math.min(100,Math.max(0,now-lastTick));lastTick=now;
    let fading=false;
    const ducking=now<duckUntil;
    const waiting=now<sequentialUntil;
    for(const [id,audio] of tracks){
      const env=envelopes.get(id);env.target=id===current&&!waiting?desiredGain():0;
      const duration=ducking?400:duckingPrevious?650:waiting||current==='epilogue'?EPILOGUE_FADE_MS:FADE_MS;
      const delta=Math.max(.00001,elapsed/duration);
      if(Math.abs(env.gain-env.target)<=delta)env.gain=env.target;
      else env.gain+=Math.sign(env.target-env.gain)*delta;
      audio.volume=clamp(env.gain);
      if(env.gain>0&&audio.paused&&!document.hidden&&id===current)audio.play().catch(()=>{});
      if(env.gain===0&&id!==current&&!audio.paused){audio.pause();audio.currentTime=0;}
      if(env.gain!==env.target)fading=true;
    }
    duckingPrevious=ducking;
    if(fading||waiting||ducking)startTimer();else stopTimer();
  }
  function sync(){
    const target=Date.now()<sequentialUntil?0:desiredGain();
    for(const [id,audio] of tracks){
      envelopes.get(id).target=id===current?target:0;
      if(id===current&&target>0&&audio.paused)audio.play().catch(()=>{});
      if(target===0&&id===current)audio.pause();
    }
    startTimer();
  }
  function setScene(chapter,mode='explore'){
    const next=files[chapter]?chapter:null;
    context=mode;
    if(next!==current){
      sequentialUntil=current==='freighter'&&next==='epilogue'?Date.now()+EPILOGUE_FADE_MS:0;
      current=next;if(next)getTrack(next);
    }
    window.gameSfx?.setScene(next,mode);
    sync();
  }
  function duck(ms=900){duckUntil=Math.max(duckUntil,Date.now()+ms);sync();}
  document.addEventListener('pointerdown',()=>{if(current)sync();},{passive:true});
  document.addEventListener('keydown',()=>{if(current)sync();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)for(const audio of tracks.values())audio.pause();
    sync();
  });
  window.gameBgm={setScene,sync,duck};
  window.chapterFourBgm={setActive:on=>setScene(on?'chapter4':null),sync,duck};
})();
