
const express=require('express');
const http=require('node:http');
const {Server}=require('socket.io');
const path=require('node:path');
const app=express();app.disable('x-powered-by');app.use(express.static(path.join(__dirname,'public')));
app.get('/health',(req,res)=>res.json({ok:true,online:io.engine.clientsCount}));
const server=http.createServer(app);const io=new Server(server,{maxHttpBufferSize:12000});
const users=new Map();
const clean=(v,n=100)=>String(v??'').trim().slice(0,n);
const roomFor=(channel,club)=>channel==='meeting'?`meeting:${club}`:channel==='field'?'field':'lobby';
function peers(room){return [...users.entries()].filter(([,u])=>u.room===room).map(([id,u])=>({id,nick:u.nick,club:u.club,gender:u.gender,mic:u.mic}));}
function refresh(room){io.to(room).emit('room:peers',peers(room));}
io.on('connection',socket=>{
 let lastChat=0;
 socket.on('profile:join',(data={},ack)=>{
  const nick=clean(data.nick,16),club=clean(data.club,12),gender=data.gender==='female'?'female':'male';
  if(nick.length<2||!/^[A-Z0-9]{2,12}$/.test(club))return ack?.({ok:false,error:'닉네임/구단 정보 확인 필요'});
  const old=users.get(socket.id);if(old){socket.leave(old.room);refresh(old.room);}
  const channel=['lobby','meeting','field'].includes(data.channel)?data.channel:'lobby';
  const room=roomFor(channel,club);users.set(socket.id,{nick,club,gender,room,mic:false});socket.join(room);
  ack?.({ok:true,id:socket.id,room});refresh(room);
 });
 socket.on('chat:send',(raw,ack)=>{
  const u=users.get(socket.id);if(!u)return;
  const message=clean(raw,200);if(!message)return;
  if(Date.now()-lastChat<700)return ack?.({ok:false,error:'메시지를 잠시 천천히 보내줘'});
  lastChat=Date.now();io.to(u.room).emit('chat:message',{id:socket.id,nick:u.nick,club:u.club,message,at:Date.now()});ack?.({ok:true});
 });
 socket.on('voice:state',v=>{const u=users.get(socket.id);if(!u)return;u.mic=!!v;refresh(u.room);});
 socket.on('rtc:signal',({to,description,candidate}={})=>{
  const u=users.get(socket.id),target=users.get(to);if(!u||!target||u.room!==target.room||typeof to!=='string')return;
  if(JSON.stringify({description,candidate}).length>10000)return;
  io.to(to).emit('rtc:signal',{from:socket.id,description,candidate});
 });
 socket.on('disconnect',()=>{const u=users.get(socket.id);users.delete(socket.id);if(u)refresh(u.room);});
});
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log(`Locker Room ready on port ${process.env.PORT||3000}`));
