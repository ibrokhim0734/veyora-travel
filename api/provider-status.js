module.exports=async(req,res)=>{
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const amadeus=Boolean(process.env.AMADEUS_CLIENT_ID&&process.env.AMADEUS_CLIENT_SECRET);
  const host=process.env.AMADEUS_HOST||'https://test.api.amadeus.com';
  res.status(200).json({
    flights:{provider:'Amadeus',configured:amadeus,mode:amadeus?'live':'demo',environment:host.includes('test.api')?'test':'production'},
    hotels:{provider:'Amadeus Hotels',configured:amadeus,mode:amadeus?'live':'demo',environment:host.includes('test.api')?'test':'production'},
    payments:{provider:null,configured:false,mode:'not_configured'},
    readiness:{liveSearchReady:amadeus,missing:amadeus?[]:['AMADEUS_CLIENT_ID','AMADEUS_CLIENT_SECRET']},
    timestamp:new Date().toISOString()
  });
};