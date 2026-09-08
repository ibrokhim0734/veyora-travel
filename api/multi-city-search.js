const {amadeus,demoFlights,demoHotels}=require('./_amadeus');
const SUPABASE='https://neckklsrofckomgmbcjg.supabase.co';

async function getPricing(){
  try{
    const r=await fetch(SUPABASE+'/functions/v1/public-pricing');
    if(!r.ok) throw new Error('pricing');
    return (await r.json()).pricing||{};
  }catch{
    return {flight_markup_percent:5,hotel_markup_percent:15,service_fee:95};
  }
}

async function logSearch(payload){
  try{
    await fetch(SUPABASE+'/functions/v1/log-supplier-search',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
  }catch{}
}

async function liveFlight(seg,adults){
  const path=`/v2/shopping/flight-offers?originLocationCode=${encodeURIComponent(seg.origin)}&destinationLocationCode=${encodeURIComponent(seg.destination)}&departureDate=${encodeURIComponent(seg.date)}&adults=${adults}&currencyCode=USD&max=3`;
  const d=await amadeus(path);
  if(!d) return null;
  return (d.data||[]).map(x=>({
    id:x.id,
    carrier:x.validatingAirlineCodes?.[0]||'Airline',
    origin:seg.origin,
    destination:seg.destination,
    date:seg.date,
    price:Number(x.price?.grandTotal||0),
    currency:x.price?.currency||'USD',
    stops:Math.max(0,(x.itineraries?.[0]?.segments?.length||1)-1),
    mode:'live'
  }));
}

async function liveHotels(stay,adults){
  const list=await amadeus(`/v1/reference-data/locations/hotels/by-city?cityCode=${encodeURIComponent(stay.cityCode)}&radius=20&radiusUnit=KM&hotelSource=ALL`);
  if(!list) return null;
  const ids=(list.data||[]).slice(0,10).map(x=>x.hotelId).filter(Boolean);
  if(!ids.length) return [];
  const d=await amadeus(`/v3/shopping/hotel-offers?hotelIds=${encodeURIComponent(ids.join(','))}&adults=${adults}&checkInDate=${encodeURIComponent(stay.checkIn)}&checkOutDate=${encodeURIComponent(stay.checkOut)}&currency=USD&bestRateOnly=true`);
  return (d?.data||[]).slice(0,5).map(x=>({
    id:x.hotel?.hotelId||x.hotel?.name,
    name:x.hotel?.name||'Hotel',
    cityCode:stay.cityCode,
    checkIn:stay.checkIn,
    checkOut:stay.checkOut,
    rating:x.hotel?.rating||'',
    price:Number(x.offers?.[0]?.price?.total||0),
    currency:x.offers?.[0]?.price?.currency||'USD',
    mode:'live'
  }));
}

module.exports=async(req,res)=>{
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const b=req.body||{};
    const adults=Math.max(1,Math.min(9,Number(b.adults||1)));
    const segments=Array.isArray(b.segments)?b.segments:[];
    const stays=Array.isArray(b.stays)?b.stays:[];
    if(!segments.length) return res.status(400).json({error:'At least one flight segment is required'});
    if(segments.length>8||stays.length>8) return res.status(400).json({error:'Too many segments'});
    for(const s of segments){if(!s.origin||!s.destination||!s.date) return res.status(400).json({error:'Each flight segment needs origin, destination and date'});}
    for(const s of stays){if(!s.cityCode||!s.checkIn||!s.checkOut) return res.status(400).json({error:'Each hotel stay needs cityCode, checkIn and checkOut'});}

    let mode='live';
    const flightChoices=[];
    for(const seg of segments){
      try{
        const live=await liveFlight(seg,adults);
        if(!live||!live.length) throw new Error('No live flight inventory');
        flightChoices.push(live);
      }catch{
        mode='demo';
        flightChoices.push(demoFlights(seg.origin,seg.destination,seg.date,adults));
      }
    }

    const hotelChoices=[];
    for(const stay of stays){
      try{
        const live=await liveHotels(stay,adults);
        if(!live||!live.length) throw new Error('No live hotel inventory');
        hotelChoices.push(live);
      }catch{
        mode='demo';
        hotelChoices.push(demoHotels(stay.cityCode,stay.checkIn,stay.checkOut,adults));
      }
    }

    const p=await getPricing();
    const fm=Number(p.flight_markup_percent||5)/100;
    const hm=Number(p.hotel_markup_percent||15)/100;
    const fee=Number(p.service_fee||95);

    const selectedFlights=flightChoices.map(x=>x.slice().sort((a,b)=>a.price-b.price)[0]);
    const selectedHotels=hotelChoices.map(x=>x.slice().sort((a,b)=>a.price-b.price)[0]);
    const flightNet=selectedFlights.reduce((s,x)=>s+Number(x.price||0),0);
    const hotelNet=selectedHotels.reduce((s,x)=>s+Number(x.price||0),0);
    const flightSell=flightNet*(1+fm);
    const hotelSell=hotelNet*(1+hm);
    const total=flightSell+hotelSell+fee;
    const markup=(flightSell-flightNet)+(hotelSell-hotelNet)+fee;
    const provider=mode==='live'?'Amadeus':'Mixed/Demo inventory';
    const quoteExpiresAt=new Date(Date.now()+15*60*1000).toISOString();

    const alternatives={
      flights:flightChoices.map((choices,i)=>({segment:i,choices:choices.slice(0,3)})),
      hotels:hotelChoices.map((choices,i)=>({stay:i,choices:choices.slice(0,3)}))
    };

    const response={
      mode,
      provider,
      pricing:{flightMarkupPercent:fm*100,hotelMarkupPercent:hm*100,serviceFee:fee},
      itinerary:{segments,stays},
      selected:{flights:selectedFlights,hotels:selectedHotels},
      alternatives,
      totals:{flightNet,hotelNet,netCost:flightNet+hotelNet,markup,total,perPerson:total/adults,currency:'USD'},
      quoteExpiresAt
    };

    await logSearch({
      adults,segments,stays,provider,mode,
      flightCount:flightChoices.reduce((s,x)=>s+x.length,0),
      hotelCount:hotelChoices.reduce((s,x)=>s+x.length,0),
      total,perPerson:total/adults
    });

    res.status(200).json(response);
  }catch(e){
    res.status(500).json({error:e.message||'Multi-city search failed'});
  }
};