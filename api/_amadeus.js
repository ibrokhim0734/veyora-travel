const HOST=process.env.AMADEUS_HOST||'https://test.api.amadeus.com';
let cache={token:null,expires:0};
async function token(){
  if(cache.token&&Date.now()<cache.expires-60000)return cache.token;
  const id=process.env.AMADEUS_CLIENT_ID,secret=process.env.AMADEUS_CLIENT_SECRET;
  if(!id||!secret)return null;
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:id,client_secret:secret});
  const r=await fetch(HOST+'/v1/security/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!r.ok)throw new Error('Amadeus authentication failed');
  const d=await r.json(); cache={token:d.access_token,expires:Date.now()+(d.expires_in||1500)*1000}; return cache.token;
}
async function amadeus(path){
  const t=await token(); if(!t)return null;
  const r=await fetch(HOST+path,{headers:{Authorization:'Bearer '+t}});
  const text=await r.text(); let d={}; try{d=text?JSON.parse(text):{}}catch{d={error:text}}
  if(!r.ok)throw new Error(d?.errors?.[0]?.detail||d?.error_description||'Amadeus request failed');
  return d;
}
const demoFlights=(origin,destination,date,adults=1)=>[
 {id:'demo-f1',carrier:'Demo Air',origin,destination,departure:date+'T09:15:00',arrival:date+'T18:10:00',stops:0,price:720*adults,currency:'USD',mode:'demo'},
 {id:'demo-f2',carrier:'Global Airways',origin,destination,departure:date+'T17:40:00',arrival:date+'T08:20:00',stops:1,price:655*adults,currency:'USD',mode:'demo'},
 {id:'demo-f3',carrier:'Premium Atlantic',origin,destination,departure:date+'T21:05:00',arrival:date+'T12:30:00',stops:0,price:845*adults,currency:'USD',mode:'demo'}
];
const demoHotels=(city,checkIn,checkOut,adults=1)=>[
 {id:'demo-h1',name:'Grand Central '+city,rating:'5',room:'Deluxe King',price:980*adults,currency:'USD',mode:'demo'},
 {id:'demo-h2',name:'VEYORA Select '+city,rating:'4',room:'Superior Room',price:720*adults,currency:'USD',mode:'demo'},
 {id:'demo-h3',name:'Boutique House '+city,rating:'4',room:'Classic Double',price:640*adults,currency:'USD',mode:'demo'}
];
module.exports={amadeus,demoFlights,demoHotels};
