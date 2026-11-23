import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/** Read-only, instrument-key driven NSE/BSE terminal endpoints.
 * All provider requests are performed on localhost by the Java server.
 * No broker orders; missing provider data never converts to synthetic data in LIVE mode.
 */
final class MarketUniverse {
    private static final List<String> BASKET = List.of("RELIANCE","HDFCBANK","ICICIBANK","TCS","INFY","SBIN","ITC","BHARTIARTL","AXISBANK","LT","MARUTI","KOTAKBANK");
    private static final Map<String,String> KEYS = new ConcurrentHashMap<>();
    private static final Map<String,Object> HM_CACHE = new ConcurrentHashMap<>();
    private static long HM_UNTIL = 0;
    private static final Object HM_LOCK = new Object();
    private static final Map<String, Object> DEMOS = new LinkedHashMap<>();
    static {
        for(String sym:BASKET) DEMOS.put(sym,"DEMO_EQ|"+sym);
    }
    private static Map<String,Object> map(Object... v){return MarketPulseServer.map(v);}
    private static Map<String,Object> m(Object v){return MarketPulseServer.asMap(v);}
    private static List<Object> arr(Object v){return MarketPulseServer.asList(v);}
    private static String s(Object v){return MarketPulseServer.str(v);}
    private static double n(Object v){return MarketPulseServer.num(v);}
    private static String param(Map<String,String> q,String k,String def,int max){String v=q.getOrDefault(k,def).trim();if(v.length()>max)throw new MarketPulseServer.ApiException(400,k+" too long");return v;}
    private static String key(Map<String,String> q){
        String v=param(q,"key","",100);
        if(!v.matches("(?:NSE|BSE|DEMO)_(?:EQ|FO|INDEX)\\|[A-Za-z0-9._ -]{1,78}"))throw new MarketPulseServer.ApiException(400,"Use a listed NSE/BSE instrument key from search.");
        if(UpstoxAdapter.enabled()&&v.startsWith("DEMO_"))throw new MarketPulseServer.ApiException(400,"Synthetic instruments are disabled while in live mode.");
        return v;
    }
    static Map<String,Object> search(Map<String,String> q){
        String phrase=param(q,"query","",50),exchange=param(q,"exchange","ALL",4).toUpperCase(Locale.ROOT),segment=param(q,"segment","ALL",6).toUpperCase(Locale.ROOT);
        if(phrase.length()<2)throw new MarketPulseServer.ApiException(400,"Type at least 2 characters to search.");
        if(!List.of("NSE","BSE","ALL").contains(exchange)||!List.of("ALL","EQ","FO","INDEX").contains(segment))throw new MarketPulseServer.ApiException(400,"Unsupported exchange or segment filter.");
        List<Map<String,Object>> list=new ArrayList<>();
        if(UpstoxAdapter.enabled()){
            Map<String,String> qs=new LinkedHashMap<>(Map.of("query",phrase,"records","30","page_number","1"));
            if(!exchange.equals("ALL"))qs.put("exchanges",exchange);
            if(!segment.equals("ALL"))qs.put("segments",segment);
            for(Object item:arr(UpstoxAdapter.request("/v2/instruments/search",qs,20_000))){
                Map<String,Object> x=m(item);String ik=s(x.get("instrument_key"));
                if(!ik.matches("(?:NSE|BSE)_(?:EQ|FO|INDEX)\\|[A-Za-z0-9._ -]{1,78}"))continue;
                list.add(map("key",ik,"symbol",s(x.get("trading_symbol")),"name",s(x.get("name")),"exchange",s(x.get("exchange")),"segment",s(x.get("segment")),"type",s(x.get("instrument_type")),"expiry",s(x.get("expiry")),"lotSize",n(x.get("lot_size")),"strike",n(x.get("strike_price"))));
            }
        }else{
            for(String sym:BASKET){if(!sym.contains(phrase.toUpperCase(Locale.ROOT)))continue;if(exchange.equals("BSE")||segment.equals("FO")||segment.equals("INDEX"))continue;
                list.add(map("key","DEMO_EQ|"+sym,"symbol",sym,"name",sym+" (synthetic example)","exchange","NSE","segment","NSE_EQ","type","EQ","expiry","","lotSize",1,"strike",0));}
        }
        return map("mode",UpstoxAdapter.enabled()?"LIVE":"DEMO","provider",UpstoxAdapter.enabled()?"Upstox":"Synthetic demo","instruments",list,"count",list.size(),"note","Search covers only contracts returned by the provider, not guaranteed all exchange listings.");
    }
    static Map<String,Object> quote(Map<String,String> q){
        String ik=key(q);
        if(!UpstoxAdapter.enabled())return demoQuote(ik);
        Map<String,Object> raw=UpstoxAdapter.fullQuote(ik);
        long last=UpstoxAdapter.toMillis(raw.get("last_trade_time"));
        long snap=UpstoxAdapter.toMillis(raw.get("timestamp"));
        long timestamp=last>0?last:snap;
        long age=timestamp>0?(System.currentTimeMillis()-timestamp)/1000:-1;
        Map<String,Object> depth=m(raw.get("depth"));
        double bid=0,ask=0,buyQty=0,sellQty=0;
        List<Map<String,Object>> buy=new ArrayList<>(),sell=new ArrayList<>();
        for(Object row:arr(depth.get("buy"))){Map<String,Object> r=m(row);double price=n(r.get("price")),qty=n(r.get("quantity"));if(price>0&&qty>0){if(bid==0)bid=price;buyQty+=qty;buy.add(map("price",price,"quantity",qty));}}
        for(Object row:arr(depth.get("sell"))){Map<String,Object> r=m(row);double price=n(r.get("price")),qty=n(r.get("quantity"));if(price>0&&qty>0){if(ask==0)ask=price;sellQty+=qty;sell.add(map("price",price,"quantity",qty));}}
        double ltp=n(raw.get("last_price")),prev=n(raw.get("prev_close_price"));
        if(prev<=0)prev=n(raw.get("cp")); // Compatibility with older quote fixtures.
        return map("mode","LIVE","source","Upstox full quote v3 · REST snapshot","key",ik,"ltp",ltp,"previousClose",prev,"changePct",prev>0?(ltp-prev)*100/prev:null,
            "bid",bid,"ask",ask,"bidQty",buyQty,"askQty",sellQty,"depthBuy",buy,"depthSell",sell,"volume",n(raw.get("volume")),"oi",n(raw.get("oi")),
            "timestamp",timestamp>0?Instant.ofEpochMilli(timestamp).toString():"","ageSeconds",age,"fresh",MarketPulseServer.normalHours()&&age>=-30&&age<=60,"marketOpenApprox",MarketPulseServer.normalHours(),"receivedAt",Instant.now().toString());
    }
    static Map<String,Object> chart(Map<String,String> q){
        String ik=key(q);int mins;
        try{mins=Integer.parseInt(param(q,"interval","5",3));}catch(Exception e){throw new MarketPulseServer.ApiException(400,"Invalid chart interval.");}
        if(!List.of(1,3,5,15,30,60).contains(mins))throw new MarketPulseServer.ApiException(400,"Use 1/3/5/15/30/60 minute candles.");
        if(!UpstoxAdapter.enabled())return demoChart(ik,mins);
        List<MarketPulseServer.Bar> bars=UpstoxAdapter.candlesAtInterval(ik,mins);
        if(bars.isEmpty())throw new MarketPulseServer.ApiException(404,"Provider returned no candles for this instrument and timeframe.");
        List<Map<String,Object>> out=new ArrayList<>();for(var b:bars)out.add(map("time",b.time(),"open",b.open(),"high",b.high(),"low",b.low(),"close",b.close(),"volume",b.volume(),"oi",b.oi()));
        return map("mode","LIVE","source","Upstox V3 exchange candles","key",ik,"interval",mins,"candles",out,"asOf",Instant.now().toString(),"notice","Quote updates and candles are REST polling, not tick-by-tick streaming.");
    }
    static Map<String,Object> news(Map<String,String> q){
        String ik=key(q);if(!UpstoxAdapter.enabled())return map("mode","DEMO","headlines",List.of(),"notice","No synthetic news stories. Connect Upstox for provider headlines.");
        Map<String,Object> payload=m(UpstoxAdapter.request("/v2/news",Map.of("category","instrument_keys","instrument_keys",ik,"page_size","20"),65_000));
        List<Map<String,Object>> items=new ArrayList<>();
        for(Object v:arr(payload.get(ik))){Map<String,Object> x=m(v);String url=s(x.get("article_link"));if(!url.startsWith("https://"))url="";
            items.add(map("headline",s(x.get("heading")),"summary",s(x.get("summary")),"url",url,"publishedMs",n(x.get("published_time"))));}
        return map("mode","LIVE","source","Upstox News API (past 7 days)","key",ik,"headlines",items,"fetchedAt",Instant.now().toString(),"notice","News may appear with publication/provider delays. Headlines are not trading instructions.");
    }
    static Map<String,Object> options(Map<String,String> q){
        String ik=key(q);
        if(ik.contains("_FO|"))throw new MarketPulseServer.ApiException(400,"Choose an underlying equity or index, not a derivative contract.");
        String expiry=param(q,"expiry","",10);
        if(!expiry.isBlank()&&!expiry.matches("\\d{4}-\\d{2}-\\d{2}"))throw new MarketPulseServer.ApiException(400,"Expiry must be YYYY-MM-DD.");
        if(!UpstoxAdapter.enabled()){
            return map("mode","DEMO","key",ik,"expiries",List.of(),"rows",List.of(),"source","No synthetic equity options universe; enable Upstox to browse actual contracts.");
        }
        if(expiry.isBlank()){
            List<Object> raw=arr(UpstoxAdapter.request("/v2/option/contract",Map.of("instrument_key",ik),180_000));
            TreeSet<String> dates=new TreeSet<>();String today=LocalDate.now(MarketPulseServer.IST).toString();
            for(Object v:raw){String d=s(m(v).get("expiry"));if(d.matches("\\d{4}-\\d{2}-\\d{2}")&&d.compareTo(today)>=0)dates.add(d);}
            return map("mode","LIVE","key",ik,"expiries",new ArrayList<>(dates),"source","Upstox option-contract catalogue");
        }
        List<Map<String,Object>> rows=new ArrayList<>();
        List<Object> raw=arr(UpstoxAdapter.request("/v2/option/chain",Map.of("instrument_key",ik,"expiry_date",expiry),18_000));
        for(Object v:raw){Map<String,Object> r=m(v);double strike=n(r.get("strike_price"));if(strike<=0)continue;
            rows.add(map("strike",strike,"spot",n(r.get("underlying_spot_price")),"CE",optionLeg(r.get("call_options")),"PE",optionLeg(r.get("put_options"))));
        }
        rows.sort(Comparator.comparingDouble(v->n(v.get("strike"))));
        return map("mode","LIVE","key",ik,"expiry",expiry,"rows",rows,"source","Upstox option chain · provider-listed strike keys");
    }
    private static Map<String,Object> optionLeg(Object value){Map<String,Object> a=m(value),b=m(a.get("market_data")),g=m(a.get("option_greeks"));
        return map("key",s(a.get("instrument_key")),"ltp",n(b.get("ltp")),"oi",n(b.get("oi")),"volume",n(b.get("volume")),"iv",n(g.get("iv")),"delta",n(g.get("delta")),"theta",n(g.get("theta")));
    }
    static Map<String,Object> heatmap(Map<String,String> q){
        String ex=param(q,"exchange","NSE",3).toUpperCase(Locale.ROOT);if(!List.of("NSE","BSE").contains(ex))throw new MarketPulseServer.ApiException(400,"Choose NSE/BSE.");
        if(!UpstoxAdapter.enabled()){
            List<Map<String,Object>> demo=new ArrayList<>();int j=0;for(String sym:BASKET){double change=Math.sin(j*2.17)*2.7,ltp=100+((j+7)*187)%2800;j++;
                demo.add(map("symbol",sym,"key","DEMO_EQ|"+sym,"exchange",ex,"ltp",ltp,"changePct",MarketPulseServer.round(change),"volume",50000+j*10000,"fresh",false));}
            return map("mode","DEMO","exchange",ex,"items",demo,"source","SYNTHETIC BASKET","asOf",Instant.now().toString(),"coverage","12 illustrative demo equities only");
        }
        synchronized(HM_LOCK){
            String ckey="HM:"+ex;long now=System.currentTimeMillis();if(HM_CACHE.containsKey(ckey)&&now<HM_UNTIL)return m(HM_CACHE.get(ckey));
            List<String> keys=new ArrayList<>();Map<String,String> names=new HashMap<>();
            for(String sym:BASKET){
                String ck=ex+":"+sym,found=KEYS.get(ck);
                if(found==null){
                    try{
                        List<Object> results=arr(UpstoxAdapter.request("/v2/instruments/search",Map.of("query",sym,"exchanges",ex,"segments","EQ","records","10"),3600_000));
                        found="";for(Object v:results){Map<String,Object> x=m(v);if(sym.equalsIgnoreCase(s(x.get("trading_symbol")))&&s(x.get("instrument_key")).startsWith(ex+"_EQ|")){found=s(x.get("instrument_key"));break;}}
                        KEYS.put(ck,found);
                    }catch(MarketPulseServer.ApiException err){continue;}
                }
                if(!found.isEmpty()){keys.add(found);names.put(found,sym);}
            }
            if(keys.isEmpty())throw new MarketPulseServer.ApiException(503,"No instruments were resolved for the equity heatmap.");
            // Get quotes in one authorized batch to avoid per-stock polling and respect rate limits.
            Map<String,Object> snapshots=m(UpstoxAdapter.request("/v3/market-quote/quotes",Map.of("instrument_key",String.join(",",keys)),15_000));
            // V3 responses are keyed by exchange + trading symbol, not instrument key.
            // Match each returned quote by its authoritative instrument_token field.
            Map<String,Map<String,Object>> byKey=new HashMap<>();
            for(Object raw:snapshots.values()){
                Map<String,Object> quote=m(raw);
                String token=s(quote.get("instrument_token"));
                if(!token.isBlank())byKey.put(token,quote);
            }
            List<Map<String,Object>> items=new ArrayList<>();
            for(String ik:keys){Map<String,Object> r=byKey.get(ik);if(r==null)continue;
                double ltp=n(r.get("last_price")),prev=n(r.get("prev_close_price"));
                if(prev<=0)prev=n(r.get("cp"));
                items.add(map("symbol",names.get(ik),"key",ik,"exchange",ex,"ltp",ltp,"changePct",prev>0?MarketPulseServer.round(100*(ltp-prev)/prev):null,"volume",n(r.get("volume")),"fresh",MarketPulseServer.normalHours()));
            }
            Map<String,Object> out=map("mode","LIVE","source","Upstox listed-equity REST quote sample","exchange",ex,"items",items,"asOf",Instant.now().toString(),"coverage",items.size()+" of "+BASKET.size()+" requested stocks (not whole market)");
            HM_CACHE.put(ckey,out);HM_UNTIL=now+30_000;return out;
        }
    }
    private static Map<String,Object> demoQuote(String ik){int h=Math.abs(ik.hashCode());double p=50+h%2800,cp=p/(1+(h%36-18)/1000.0);return map("mode","DEMO","source","SYNTHETIC · NOT MARKET DATA","key",ik,"ltp",p,"previousClose",cp,"changePct",MarketPulseServer.round(100*(p/cp-1)),"bid",p-.1,"ask",p+.1,"bidQty",100,"askQty",120,"depthBuy",List.of(),"depthSell",List.of(),"volume",5000,"oi",0,"timestamp","","ageSeconds",-1,"fresh",false,"marketOpenApprox",false,"receivedAt",Instant.now().toString());}
    private static Map<String,Object> demoChart(String ik,int mins){Random r=new Random(ik.hashCode()*31L+mins);double p=80+Math.abs(ik.hashCode()%900);List<Map<String,Object>> candles=new ArrayList<>();ZonedDateTime start=ZonedDateTime.now(MarketPulseServer.IST).minusDays(1).withHour(9).withMinute(15).withSecond(0);
        for(int i=0;i<150;i++){double o=p,c=Math.max(1,o+(r.nextDouble()-.48)*Math.max(.1,o*.009)),hi=Math.max(o,c)+r.nextDouble()*o*.002,lo=Math.max(.01,Math.min(o,c)-r.nextDouble()*o*.002);candles.add(map("time",start.plusMinutes((long)i*mins).toOffsetDateTime().toString(),"open",MarketPulseServer.round(o),"high",MarketPulseServer.round(hi),"low",MarketPulseServer.round(lo),"close",MarketPulseServer.round(c),"volume",300+r.nextInt(4000)));p=c;}
        return map("mode","DEMO","source","SYNTHETIC CANDLES","key",ik,"interval",mins,"candles",candles,"asOf",Instant.now().toString(),"notice","Artificial candles generated to test chart controls. Never use for trading.");}
}
