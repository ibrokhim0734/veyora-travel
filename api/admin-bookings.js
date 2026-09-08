const U='https://neckklsrofckomgmbcjg.supabase.co';
const KEY='sb_publishable_HJRQj67rIV6vGlYT2fb8Qw_Yj7OtXSn';
module.exports=async(req,res)=>{
  if(!['GET','PATCH'].includes(req.method)) return res.status(405).json({error:'Method not allowed'});
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer ')) return res.status(401).json({error:'Unauthorized'});
  try{
    const qs=req.method==='GET'&&req.query?.id?`?id=${encodeURIComponent(req.query.id)}`:'';
    const r=await fetch(U+'/functions/v1/admin-bookings'+qs,{method:req.method,headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':auth},body:req.method==='PATCH'?JSON.stringify(req.body||{}):undefined});
    const text=await r.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{data={error:text||'Invalid response'}}
    return res.status(r.status).json(data);
  }catch(e){return res.status(500).json({error:'Admin booking service unavailable'});}
};