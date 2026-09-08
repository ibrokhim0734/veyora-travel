const {amadeus,demoFlights,demoHotels}=require('./_amadeus');
const SUPABASE='https://neckklsrofckomgmbcjg.supabase.co';
async function pricing(){
 try{const r=await fetch(SUPABASE+'/functions/v1/public-pricing');if(!r.ok)throw new Error();return (await r.json()).pricing||{};}catch{return{flight_markup_percent:5,hotel_markup_percent:15,service_fee:95};}
}
module.exports=async(req,res)=>{
 try{
  const q=req.method==='GET'?req.query:req.body||{};
  const origin=String(q.origin||'JFK').toUpperCase(),destination=String(q.destination||'FCO').toUpperCase(),cityCode=String(q.cityCode||'ROM').toUpperCase();
  const departureDate=String(q.departureDate||''),checkIn=String(q.checkIn||''),checkOut=String(q.checkOut||'');
  const adults=Math.max(1,Number(q.adults||1));
  if(!departureDate||!checkIn||!checkOut)return res.status(400).json({error:'departureDate, checkIn and checkOut are required'});
  let flights=[],hotels=[],mode='live';
  try{
   const fd=await amadeus(`/v2/shopping/flight-offers?originLocationCode=${encodeURIComponent(origin)}&destinationLocationCode=${encodeURIComponent(destination)}&departureDate=${encodeURIComponent(departureDate)}&adults=${adults}&currencyCode=USD&max=3`);
   if(!fd)throw new Error('no provider');
   flights=(fd.data||[]).map(x=>({id:x.id,carrier:x.validatingAirlineCodes?.[0]||'Airline',price:Number(x.price?.grandTotal||0),currency:x.price?.currency||'USD',stops:Math.max(0,(x.itineraries?.[0]?.segments?.length||1)-1),mode:'live'}));
   const list=await amadeus(`/v1/reference-data/locations/hotels/by-city?cityCode=${encodeURIComponent(cityCode)}&radius=20&radiusUnit=KM&hotelSource=ALL`);
   const ids=(list?.data||[]).slice(0,10).map(x=>x.hotelId).filter(Boolean);
   if(ids.length){const hd=await amadeus(`/v3/shopping/hotel-offers?hotelIds=${encodeURIComponent(ids.join(','))}&adults=${adults}&checkInDate=${encodeURIComponent(checkIn)}&checkOutDate=${encodeURIComponent(checkOut)}&currency=USD&bestRateOnly=true`);hotels=(hd?.data||[]).slice(0,5).map(x=>({id:x.hotel?.hotelId||x.hotel?.name,name:x.hotel?.name||'Hotel',rating:x.hotel?.rating||'',price:Number(x.offers?.[0]?.price?.total||0),currency:x.offers?.[0]?.price?.currency||'USD',mode:'live'}));}
   if(!flights.length||!hotels.length)throw new Error('empty live results');
  }catch(e){mode='demo';flights=demoFlights(origin,destination,departureDate,adults);hotels=demoHotels(cityCode,checkIn,checkOut,adults);}
  const p=await pricing();
  const flightMarkup=Number(p.flight_markup_percent||5)/100,hotelMarkup=Number(p.hotel_markup_percent||15)/100,serviceFee=Number(p.service_fee||95);
  const packages=[];
  for(const f of flights.slice(0,3))for(const h of hotels.slice(0,3)){
    const flightSell=f.price*(1+flightMarkup),hotelSell=h.price*(1+hotelMarkup),total=flightSell+hotelSell+serviceFee;
    packages.push({id:`${f.id}-${h.id}`,flight:f,hotel:h,netCost:f.price+h.price,markup:(flightSell-f.price)+(hotelSell-h.price)+serviceFee,total,perPerson:total/adults,currency:'USD'});
  }
  packages.sort((a,b)=>a.total-b.total);
  res.status(200).json({mode,provider:mode==='live'?'Amadeus':'Demo inventory',pricing:{flightMarkupPercent:flightMarkup*100,hotelMarkupPercent:hotelMarkup*100,serviceFee},packages:packages.slice(0,6)});
 }catch(e){res.status(500).json({error:e.message||'Package search failed'});}
};
