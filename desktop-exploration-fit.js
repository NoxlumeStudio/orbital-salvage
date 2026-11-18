/* Presentation only. No reads or writes to game state, save data, or camera coordinates. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else api.mount(root)})(typeof window!=='undefined'?window:globalThis,()=>{
 'use strict';
 const ratio=1672/941;
 function artSize({viewportHeight,bodyTop,paddingBottom,extraHeight,mainWidth}){
  const budget=Math.max(0,Math.floor(viewportHeight-bodyTop-paddingBottom-4));
  const height=Math.max(0,Math.min(mainWidth/ratio,budget-extraHeight));
  return {budget,width:Math.floor(height*ratio),height};
 }
 function moveDialogue(node,side,desktop,origins){
  if(!node)return;
  if(desktop){if(node.parentNode!==side){if(!origins.has(node))origins.set(node,{parent:node.parentNode,next:node.nextSibling});side.appendChild(node)}}
  else{const origin=origins.get(node);if(origin&&origin.parent.isConnected&&node.parentNode!==origin.parent){origin.parent.insertBefore(node,origin.next?.parentNode===origin.parent?origin.next:null);origins.delete(node)}}
 }
 function disclosure(doc,node,kind,caption,desktop){
  if(!node)return;const existing=node.closest('details.'+kind);
  if(desktop&&!existing){const details=doc.createElement('details'),summary=doc.createElement('summary');details.className=kind;summary.textContent=caption;node.parentNode.insertBefore(details,node);details.appendChild(summary);if(kind==='exploration-camera-help'){const content=doc.createElement('div');content.appendChild(node);details.appendChild(content)}else details.appendChild(node)}
  else if(!desktop&&existing)existing.replaceWith(node);
 }
 function mount(win){
  const doc=win.document,origins=new WeakMap(),labels=new WeakMap(),scanHints=new WeakMap();let scheduled=0;
  function fit(){
   scheduled=0;const height=Math.min(win.innerHeight,win.visualViewport?.height||win.innerHeight),width=doc.documentElement.clientWidth,desktop=width>=1000&&height>=560;
   doc.documentElement.style.removeProperty('--exploration-menu-top');doc.documentElement.style.removeProperty('--exploration-menu-right');
   for(const wrap of doc.querySelectorAll('.flow-wrap,#gameApp')){
    if(wrap.hidden||!wrap.getClientRects().length)continue;
    const body=wrap.querySelector('.flow-body,.layout'),art=wrap.querySelector('.flow-art,.explore-viewport');if(!body||!art)continue;
    const main=origins.get(art)?.parent||art.parentNode,side=body.querySelector('.flow-side,.side');if(!main||!side)continue;
    const dialogue=wrap.querySelector('.flow-dialogue,.dialogue');
    const location=wrap.querySelector('.flow-location,.location'),toolbar=wrap.querySelector('.flow-camera-toolbar,.explore-toolbar'),controls=wrap.querySelector('.flow-controls,.top>.tools,.exploration-command-row>.tools');
    // Snapshot sibling order before moving any node (including the art).
    if(desktop)for(const node of [location,toolbar,art,dialogue,controls])if(node&&!origins.has(node))origins.set(node,{parent:node.parentNode,next:node.nextSibling});
    // All chapters use the art itself as the grid item, never a legacy wrapper.
    main.classList.toggle('exploration-art-origin',desktop);
    moveDialogue(art,body,desktop,origins);
    moveDialogue(dialogue,body,desktop,origins);
    disclosure(doc,wrap.querySelector('.flow-camera-toolbar>span,.explore-toolbar>.explore-note,.exploration-camera-help>div>span'), 'exploration-camera-help','操作方法',desktop);
    disclosure(doc,wrap.querySelector('.flow-tool-help'),'exploration-tool-help','道具の使い方',false);
    let commandRow=body.querySelector('.exploration-command-row');
    if(desktop){
     if(!commandRow){commandRow=doc.createElement('div');commandRow.className='exploration-command-row';body.insertBefore(commandRow,main)}
     for(const node of [location,toolbar,controls])if(node)moveDialogue(node,commandRow,true,origins);
    }else{
     // Reverse order restores the location before its original toolbar sibling.
     for(const node of [controls,toolbar,location])if(node)moveDialogue(node,null,false,origins);
     commandRow?.remove();commandRow=null;
    }

    const cameraHelp=wrap.querySelector('.exploration-camera-help>div');
    const scanHint=scanHints.get(wrap)||wrap.querySelector('.flow-side .flow-pane:last-of-type p[style]');
    if(scanHint){scanHints.set(wrap,scanHint);moveDialogue(scanHint,cameraHelp,desktop&&!!cameraHelp,origins)}
    for(const label of wrap.querySelectorAll('.flow-scan-mode,.chapter4-scan-mode,.flow-tools-heading,.flow-location>span:first-child,.location>span:first-child')){
     if(!labels.has(label))labels.set(label,label.textContent);
     const full=labels.get(label),short=desktop?full.split('/').pop().trim():full;if(label.textContent!==short)label.textContent=short;label.title=full;
    }
    wrap.style.removeProperty('width');body.style.removeProperty('--exploration-art-column');
    if(!desktop){art.style.removeProperty('width');for(const key of ['--exploration-height','--exploration-command-height','--exploration-art-height'])body.style.removeProperty(key);continue}
    // Keep the common command row, art and dialogue within the viewport.
    // Remaining width belongs to the information column, not blank outer margins.
    for(let pass=0;pass<4;pass++){
     const px=v=>parseFloat(v)||0,style=win.getComputedStyle(wrap),bodyStyle=win.getComputedStyle(body);
     const dialogueHeight=dialogue?dialogue.getBoundingClientRect().height+px(bodyStyle.rowGap):0;
     const commandBoxHeight=commandRow?commandRow.getBoundingClientRect().height:0;
     body.style.setProperty('--exploration-command-height',commandBoxHeight+'px');
     const commandHeight=commandBoxHeight+(commandRow?px(bodyStyle.rowGap):0);
     const result=artSize({viewportHeight:height,bodyTop:body.getBoundingClientRect().top,paddingBottom:px(style.paddingBottom),extraHeight:dialogueHeight+commandHeight,mainWidth:px(bodyStyle.gridTemplateColumns)});
     body.style.setProperty('--exploration-height',Math.max(0,result.budget-dialogueHeight)+'px');
     body.style.setProperty('--exploration-art-height',Math.floor(result.width)/ratio+'px');
     const target=result.width+'px';
     if(art.style.width===target&&body.style.getPropertyValue('--exploration-art-column')===target)break;
     art.style.width=target;body.style.setProperty('--exploration-art-column',target);
    }
    const header=wrap.querySelector('.flow-head,.top');
    if(header){const rect=header.getBoundingClientRect();doc.documentElement.style.setProperty('--exploration-menu-right',Math.max(4,width-rect.right+2)+'px');doc.documentElement.style.setProperty('--exploration-menu-top',Math.max(4,rect.top)+'px')}

   }
  }
  function schedule(){if(!scheduled)scheduled=win.requestAnimationFrame(fit)}
  win.addEventListener('resize',schedule,{passive:true});win.visualViewport?.addEventListener('resize',schedule,{passive:true});
  const observer=new win.MutationObserver(schedule);observer.observe(doc.body,{childList:true,subtree:true});
  doc.addEventListener('toggle',schedule,true);if(doc.fonts?.ready)doc.fonts.ready.then(schedule);schedule();
 }
 return {artSize,moveDialogue,mount};
});
