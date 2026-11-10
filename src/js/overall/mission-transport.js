(() => {
  'use strict';
  // One owner. Codec bodies remain in uplink-motion.js; no legacy UI installation.
  window.createMissionTransport = (onChange) => {
    const C=window.UplinkCodec,M=window.AutonomousMissionModel;
    let generation=0,seq=0,active=null,pending=null,channel=null,seenDue=0,lastClock=0;
    const timers=new Set();let events=[],latestTx=null,rx=null,phase='idle',posts=0,receipts=0,coalesced=0;
    const config={dropFirst:false,lossAll:false,delay:120};
    const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join(' ');
    function note(type,job,extra={}){events.push({type,generation,seq:job?.seq,hex:job?.hex,sampleId:job?.sampleId,snapshotId:job?.snapshotId,...extra,source:{...M.source('telemetry-lineage'),browserHelper:'src/js/overall/mission-transport.js::'+(type==='callback'?'port2.onmessage':type==='commit'?'port2.onmessage DOM callback':type==='queue'?'begin':type==='coalesce'?'offer':'attempt')}});if(events.length>80)events.shift();}
    function snapshot(){return M.clone({generation,seq,phase,active:active?{seq:active.seq,hex:active.hex,value:active.value,attempt:active.attempt}:null,pending:pending?{sampleId:pending.sampleId,snapshotId:pending.snapshotId}:null,latestTx,rx,stale:!!rx&&lastClock-rx.modelMs>=3000,posts,receipts,coalesced,events,config});}
    const changed=()=>onChange(snapshot());
    function later(fn,ms){const g=generation,id=setTimeout(()=>{timers.delete(id);if(g===generation)fn();},ms);timers.add(id);}
    function retire(){if(channel){channel.port1.close();channel.port2.close();channel=null;}}
    function finish(){retire();active=null;changed();if(pending){const p=pending;pending=null;begin(p);}}
    function attempt(){const j=active;if(!j)return;j.attempt++;const drop=config.lossAll||(config.dropFirst&&j.attempt===1);phase=drop?'drop':'posted';note(drop?'drop':'post',j,{attempt:j.attempt});changed();
      if(drop){later(()=>{if(j!==active)return;if(j.attempt<3){phase='retry';changed();attempt();}else{phase='failed';note('failed',j);finish();}},config.delay);return;}
      retire();const g=generation;channel=new MessageChannel();const ch=channel;
      ch.port2.onmessage=e=>{if(g!==generation||active!==j)return;receipts++;const d=C.decodeTelemetry(e.data);note('callback',j,{receivedHex:hex(e.data),decoded:d});
        if(!d){phase='invalid';finish();return;}
        phase='decoded';changed();later(()=>{if(g!==generation||active!==j)return;rx={sequence:d.sequence_number,value:d.water_turbidity,decoded:d,hex:hex(e.data),sampleId:j.sampleId,snapshotId:j.snapshotId,modelMs:j.clockMs};phase='shore';note('commit',j,{decoded:d});changed();finish();},config.delay);
      };
      // Modeled loss was evaluated BEFORE this real post; every retry reuses immutable bytes.
      const copy=j.bytes.slice(0);posts++;ch.port1.postMessage(copy,[copy]);
      note('post-return',j,{detachedByteLength:copy.byteLength});
    }
    function begin(s){const number=++seq,packet=M.telemetry(s,number),bytes=C.encodeTelemetry(packet);active={seq:number,bytes,hex:hex(bytes),value:packet.water_turbidity,sampleId:s.sampleId,snapshotId:s.snapshotId,clockMs:s.clockMs,attempt:0};latestTx={seq:number,hex:active.hex,value:active.value,sampleId:s.sampleId,snapshotId:s.snapshotId};phase='queued';note('queue',active);changed();later(attempt,config.delay);}
    function offer(s,force=false){lastClock=s.clockMs;if(!force&&s.txDue<=seenDue)return;seenDue=s.txDue;const snap=M.snapshot(s);if(active){if(pending)coalesced++;pending=snap;note('coalesce',active,{pendingSnapshotId:s.snapshotId});changed();}else begin(snap);}
    function reset(){generation++;timers.forEach(clearTimeout);timers.clear();retire();active=null;pending=null;seq=0;seenDue=0;lastClock=0;events=[];latestTx=null;rx=null;phase='idle';posts=0;receipts=0;coalesced=0;changed();}
    return Object.freeze({offer,snapshot,reset,configure:changes=>{Object.assign(config,changes);changed();},close:reset});
  };
})();
