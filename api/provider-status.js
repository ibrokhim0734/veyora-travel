module.exports=async(req,res)=>{
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const amadeus=Boolean(process.env.AMADEUS_CLIENT_ID&&process.env.AMADEUS_CLIENT_SECRET);
  res.status(200).json({
    flights:{provider:'Amadeus',configured:amadeus,mode:amadeus?'live':'demo'},
    hotels:{provider:'Amadeus Hotels',configured:amadeus,mode:amadeus?'live':'demo'},
    payments:{provider:null,configured:false,mode:'not_configured'},
    timestamp:new Date().toISOString()
  });
};