(()=>{'use strict';
const socket=io({reconnection:true});let room='lobby',localStream=null,muted=true,listen=true;const pcs=new Map(),audios=new Map(),pending=new Map();let peers=[];
const status=document.createElement('div');status.id='onlineStatus';status.style.cssText='position:fixed;top:10px;left:10px;z-index:100;background:#12243deF;color:#fff;border:1px solid #7088a8;border-radius:9px;padding:9px 12px;font:12px sans-serif';document.body.append(status);
const info=document.createElement('div');info.style.cssText='font-size:11px;color:#a5e9c6;padding:5px';document.querySelector('#voicePanel').append(info);
const warning=document.querySelector('#voicePanel .warning');warning.textContent='실시간 음성 베타: HTTPS/localhost 필수. 일부 네트워크에서는 TURN 서버가 필요해.';
function show(){status.textContent=`${socket.connected?'🟢 서버 연결':'🔴 서버 연결 끊김'} · ${peers.length}명 접속`;info.textContent=`같은 채널 ${peers.length}명 · 내 마이크 ${muted?'OFF':'ON'} · 듣기 ${listen?'ON':'OFF'}`;}
function profile(){return {nick:document.querySelector('#nickname').value.trim()||'축구팬',club:document.querySelector('#team').value,gender:document.querySelector('#avatarGender').value,channel:room};}
function clearPeers(){for(const pc of pcs.values())pc.close();pcs.clear();for(const a of audios.values())a.remove();audios.clear();pending.clear();}
function join(){clearPeers();if(!socket.connected)return;socket.emit('profile:join',profile(),r=>{if(!r?.ok)status.textContent='입장 실패: '+(r?.error||'오류');else{show();socket.emit('voice:state',!muted);}});}
socket.on('connect',join);socket.on('disconnect',()=>{peers=[];clearPeers();show();});
socket.on('room:peers',list=>{const old=new Set(peers.map(p=>p.id));peers=list;const ids=new Set(list.map(p=>p.id));for(const id of [...pcs.keys()])if(!ids.has(id)){pcs.get(id).close();pcs.delete(id);audios.get(id)?.remove();audios.delete(id);}show();if(localStream)for(const p of list){if(p.id!==socket.id&&!old.has(p.id)&&socket.id<p.id)call(p.id);}});
socket.on('chat:message',d=>{const p=document.createElement('p');p.textContent=`⚽ [${d.club}] ${d.nick}: ${d.message}`;const box=document.querySelector('#messages');box.append(p);box.scrollTop=box.scrollHeight;});
const msg=document.querySelector('#message');function sendNetwork(){const v=msg.value.trim().slice(0,200);if(v&&socket.connected){socket.emit('chat:send',v);msg.value='';}else if(!socket.connected)status.textContent='서버 연결 후 채팅 가능';}
document.querySelector('#send').addEventListener('click',e=>{e.stopImmediatePropagation();sendNetwork();},true);
msg.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();sendNetwork();}},true);
// Prevent the old local-only send() key handler from running on Enter.
window.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.activeElement===msg)e.stopImmediatePropagation();},true);
const voiceChannel=document.querySelector('#voiceChannel');voiceChannel.addEventListener('change',()=>{room=voiceChannel.value;join();},true);
for(const id of ['team','leagueSelect','nickname','avatarGender'])document.getElementById(id)?.addEventListener('change',()=>setTimeout(join,0));
const micBtn=document.querySelector('#micToggle'),speakerBtn=document.querySelector('#speakerToggle');
function getPC(id){if(pcs.has(id))return pcs.get(id);const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});pcs.set(id,pc);
 pc.onicecandidate=e=>{if(e.candidate)socket.emit('rtc:signal',{to:id,candidate:e.candidate});};
 pc.ontrack=e=>{let a=audios.get(id);if(!a){a=document.createElement('audio');a.autoplay=true;a.playsInline=true;document.body.append(a);audios.set(id,a);}a.srcObject=e.streams[0];a.muted=!listen;a.play().catch(()=>{});};
 pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState)){pc.close();pcs.delete(id);}};
 if(localStream)for(const track of localStream.getTracks())pc.addTrack(track,localStream);return pc;}
 async function call(id){try{const pc=getPC(id);const offer=await pc.createOffer();await pc.setLocalDescription(offer);socket.emit('rtc:signal',{to:id,description:pc.localDescription});}catch(e){console.warn('RTC offer',e);}}
 socket.on('rtc:signal',async({from,description,candidate})=>{if(!peers.some(p=>p.id===from))return;try{const pc=getPC(from);if(description){await pc.setRemoteDescription(description);if(description.type==='offer'){const answer=await pc.createAnswer();await pc.setLocalDescription(answer);socket.emit('rtc:signal',{to:from,description:pc.localDescription});}for(const c of pending.get(from)||[])await pc.addIceCandidate(c);pending.delete(from);}else if(candidate){if(pc.remoteDescription)await pc.addIceCandidate(candidate);else pending.set(from,[...(pending.get(from)||[]),candidate]);}}catch(e){console.warn('RTC signaling',e);}});
 micBtn.addEventListener('click',async e=>{e.stopImmediatePropagation();if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;muted=true;clearPeers();socket.emit('voice:state',false);micBtn.textContent='🎙️ 마이크 켜기';show();return;}
 try{localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});muted=false;micBtn.textContent='🔴 마이크 끄기';socket.emit('voice:state',true);for(const p of peers)if(p.id!==socket.id&&socket.id<p.id)call(p.id);show();}catch(err){status.textContent='마이크 권한 또는 HTTPS 확인 필요';}},true);
 speakerBtn.addEventListener('click',e=>{e.stopImmediatePropagation();listen=!listen;for(const a of audios.values())a.muted=!listen;speakerBtn.textContent=listen?'🔊 듣기 ON':'🔇 듣기 OFF';show();},true);
 // The old local-only voice listeners are registered on the same buttons in bubble phase; capture handlers above suppress them.
 document.querySelector('#chat div:last-child').textContent='실시간 채팅: 현재 접속한 같은 음성 채널에 전송돼.';
 show();
})();
