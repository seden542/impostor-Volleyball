import { createServer } from 'node:http';
import { Server } from 'socket.io';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN?.split(',') ?? '*', methods: ['GET','POST'] }
});
const rooms = new Map();
const COLORS = ['red','green','yellow','white'];
const MAX_PLAYERS = 8;
const code = () => Math.random().toString(36).slice(2,8).toUpperCase();

function snapshot(room) {
  return { code: room.code, hostId: room.hostId, settings: room.settings,
    players: [...room.players.values()].map(({id,name,color,team,ready})=>({id,name,color,team,ready})) };
}
function emitRoom(room) { io.to(room.code).emit('room:update', snapshot(room)); }
function leave(socket) {
  const roomCode = socket.data.roomCode;
  if (!roomCode) return;
  const room = rooms.get(roomCode);
  socket.leave(roomCode);
  socket.data.roomCode = null;
  if (!room) return;
  room.players.delete(socket.id);
  if (!room.players.size) rooms.delete(roomCode);
  else {
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    emitRoom(room);
  }
}
io.on('connection', socket => {
  socket.on('room:create', ({name='Player',settings={}}={}, reply=()=>{}) => {
    leave(socket);
    let roomCode; do { roomCode=code(); } while (rooms.has(roomCode));
    const room = { code:roomCode, hostId:socket.id, settings:{mode:1,seconds:180,map:'polus',...settings}, players:new Map() };
    room.players.set(socket.id,{id:socket.id,name:String(name).slice(0,16),color:null,team:0,ready:false});
    rooms.set(roomCode,room); socket.join(roomCode); socket.data.roomCode=roomCode;
    reply({ok:true,room:snapshot(room)});
  });
  socket.on('room:join', ({code:rawCode,name='Player'}={}, reply=()=>{}) => {
    const room=rooms.get(String(rawCode||'').toUpperCase());
    if (!room) return reply({ok:false,error:'ROOM_NOT_FOUND'});
    if (room.players.size>=MAX_PLAYERS) return reply({ok:false,error:'ROOM_FULL'});
    room.players.set(socket.id,{id:socket.id,name:String(name).slice(0,16),color:null,team:room.players.size%2,ready:false});
    socket.join(room.code); socket.data.roomCode=room.code; emitRoom(room);
    reply({ok:true,room:snapshot(room)});
  });
  socket.on('player:select', ({color}={}, reply=()=>{}) => {
    const room=rooms.get(socket.data.roomCode);
    if (!room) return reply({ok:false,error:'NOT_IN_ROOM'});
    if (!COLORS.includes(color)) return reply({ok:false,error:'INVALID_CHARACTER'});
    const taken=[...room.players.values()].some(p=>p.id!==socket.id&&p.color===color);
    if (taken) return reply({ok:false,error:'CHARACTER_TAKEN'});
    room.players.get(socket.id).color=color; emitRoom(room); reply({ok:true});
  });
  socket.on('room:settings', (settings={}, reply=()=>{}) => {
    const room=rooms.get(socket.data.roomCode);
    if (!room || room.hostId!==socket.id) return reply({ok:false,error:'HOST_ONLY'});
    const mode=Number(settings.mode);
    if (![1,2,3,4].includes(mode)) return reply({ok:false,error:'INVALID_MODE'});
    if (!['polus','mira','defeat'].includes(settings.map)) return reply({ok:false,error:'INVALID_MAP'});
    room.settings={mode,seconds:[0,60,180,300].includes(Number(settings.seconds))?Number(settings.seconds):180,map:settings.map};
    emitRoom(room); reply({ok:true});
  });
  socket.on('disconnect',()=>leave(socket));
});
const port=Number(process.env.PORT||3001);
httpServer.listen(port,()=>console.log('Impostor Volleyball room server listening on '+port));
