const U=process.env.SUPABASE_URL||'https://neckklsrofckomgmbcjg.supabase.co';
const KEY=process.env.SUPABASE_ANON_KEY||'sb_publishable_HJRQj67rIV6vGlYT2fb8Qw_Yj7OtXSn';
module.exports=async(req,res)=>{
  if(req.method!=='POST') return res.status(405).json({error:'POST required'});
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer ')) return res.status(401).json({error:'Admin authorization required'});
  const bookingId=Number(req.body?.bookingId||0);
  if(!bookingId) return res.status(400).json({error:'bookingId required'});
  try{
    const r=await fetch(U+'/functions/v1/fulfillment-retry',{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':auth},body:JSON.stringify({bookingId})});
    const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:text||'Invalid retry response'}}
    return res.status(r.status).json(data);
  }catch(e){return res.status(500).json({error:'Fulfillment retry service unavailable'});}
};
