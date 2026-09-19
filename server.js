const express=require('express');
const path=require('path');
const fs=require('fs');
const {Pool}=require('pg');

const app=express();
app.use(express.json());
app.use(express.static(__dirname));

const PORT=process.env.PORT||3000;
const DB=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;
const DATA_FILE=path.join('/tmp','beautyflow-data.json');

const seed={
 salon:{id:1,name:'BeautyFlow Studio',city:'Москва',address:'Цветной бульвар, 15',phone:'+7 999 000-00-00'},
 services:[
  {id:1,name:'Маникюр + покрытие',category:'Ногти',price:3200,duration:90,emoji:'💅'},
  {id:2,name:'Оформление бровей',category:'Брови',price:1900,duration:60,emoji:'✨'},
  {id:3,name:'Стрижка и укладка',category:'Волосы',price:4500,duration:75,emoji:'✂️'},
  {id:4,name:'Уход за лицом',category:'Уход',price:5400,duration:80,emoji:'🫧'}
 ],
 masters:[
  {id:1,name:'Алина',specialty:'Nail master',experience:5,rating:4.9},
  {id:2,name:'София',specialty:'Brow artist',experience:4,rating:5.0},
  {id:3,name:'Мила',specialty:'Hair stylist',experience:7,rating:4.9}
 ],
 bookings:[]
};
function readFileStore(){try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))}catch{fs.writeFileSync(DATA_FILE,JSON.stringify(seed));return structuredClone(seed)}}
function writeFileStore(v){fs.writeFileSync(DATA_FILE,JSON.stringify(v))}

async function initDb(){
 if(!DB)return;
 await DB.query(`CREATE TABLE IF NOT EXISTS services(id SERIAL PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,price INT NOT NULL,duration INT NOT NULL,emoji TEXT);
 CREATE TABLE IF NOT EXISTS masters(id SERIAL PRIMARY KEY,name TEXT NOT NULL,specialty TEXT NOT NULL,experience INT DEFAULT 0,rating NUMERIC(2,1) DEFAULT 5.0);
 CREATE TABLE IF NOT EXISTS bookings(id BIGSERIAL PRIMARY KEY,service_name TEXT NOT NULL,master_name TEXT,booking_date TEXT NOT NULL,booking_time TEXT NOT NULL,client_name TEXT DEFAULT 'Гость',client_phone TEXT,status TEXT DEFAULT 'confirmed',created_at TIMESTAMPTZ DEFAULT NOW());`);
 const c=await DB.query('SELECT COUNT(*)::int c FROM services');if(c.rows[0].c===0)for(const s of seed.services)await DB.query('INSERT INTO services(name,category,price,duration,emoji) VALUES($1,$2,$3,$4,$5)',[s.name,s.category,s.price,s.duration,s.emoji]);
 const m=await DB.query('SELECT COUNT(*)::int c FROM masters');if(m.rows[0].c===0)for(const x of seed.masters)await DB.query('INSERT INTO masters(name,specialty,experience,rating) VALUES($1,$2,$3,$4)',[x.name,x.specialty,x.experience,x.rating]);
}

app.get('/api/health',(req,res)=>res.json({ok:true,storage:DB?'postgres':'temporary'}));
app.get('/api/catalog',async(req,res)=>{
 try{
  if(DB){const [s,m]=await Promise.all([DB.query('SELECT * FROM services ORDER BY id'),DB.query('SELECT * FROM masters ORDER BY id')]);return res.json({salon:seed.salon,services:s.rows,masters:m.rows})}
  const d=readFileStore();res.json({salon:d.salon,services:d.services,masters:d.masters});
 }catch(e){res.status(500).json({error:e.message})}
});
app.get('/api/bookings',async(req,res)=>{
 try{if(DB){const q=await DB.query('SELECT * FROM bookings ORDER BY created_at DESC');return res.json(q.rows)}
 const d=readFileStore();res.json(d.bookings.slice().reverse())}catch(e){res.status(500).json({error:e.message})}
});
app.post('/api/bookings',async(req,res)=>{
 const {service_name,master_name,booking_date,booking_time,client_name,client_phone}=req.body||{};
 if(!service_name||!booking_date||!booking_time)return res.status(400).json({error:'missing_fields'});
 try{
  if(DB){const q=await DB.query('INSERT INTO bookings(service_name,master_name,booking_date,booking_time,client_name,client_phone) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[service_name,master_name||null,booking_date,booking_time,client_name||'Гость',client_phone||null]);return res.status(201).json(q.rows[0])}
  const d=readFileStore();const item={id:Date.now(),service_name,master_name:master_name||null,booking_date,booking_time,client_name:client_name||'Гость',client_phone:client_phone||null,status:'confirmed',created_at:new Date().toISOString()};d.bookings.push(item);writeFileStore(d);res.status(201).json(item);
 }catch(e){res.status(500).json({error:e.message})}
});
app.patch('/api/bookings/:id',async(req,res)=>{
 const {status,booking_date,booking_time}=req.body||{};const id=req.params.id;
 try{
  if(DB){const q=await DB.query('UPDATE bookings SET status=COALESCE($1,status),booking_date=COALESCE($2,booking_date),booking_time=COALESCE($3,booking_time) WHERE id=$4 RETURNING *',[status||null,booking_date||null,booking_time||null,id]);return q.rows[0]?res.json(q.rows[0]):res.sendStatus(404)}
  const d=readFileStore(),x=d.bookings.find(v=>String(v.id)===String(id));if(!x)return res.sendStatus(404);if(status)x.status=status;if(booking_date)x.booking_date=booking_date;if(booking_time)x.booking_time=booking_time;writeFileStore(d);res.json(x);
 }catch(e){res.status(500).json({error:e.message})}
});
app.get('/api/admin/stats',async(req,res)=>{
 try{
  const bookings=DB?(await DB.query('SELECT * FROM bookings')).rows:readFileStore().bookings;
  const active=bookings.filter(x=>x.status!=='cancelled');
  res.json({bookings:bookings.length,active:active.length,cancelled:bookings.length-active.length,revenue:active.length*3200});
 }catch(e){res.status(500).json({error:e.message})}
});
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'admin.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
initDb().catch(e=>console.error('DB init:',e.message)).finally(()=>app.listen(PORT,()=>console.log('BeautyFlow on '+PORT)));
