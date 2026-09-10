const {amadeus}=require('./_amadeus');
const fallback=[
 {code:'TAS',name:'Tashkent',detail:'Tashkent International Airport',type:'AIRPORT',country:'UZ'},
 {code:'JFK',name:'New York',detail:'John F. Kennedy International Airport',type:'AIRPORT',country:'US'},
 {code:'LHR',name:'London',detail:'Heathrow Airport',type:'AIRPORT',country:'GB'},
 {code:'CDG',name:'Paris',detail:'Charles de Gaulle Airport',type:'AIRPORT',country:'FR'},
 {code:'PAR',name:'Paris',detail:'Paris city',type:'CITY',country:'FR'},
 {code:'FCO',name:'Rome',detail:'Leonardo da Vinci–Fiumicino Airport',type:'AIRPORT',country:'IT'},
 {code:'ROM',name:'Rome',detail:'Rome city',type:'CITY',country:'IT'},
 {code:'DXB',name:'Dubai',detail:'Dubai International Airport',type:'AIRPORT',country:'AE'},
 {code:'DXB',name:'Dubai',detail:'Dubai',type:'CITY',country:'AE'},
 {code:'IST',name:'Istanbul',detail:'Istanbul Airport',type:'AIRPORT',country:'TR'},
 {code:'ZRH',name:'Zurich',detail:'Zurich Airport',type:'AIRPORT',country:'CH'},
 {code:'MAD',name:'Madrid',detail:'Adolfo Suárez Madrid–Barajas Airport',type:'AIRPORT',country:'ES'},
 {code:'BCN',name:'Barcelona',detail:'Barcelona–El Prat Airport',type:'AIRPORT',country:'ES'},
 {code:'SIN',name:'Singapore',detail:'Singapore Changi Airport',type:'AIRPORT',country:'SG'},
 {code:'BKK',name:'Bangkok',detail:'Suvarnabhumi Airport',type:'AIRPORT',country:'TH'},
 {code:'HKT',name:'Phuket',detail:'Phuket International Airport',type:'AIRPORT',country:'TH'},
 {code:'MLE',name:'Malé',detail:'Velana International Airport',type:'AIRPORT',country:'MV'},
 {code:'GRU',name:'São Paulo',detail:'São Paulo/Guarulhos International Airport',type:'AIRPORT',country:'BR'},
 {code:'RIO',name:'Rio de Janeiro',detail:'Rio de Janeiro city',type:'CITY',country:'BR'},
 {code:'GIG',name:'Rio de Janeiro',detail:'Galeão International Airport',type:'AIRPORT',country:'BR'}
];
module.exports=async(req,res)=>{
 try{
  const q=String((req.query||{}).q||'').trim();
  const kind=String((req.query||{}).kind||'all').toLowerCase();
  if(q.length<2)return res.status(200).json({mode:'local',results:[]});
  let results=[],mode='live';
  try{
   const sub=kind==='airport'?'AIRPORT':kind==='city'?'CITY':'CITY,AIRPORT';
   const d=await amadeus(`/v1/reference-data/locations?subType=${encodeURIComponent(sub)}&keyword=${encodeURIComponent(q)}&view=LIGHT`);
   if(!d)throw new Error('not configured');
   results=(d.data||[]).slice(0,10).map(x=>({code:x.iataCode||x.address?.cityCode||'',name:x.name||x.address?.cityName||'',detail:[x.subType,x.address?.cityName,x.address?.countryName].filter(Boolean).join(' • '),type:x.subType||'',country:x.address?.countryCode||''})).filter(x=>x.code);
  }catch{mode='local'}
  if(!results.length){const s=q.toLowerCase();results=fallback.filter(x=>(kind==='all'||kind==='airport'&&x.type==='AIRPORT'||kind==='city'&&x.type==='CITY')&&(`${x.code} ${x.name} ${x.detail}`.toLowerCase().includes(s))).slice(0,10)}
  res.status(200).json({mode,results});
 }catch(e){res.status(500).json({error:e.message||'Location search failed'})}
};