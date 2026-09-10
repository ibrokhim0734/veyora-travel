const SUPABASE='https://neckklsrofckomgmbcjg.supabase.co';
async function probe(path,method='GET'){
  try{
    const r=await fetch(SUPABASE+path,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify({}):undefined});
    return {reachable:r.status<500,status:r.status};
  }catch{return {reachable:false,status:null}}
}
module.exports=async(req,res)=>{
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const amadeus=Boolean(process.env.AMADEUS_CLIENT_ID&&process.env.AMADEUS_CLIENT_SECRET);
  const host=process.env.AMADEUS_HOST||'https://test.api.amadeus.com';
  const supplier={
    flight:Boolean(process.env.SUPPLIER_BOOK_FLIGHT_URL&&process.env.SUPPLIER_BOOK_FLIGHT_KEY),
    hotel:Boolean(process.env.SUPPLIER_BOOK_HOTEL_URL&&process.env.SUPPLIER_BOOK_HOTEL_KEY),
    transfer:Boolean(process.env.SUPPLIER_BOOK_TRANSFER_URL&&process.env.SUPPLIER_BOOK_TRANSFER_KEY)
  };
  const [booking,payment,status]=await Promise.all([
    probe('/functions/v1/submit-booking','POST'),
    probe('/functions/v1/create-payment-session','POST'),
    probe('/functions/v1/booking-status','POST')
  ]);
  const missing=[];
  if(!amadeus) missing.push('AMADEUS_CLIENT_ID','AMADEUS_CLIENT_SECRET');
  if(!supplier.flight) missing.push('SUPPLIER_BOOK_FLIGHT_URL/KEY');
  if(!supplier.hotel) missing.push('SUPPLIER_BOOK_HOTEL_URL/KEY');
  if(!supplier.transfer) missing.push('SUPPLIER_BOOK_TRANSFER_URL/KEY');
  res.status(200).json({
    flights:{provider:'Amadeus',configured:amadeus,mode:amadeus?'live':'demo',environment:host.includes('test.api')?'test':'production'},
    hotels:{provider:'Amadeus Hotels',configured:amadeus,mode:amadeus?'live':'demo',environment:host.includes('test.api')?'test':'production'},
    bookingBackend:booking,
    paymentBackend:payment,
    trackingBackend:status,
    supplierBookingAdapters:supplier,
    readiness:{
      liveSearchReady:amadeus,
      customerFlowBackendReady:booking.reachable&&payment.reachable&&status.reachable,
      automaticFulfillmentReady:supplier.flight&&supplier.hotel,
      productionReady:amadeus&&booking.reachable&&payment.reachable&&status.reachable&&supplier.flight&&supplier.hotel,
      missing
    },
    timestamp:new Date().toISOString()
  });
};