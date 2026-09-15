const SUPABASE_URL=process.env.SUPABASE_URL||'https://neckklsrofckomgmbcjg.supabase.co';
const SUPABASE_ANON_KEY=process.env.SUPABASE_ANON_KEY||'sb_publishable_HJRQj67rIV6vGlYT2fb8Qw_Yj7OtXSn';
module.exports=async(req,res)=>{
  try{
    if(req.method!=='POST')return res.status(405).json({error:'POST required'});
    const auth=req.headers.authorization||'';
    if(!auth.startsWith('Bearer '))return res.status(401).json({error:'Admin authorization required'});
    const body=req.body||{};
    if(!Number(body.bookingId))return res.status(400).json({error:'bookingId required'});
    const r=await fetch(`${SUPABASE_URL}/functions/v1/supplier-orchestrator`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':auth},
      body:JSON.stringify({bookingId:Number(body.bookingId),traveler:body.traveler||null})
    });
    const text=await r.text();let d={};try{d=text?JSON.parse(text):{}}catch{d={error:text||'Invalid supplier response'}}
    return res.status(r.status).json(d);
  }catch(e){return res.status(500).json({error:e.message||'Supplier fulfillment failed'})}
};