import './style.css';
import { io, type Socket } from 'socket.io-client';

type Lang = 'ko' | 'en';
type Color = 'red' | 'green' | 'yellow' | 'white';
type MapId = 'polus' | 'mira' | 'defeat';
const COLORS: Color[] = ['red','green','yellow','white'];
const MAPS: Record<MapId,{ko:string;en:string;file:string}> = {
  polus:{ko:'폴루스',en:'Polus',file:'polus.svg'},
  mira:{ko:'미라',en:'Mira',file:'mira.svg'},
  defeat:{ko:'디피트',en:'Defeat',file:'defeat.svg'}
};
const t=(ko:string,en:string)=>lang==='ko'?ko:en;
let lang:Lang=(localStorage.getItem('iv-lang') as Lang)||'ko';
let selectedMap:MapId='polus', mobileMode=false, mode=1, matchSeconds=180, remaining=180;
let socket:Socket|null=null, roomCode='', onlineStatus='', currentRoom:any=null;
let keys:Record<string,string>=JSON.parse(localStorage.getItem('iv-keys')||'{"left":"ArrowLeft","right":"ArrowRight","jump":"ArrowUp","hit":"Space"}');
let gameRunning=false,lastFrame=0,animation=0,serveDelay=0;
const app=document.querySelector<HTMLDivElement>('#root')!;
const imgCache=new Map<string,HTMLImageElement>();
function image(path:string){let im=imgCache.get(path);if(!im){im=new Image();im.src=path;imgCache.set(path,im);}return im;}
function renderShell(){
 app.innerHTML=`<div class="app-shell"><header class="topbar"><div class="brand"><span class="brand-mark">IV</span><span>IMPOSTOR <b>VOLLEYBALL</b></span></div><div class="top-actions"><button id="langBtn" class="ghost">${lang==='ko'?'한국어':'English'}</button><button id="settingsBtn" class="ghost">⚙ ${t('설정','Settings')}</button></div></header><main id="view"></main><footer>FAN-MADE GAME PROTOTYPE · NOT AN OFFICIAL VS IMPOSTOR PRODUCT</footer></div>`;
 document.querySelector('#langBtn')!.addEventListener('click',()=>{lang=lang==='ko'?'en':'ko';localStorage.setItem('iv-lang',lang);renderHome();});
 document.querySelector('#settingsBtn')!.addEventListener('click',openSettings);renderHome();
}
function renderHome(){
 gameRunning=false;const v=document.querySelector<HTMLDivElement>('#view')!;
 v.innerHTML=`<section class="hero"><div class="hero-copy"><div class="eyebrow">⚡ ${t('친구들과 함께하는 우주 배구','SPACE VOLLEYBALL WITH FRIENDS')}</div><h1>IMPOSTOR<br><em>VOLLEYBALL</em></h1><p>${t('임포스터를 선택하고 코트에 입장해!','Pick your impostor and step onto the court!')}</p><div class="hero-buttons"><button class="primary" id="playBtn">${t('게임 시작','PLAY')}</button><button class="secondary" id="onlineBtn">${t('온라인 방','ONLINE ROOM')}</button></div></div><div class="hero-art"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><img src="./assets/characters/red/idle.svg" alt="Red"/><span class="hero-tag">4 COLORS · UP TO 8 PLAYERS</span></div></section><section class="feature-row"><div><b>01</b><span>${t('최대 4 vs 4','UP TO 4 vs 4')}</span></div><div><b>02</b><span>${t('3개 맵','3 MAPS')}</span></div><div><b>03</b><span>한국어 / English</span></div><div><b>04</b><span>${t('모바일 터치 조작','MOBILE TOUCH')}</span></div></section>`;
 v.querySelector('#playBtn')!.addEventListener('click',()=>renderLobby(false));v.querySelector('#onlineBtn')!.addEventListener('click',()=>renderLobby(true));
}
function openSettings(){
 const modal=document.createElement('div');modal.className='modal-backdrop';
 modal.innerHTML=`<div class="modal"><div class="modal-head"><h2>${t('설정','Settings')}</h2><button class="x">×</button></div><label class="toggle-line"><span><b>${t('모바일 모드','Mobile mode')}</b><small>${t('화면에 터치 버튼 표시','Show on-screen controls')}</small></span><input id="mobileToggle" type="checkbox" ${mobileMode?'checked':''}></label><div class="setting-block"><h3>${t('개인 키 설정','Key bindings')}</h3><p>${t('키 입력칸을 클릭한 뒤 원하는 키를 눌러.','Click a field and press a key.')}</p><div class="key-grid">${[['left',t('왼쪽','Left')],['right',t('오른쪽','Right')],['jump',t('점프','Jump')],['hit',t('공 치기','Hit')]].map(([k,n])=>`<label>${n}<input data-key="${k}" value="${keys[k]}" readonly></label>`).join('')}</div></div><div class="modal-actions"><button class="primary save">${t('저장','Save')}</button></div></div>`;
 document.body.append(modal);modal.querySelector('.x')!.addEventListener('click',()=>modal.remove());
 modal.querySelector<HTMLInputElement>('#mobileToggle')!.addEventListener('change',e=>mobileMode=(e.target as HTMLInputElement).checked);
 modal.querySelectorAll<HTMLInputElement>('[data-key]').forEach(input=>{input.addEventListener('click',()=>input.focus());input.addEventListener('keydown',e=>{e.preventDefault();keys[input.dataset.key!]=(e as KeyboardEvent).code;input.value=keys[input.dataset.key!];});});
 modal.querySelector('.save')!.addEventListener('click',()=>{localStorage.setItem('iv-keys',JSON.stringify(keys));modal.remove();});
}
function renderLobby(online:boolean){
 gameRunning=false;const v=document.querySelector<HTMLDivElement>('#view')!;let chosen:Color|null=null;
 v.innerHTML=`<section class="panel"><div class="panel-title"><div><div class="eyebrow">${online?t('온라인 멀티플레이','ONLINE MULTIPLAYER'):t('로컬 게임','LOCAL GAME')}</div><h2>${t('경기 준비','MATCH SETUP')}</h2></div><button class="ghost" id="back">← ${t('뒤로','BACK')}</button></div><div class="setup-grid"><div class="setup-card"><h3>01 / ${t('캐릭터 선택','CHARACTER SELECT')}</h3><p>${t('플레이할 캐릭터를 선택해.','Choose your player character.')}</p><div class="character-grid">${COLORS.map(c=>`<button class="character-choice" data-color="${c}"><img src="./assets/characters/${c}/idle.svg"><span>${c.toUpperCase()}</span></button>`).join('')}</div></div><div class="setup-card"><h3>02 / ${t('경기 설정','MATCH SETTINGS')}</h3><label>${t('팀 모드','TEAM MODE')}<select id="mode">${[1,2,3,4].map(n=>`<option value="${n}" ${n===mode?'selected':''}>${n} vs ${n}</option>`).join('')}</select></label><label>${t('경기 시간','MATCH TIME')}<select id="time"><option value="60">1:00</option><option value="180" selected>3:00</option><option value="300">5:00</option><option value="0">${t('무제한','Unlimited')}</option></select></label><label>${t('맵','MAP')}<select id="map">${Object.entries(MAPS).map(([id,m])=>`<option value="${id}" ${id===selectedMap?'selected':''}>${m[lang]}</option>`).join('')}</select></label>${online?`<div class="online-box"><h3>03 / ${t('온라인 방 코드','ROOM CODE')}</h3><label>${t('서버 주소','Server URL')}<input id="serverUrl" placeholder="https://your-server.example" value="${localStorage.getItem('iv-server')||''}"></label><div class="room-row"><input id="roomCode" maxlength="6" placeholder="${t('방 코드 6자리','6-digit room code')}" value="${roomCode}"><button class="secondary" id="connectBtn">${t('서버 연결','CONNECT')}</button></div><div class="room-actions"><button class="primary" id="createRoomBtn">${t('방 만들기','CREATE ROOM')}</button><button class="secondary" id="joinRoomBtn">${t('방 참가','JOIN ROOM')}</button></div><div id="roomState" class="room-state"></div><small>${t('실시간 온라인 대전은 별도 서버가 필요해.','Live multiplayer requires a separate server.')}</small><p id="onlineStatus" class="status">${onlineStatus}</p></div>`:''}<button class="primary full" id="startBtn">${online?t('방 접속','JOIN ROOM'):t('경기 시작','START MATCH')}</button></div></div></section>`;
 v.querySelector('#back')!.addEventListener('click',renderHome);
 v.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(b=>b.addEventListener('click',()=>{v.querySelectorAll('.character-choice').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');chosen=b.dataset.color as Color;if(online)selectOnlineCharacter(chosen);}));
 v.querySelector<HTMLSelectElement>('#mode')!.addEventListener('change',e=>{mode=Number((e.target as HTMLSelectElement).value);syncRoomSettings();});
 v.querySelector<HTMLSelectElement>('#time')!.addEventListener('change',e=>{matchSeconds=Number((e.target as HTMLSelectElement).value);syncRoomSettings();});
 v.querySelector<HTMLSelectElement>('#map')!.addEventListener('change',e=>{selectedMap=(e.target as HTMLSelectElement).value as MapId;syncRoomSettings();});
 if(online){
   v.querySelector('#connectBtn')!.addEventListener('click',connectOnline);
   v.querySelector('#createRoomBtn')!.addEventListener('click',createOnlineRoom);
   v.querySelector('#joinRoomBtn')!.addEventListener('click',joinOnlineRoom);
 }
 v.querySelector('#startBtn')!.addEventListener('click',()=>{if(!chosen){alert(t('캐릭터를 선택해줘!','Choose a character first!'));return;}if(online){if(!socket?.connected){alert(t('먼저 서버 연결을 눌러줘.','Connect to the server first.'));return;}createOnlineRoom();return;}startGame(chosen!,false);});
}

function renderRoomState(room:any){
 const box=document.querySelector<HTMLDivElement>('#roomState');if(!box)return;
 box.innerHTML=`<div class="room-code-card"><small>${t('방 코드 공유하기','SHARE ROOM CODE')}</small><strong>${room.code}</strong><button class="ghost" id="copyRoomCode">${t('코드 복사','COPY CODE')}</button></div><div class="room-player-list">${room.players.map((p:any)=>`<div class="room-player"><span class="player-dot ${p.color||'none'}"></span><span>${escapeHtml(p.name)}</span><small>${p.color||t('캐릭터 미선택','No character')}</small></div>`).join('')}</div><small>${room.players.length}/8 ${t('명 참가 중','players in room')} · ${t('방장','Host')}: ${room.players.find((p:any)=>p.id===room.hostId)?.name||'-'}</small>`;
 box.querySelector('#copyRoomCode')?.addEventListener('click',()=>navigator.clipboard?.writeText(room.code));
}
function escapeHtml(s:string){const map:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};return s.replace(/[&<>"']/g,ch=>map[ch]);}
function syncRoomSettings(){if(socket?.connected&&currentRoom)socket.emit('room:settings',roomSettings(),(res:any)=>{if(!res?.ok&&res?.error==='HOST_ONLY')onlineStatus=t('방장만 설정을 변경할 수 있어.','Only the host can change settings.');});}
function roomSettings(){return {mode:Number((document.querySelector('#mode') as HTMLSelectElement)?.value||mode),seconds:Number((document.querySelector('#time') as HTMLSelectElement)?.value||matchSeconds),map:(document.querySelector('#map') as HTMLSelectElement)?.value||selectedMap};}
function createOnlineRoom(){
 if(!socket?.connected){alert(t('먼저 서버 연결을 눌러줘.','Connect to the server first.'));return;}
 const name=prompt(t('플레이어 이름을 입력해줘','Enter your player name'),'Player')||'Player';
 socket.emit('room:create',{name,settings:roomSettings()},(res:any)=>{if(!res?.ok){alert(res?.error||'Could not create room');return;}currentRoom=res.room;roomCode=res.room.code;renderRoomState(res.room);if(chosenColor())selectOnlineCharacter(chosenColor()!);});
}
function chosenColor():Color|null{return document.querySelector<HTMLButtonElement>('.character-choice.selected')?.dataset.color as Color||null;}
function selectOnlineCharacter(color:Color){
 if(!socket?.connected||!currentRoom)return;
 socket.emit('player:select',{color},(res:any)=>{if(!res?.ok)alert(res.error==='CHARACTER_TAKEN'?t('이미 다른 플레이어가 선택한 캐릭터야.','That character is already taken.'):String(res.error));});
}
function joinOnlineRoom(){
 if(!socket?.connected){alert(t('먼저 서버 연결을 눌러줘.','Connect to the server first.'));return;}
 const code=(document.querySelector<HTMLInputElement>('#roomCode')?.value||'').trim().toUpperCase();
 if(code.length!==6){alert(t('6자리 방 코드를 입력해줘.','Enter a 6-character room code.'));return;}
 const name=prompt(t('플레이어 이름을 입력해줘','Enter your player name'),'Player')||'Player';
 socket.emit('room:join',{code,name},(res:any)=>{if(!res?.ok){alert(res?.error==='ROOM_FULL'?t('방이 가득 찼어.','Room is full.'):t('방을 찾을 수 없어.','Room not found.'));return;}currentRoom=res.room;roomCode=res.room.code;renderRoomState(res.room);if(chosenColor())selectOnlineCharacter(chosenColor()!);});
}

function connectOnline(){
 const url=document.querySelector<HTMLInputElement>('#serverUrl')?.value.trim();if(!url){alert(t('서버 주소를 입력해줘.','Enter the server URL.'));return;}
 localStorage.setItem('iv-server',url);onlineStatus=t('접속 중...','Connecting...');const s=document.querySelector('#onlineStatus');if(s)s.textContent=onlineStatus;
 socket?.disconnect();socket=io(url,{transports:['websocket','polling'],timeout:8000});
 socket.on('connect',()=>{onlineStatus=t('서버 연결됨','Connected to server');const el=document.querySelector('#onlineStatus');if(el)el.textContent=onlineStatus;});
 socket.on('room:update',(room:any)=>{currentRoom=room;roomCode=room.code;const codeInput=document.querySelector<HTMLInputElement>('#roomCode');if(codeInput)codeInput.value=room.code;renderRoomState(room);});
 socket.on('room:error',(err:any)=>{onlineStatus=String(err?.message||err);const el=document.querySelector('#onlineStatus');if(el)el.textContent=onlineStatus;});
 socket.on('connect_error',e=>{onlineStatus=t('연결 실패: ','Connection failed: ')+e.message;const el=document.querySelector('#onlineStatus');if(el)el.textContent=onlineStatus;});
}
let canvas:HTMLCanvasElement,ctx:CanvasRenderingContext2D;
type Player={id:number;team:0|1;color:Color;x:number;y:number;vy:number;grounded:boolean;moving:boolean};
let players:Player[]=[],ball={x:640,y:230,vx:4,vy:0,r:17},score=[0,0],held=new Set<string>();
let floorY=620,localColor:Color='red';
function startGame(color:Color,_online:boolean){
 localColor=color;gameRunning=true;remaining=matchSeconds||0;score=[0,0];serveDelay=1;players=[];
 for(let team=0;team<2;team++)for(let i=0;i<mode;i++)players.push({id:team*mode+i,team:team as 0|1,color:team===0?color:COLORS[(i+1)%COLORS.length],x:team===0?150+i*75:1130-i*75,y:floorY-95,vy:0,grounded:true,moving:false});
 renderGame();lastFrame=performance.now();requestAnimationFrame(loop);
}
function renderGame(){
 const v=document.querySelector<HTMLDivElement>('#view')!;
 v.innerHTML=`<section class="game-wrap"><div class="game-hud"><div><small>${t('팀 블루','TEAM A')}</small><b id="scoreA">0</b></div><div class="match-info"><b>${MAPS[selectedMap][lang]}</b><span id="timer">${matchSeconds?formatTime(matchSeconds):'∞'}</span></div><div><small>${t('팀 레드','TEAM B')}</small><b id="scoreB">0</b></div><button id="exitGame" class="ghost">✕</button></div><div class="canvas-shell"><canvas id="court" width="1280" height="720"></canvas><div class="toast" id="toast"></div></div><div class="control-hint">${t('이동: 좌우 키 · 점프: 위쪽 키 · 공 치기: 스페이스','Move: Left/Right · Jump: Up · Hit: Space')}</div>${mobileMode?'<div class="touch-controls"><div><button data-hold="left">◀</button><button data-hold="right">▶</button></div><div><button data-hold="jump">▲</button><button data-hold="hit">●</button></div></div>':''}</section>`;
 canvas=document.querySelector<HTMLCanvasElement>('#court')!;ctx=canvas.getContext('2d')!;
 document.querySelector('#exitGame')!.addEventListener('click',()=>{gameRunning=false;socket?.disconnect();renderHome();});
 document.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach(b=>{const k=b.dataset.hold!;b.addEventListener('pointerdown',e=>{e.preventDefault();held.add(k);});['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>held.delete(k)));});
}
function formatTime(s:number){return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;}
function loop(now:number){if(!gameRunning)return;const dt=Math.min((now-lastFrame)/16.667,2);lastFrame=now;animation+=dt;if(matchSeconds>0&&remaining>0)remaining=Math.max(0,remaining-dt/60);update(dt);draw();requestAnimationFrame(loop);}
function update(dt:number){
 const left=held.has('left')||held.has(keys.left),right=held.has('right')||held.has(keys.right),jump=held.has('jump')||held.has(keys.jump),hit=held.has('hit')||held.has(keys.hit);
 const p=players[0];if(p){p.moving=left||right;if(left)p.x-=5*dt;if(right)p.x+=5*dt;p.x=Math.max(40,Math.min(605,p.x));if(jump&&p.grounded){p.vy=-13;p.grounded=false;}if(hit&&Math.abs(ball.x-p.x)<105&&Math.abs(ball.y-p.y)<125){ball.vx=7;ball.vy=-9;held.delete('hit');}}
 players.forEach((pl,i)=>{if(i===0)return;if(!pl.grounded){pl.y+=pl.vy*dt;pl.vy+=.65*dt;if(pl.y>=floorY-95){pl.y=floorY-95;pl.vy=0;pl.grounded=true;}}});
 if(p&&!p.grounded){p.y+=p.vy*dt;p.vy+=.65*dt;if(p.y>=floorY-95){p.y=floorY-95;p.vy=0;p.grounded=true;}}
 if(serveDelay>0){serveDelay-=dt/60;return;}ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.vy+=.24*dt;
 if(ball.x<ball.r||ball.x>1280-ball.r){ball.vx*=-.85;ball.x=Math.max(ball.r,Math.min(1280-ball.r,ball.x));}
 if(ball.y<ball.r){ball.y=ball.r;ball.vy=Math.abs(ball.vy)*.8;}
 if(ball.y+ball.r>=floorY){const team=ball.x<640?1:0;score[team]++;updateScore();serveDelay=1.1;ball={x:640,y:220,vx:team===0?-4:4,vy:-2,r:17};}
 if(ball.x>620&&ball.x<660&&ball.y>floorY-260)ball.vx=ball.x<640?-Math.abs(ball.vx):Math.abs(ball.vx);
 players.forEach(pl=>{const dx=ball.x-pl.x,dy=ball.y-(pl.y-25);if(Math.abs(dx)<42&&Math.abs(dy)<48){ball.vy=-8;ball.vx=dx<0?-4:4;}});
 const timer=document.querySelector('#timer');if(timer)timer.textContent=matchSeconds?formatTime(Math.ceil(remaining)):'∞';
 if(matchSeconds>0&&remaining<=0){gameRunning=false;const toast=document.querySelector('#toast');if(toast)toast.textContent=score[0]===score[1]?t('무승부!','DRAW!'):score[0]>score[1]?t('팀 블루 승리!','TEAM A WINS!'):t('팀 레드 승리!','TEAM B WINS!');}
}
function updateScore(){const a=document.querySelector('#scoreA'),b=document.querySelector('#scoreB');if(a)a.textContent=String(score[0]);if(b)b.textContent=String(score[1]);}
function draw(){
 ctx.clearRect(0,0,1280,720);const bg=image(`./assets/maps/${MAPS[selectedMap].file}`);
 if(bg.complete&&bg.naturalWidth)ctx.drawImage(bg,0,0,1280,floorY);else{ctx.fillStyle='#222';ctx.fillRect(0,0,1280,floorY);}
 ctx.fillStyle='rgba(12,14,25,.23)';ctx.fillRect(0,0,1280,floorY);ctx.fillStyle='#4b4450';ctx.fillRect(0,floorY,1280,100);ctx.fillStyle='#dedee5';ctx.fillRect(635,floorY-205,10,205);ctx.fillStyle='#fff';ctx.fillRect(0,floorY-4,1280,4);
 players.forEach(p=>{const state=!p.grounded?'jump':p.moving?(Math.floor(animation/8)%2?'walk1':'walk2'):'idle';const im=image(`./assets/characters/${p.color}/${state}.svg`);if(im.complete&&im.naturalWidth){const height=105,width=height*im.width/im.height;ctx.save();if(p.team===1){ctx.translate(p.x,0);ctx.scale(-1,1);ctx.drawImage(im,-width/2,p.y-height/2,width,height);}else ctx.drawImage(im,p.x-width/2,p.y-height/2,width,height);ctx.restore();}});
 ctx.save();ctx.shadowColor='#fff';ctx.shadowBlur=12;ctx.fillStyle='#f3eee0';ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#37343b';ctx.lineWidth=3;ctx.stroke();ctx.restore();
}
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault();held.add(e.code);});
window.addEventListener('keyup',e=>held.delete(e.code));
renderShell();