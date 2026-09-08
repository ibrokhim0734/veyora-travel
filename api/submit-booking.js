const U='https://neckklsrofckomgmbcjg.supabase.co';
module.exports=async(req,res)=>{
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const r=await fetch(U+'/functions/v1/submit-booking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req.body||{})});
    const text=await r.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{data={error:text||'Invalid response'}}
    return res.status(r.status).json(data);
  }catch(e){return res.status(500).json({error:'Booking service unavailable'});}
};