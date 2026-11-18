/* Two fingers transform the whole desktop canvas, not an individual game image.
   Single-finger clicks and game drags retain the original handlers. */
(()=>{if(window.parent===window)return;let active=false,start=null,blockedUntil=0,locked=false;const points=new Map();
 const send=data=>window.parent.postMessage(data,location.origin);
 window.addEventListener('message',e=>{if(e.source!==window.parent||e.origin!==location.origin||e.data?.type!=='whole-canvas-mode')return;active=e.data.active===true;document.documentElement.toggleAttribute('data-whole-canvas-phone',active);if(!active){points.clear();start=null;locked=false}});
 const pair=()=>{const a=[...points.values()];return {distance:Math.hypot(a[0].sx-a[1].sx,a[0].sy-a[1].sy),sx:(a[0].sx+a[1].sx)/2,sy:(a[0].sy+a[1].sy)/2,x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}};
 const point=e=>({sx:e.screenX,sy:e.screenY,x:e.clientX,y:e.clientY,target:e.target});
 window.addEventListener('pointerdown',e=>{if(!active||e.pointerType!=='touch')return;points.set(e.pointerId,point(e));if(points.size===2){start=pair();locked=true;blockedUntil=performance.now()+600;send({type:'whole-canvas-pinch-start',x:start.x,y:start.y});for(const [id,p] of points)if(id!==e.pointerId)p.target.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:id,pointerType:'touch'}));e.stopImmediatePropagation()}},{capture:true});
 window.addEventListener('pointermove',e=>{if(!active||e.pointerType!=='touch'||!points.has(e.pointerId))return;points.set(e.pointerId,point(e));if(locked){e.stopImmediatePropagation();if(start&&points.size===2){const p=pair();send({type:'whole-canvas-pinch',ratio:p.distance/Math.max(1,start.distance),dx:p.sx-start.sx,dy:p.sy-start.sy})}}},{capture:true});
 const finish=e=>{if(!active||e.pointerType!=='touch')return;if(e.type==='pointercancel'&&!e.isTrusted)return;points.delete(e.pointerId);if(locked){e.stopImmediatePropagation();blockedUntil=performance.now()+500;if(points.size===0){start=null;locked=false;send({type:'whole-canvas-pinch-end'})}}};window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',finish,true);
 window.addEventListener('touchmove',e=>{if(active&&locked)e.preventDefault()},{capture:true,passive:false});window.addEventListener('click',e=>{if(active&&performance.now()<blockedUntil){e.preventDefault();e.stopImmediatePropagation()}},true);
})();
