/** Rendering only: authoritative room objects are never modified. */
class MotionView {
  constructor() { this.clear(); }
  clear() { this.frames=[]; this.local=null; this.lastTime=null; this.code=null; }
  receive(room, localId, now) {
    if(this.code!==room.code || room.phase!=='started') this.clear();
    this.code=room.code;
    const objects=(room.objects??room.players).map(o=>({...o}));
    this.frames.push({time:now,objects});
    while(this.frames.length>12) this.frames.shift();
    const me=objects.find(o=>o.id===localId);
    if(me && (!this.local || Math.hypot(me.x-this.local.x,me.y-this.local.y)>200)) this.local={x:me.x,y:me.y,facing:me.facing};
  }
  sample(localId, input, now) {
    const latest=this.frames.at(-1); if(!latest) return [];
    const dt=this.lastTime===null?0:Math.max(0,Math.min((now-this.lastTime)/1000,.05));this.lastTime=now;
    const renderAt=now-75;
    let a=this.frames[0],b=latest;
    for(const frame of this.frames) { if(frame.time<=renderAt) a=frame; if(frame.time>=renderAt) { b=frame;break; } }
    const t=b.time>a.time?Math.max(0,Math.min(1,(renderAt-a.time)/(b.time-a.time))):1;
    const old=new Map(a.objects.map(o=>[o.id,o])),next=new Map(b.objects.map(o=>[o.id,o]));
    return latest.objects.map(object=>{
      if(object.id===localId && this.local) {
        const s=object.status,blocked=s?.stunned||s?.state==='dead'||now-latest.time>250;
        const length=Math.max(1,Math.hypot(input.x,input.y));
        const vx=blocked?0:input.x/length,vy=blocked?0:input.y/length;
        const speed=(s?.effective?.moveSpeed??Math.max(0,(s?.moveSpeed??2)+(s?.bonusMoveSpeed??0)))*110;
        this.local.x+=vx*speed*dt;this.local.y+=vy*speed*dt;
        // A bounded one-tick lead masks snapshot latency without changing gameplay.
        const lead=blocked?0:Math.min(Math.max(0,now-latest.time)+50,150)/1000;
        const targetX=object.x+vx*speed*lead,targetY=object.y+vy*speed*lead;
        const alpha=1-Math.exp(-10*dt);
        this.local.x+=(targetX-this.local.x)*alpha;this.local.y+=(targetY-this.local.y)*alpha;
        this.local.x=Math.max(-1500,Math.min(1500,this.local.x));this.local.y=Math.max(-1500,Math.min(1500,this.local.y));
        if(vx||vy) this.local.facing=Math.atan2(vy,vx);
        return {...object,...this.local};
      }
      const from=old.get(object.id),to=next.get(object.id);
      if(!from||!to||Math.hypot(to.x-from.x,to.y-from.y)>200) return {...object};
      const angle=(to.facing??0)-(from.facing??0),turn=Math.atan2(Math.sin(angle),Math.cos(angle));
      return {...object,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,facing:(from.facing??0)+turn*t};
    });
  }
}
