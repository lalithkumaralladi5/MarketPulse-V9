import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** Upstox Analytics Token adapter. GET-only, no trading or browser-side tokens. */
final class UpstoxAdapter {
    private static final String TOKEN = System.getenv().getOrDefault("UPSTOX_ACCESS_TOKEN", "").trim();
    private static final String TEST_URL = System.getenv().getOrDefault("UPSTOX_TEST_BASE", "").trim();
    // Mock-server override is restricted to loopback to prevent sending tokens to unknown hosts.
    private static final String BASE = TEST_URL.matches("http://(127\\.0\\.0\\.1|localhost):[0-9]{2,5}") ? TEST_URL : "https://api.upstox.com";
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private static final Map<String, Cached> CACHE = new ConcurrentHashMap<>();
    private record Cached(long until, Object data) {}
    static boolean enabled() { return !TOKEN.isBlank(); }
    private static String esc(String v) {return URLEncoder.encode(v,StandardCharsets.UTF_8);}
    private static String underlying(String exchange, String symbol) {
        if(!"NSE".equals(exchange) || !"NIFTY".equals(symbol))
            throw new MarketPulseServer.ApiException(400,"The current Upstox connector supports NSE / NIFTY only. Switch to NSE and NIFTY.");
        return "NSE_INDEX|Nifty 50";
    }
    static Object request(String path, Map<String,String> qs, long ttlMillis) {
        StringBuilder uri = new StringBuilder(BASE).append(path);
        if(!qs.isEmpty()) {
            uri.append('?'); boolean first = true;
            for(var e:new TreeMap<>(qs).entrySet()) {
                if(!first) uri.append('&'); first=false;
                uri.append(esc(e.getKey())).append('=').append(esc(e.getValue()));
            }
        }
        String url=uri.toString(); long now=System.currentTimeMillis();Cached c=CACHE.get(url);
        if(c!=null && c.until>now) return c.data;
        synchronized(CACHE) {
            c=CACHE.get(url);now=System.currentTimeMillis();if(c!=null&&c.until>now)return c.data;
            try {
                HttpRequest req=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(14))
                    .header("Authorization","Bearer "+TOKEN).header("Accept","application/json")
                    .GET().build();
                HttpResponse<String> resp=HTTP.send(req,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if(resp.statusCode()==401 || resp.statusCode()==403)throw new MarketPulseServer.ApiException(502,"Upstox rejected the Analytics Token or this data permission (HTTP "+resp.statusCode()+"). Check API access locally.");
                if(resp.statusCode()==429)throw new MarketPulseServer.ApiException(503,"Upstox rate limit (429). Reduce refresh frequency and try again.");
                if(resp.statusCode()!=200)throw new MarketPulseServer.ApiException(502,"Upstox HTTP "+resp.statusCode()+"; confirm the instrument and expiry are listed.");
                Map<String,Object> body=MarketPulseServer.asMap(MarketPulseServer.Json.parse(resp.body()));
                if(!"success".equalsIgnoreCase(MarketPulseServer.str(body.get("status"))))throw new MarketPulseServer.ApiException(502,"Upstox returned an unsuccessful response. Check access and instrument parameters.");
                Object payload=body.get("data");if(payload==null)throw new MarketPulseServer.ApiException(502,"Upstox returned no data.");
                CACHE.put(url,new Cached(System.currentTimeMillis()+ttlMillis,payload));
                return payload;
            }catch(MarketPulseServer.ApiException e){throw e;}
            catch(InterruptedException e){Thread.currentThread().interrupt();throw new MarketPulseServer.ApiException(503,"Upstox request interrupted.");}
            catch(IOException e){throw new MarketPulseServer.ApiException(503,"Cannot reach Upstox. Check your internet connection.");}
            catch(RuntimeException e){throw new MarketPulseServer.ApiException(502,"Could not parse Upstox API data. Check API version.");}
        }
    }
    static Map<String,Object> expiries(String ex,String und) {
        String k=underlying(ex,und);
        List<Object> raw=MarketPulseServer.asList(request("/v2/option/contract",Map.of("instrument_key",k),180_000));
        TreeSet<String> dates=new TreeSet<>();String today=LocalDate.now(MarketPulseServer.IST).toString();
        for(Object o:raw) {String d=MarketPulseServer.str(MarketPulseServer.asMap(o).get("expiry"));if(d.matches("\\d{4}-\\d{2}-\\d{2}")&&d.compareTo(today)>=0)dates.add(d);}
        if(dates.isEmpty())throw new MarketPulseServer.ApiException(502,"No current NIFTY option contracts returned by Upstox.");
        return MarketPulseServer.map("mode","LIVE","provider","Upstox","expiries",new ArrayList<>(dates),"warning","Exchange-listed expiry dates from the Upstox option-contract API.");
    }
    static Map<String,Object> chain(String ex,String und,String expiry) {
        String k=underlying(ex,und);
        List<Object> data=MarketPulseServer.asList(request("/v2/option/chain",Map.of("instrument_key",k,"expiry_date",expiry),12_000));
        if(data.isEmpty())throw new MarketPulseServer.ApiException(404,"No Upstox NIFTY option contracts for this expiry.");
        double spot=0;List<Map<String,Object>> rows=new ArrayList<>();
        for(Object o:data) {
            Map<String,Object> r=MarketPulseServer.asMap(o);
            double strike=MarketPulseServer.num(r.get("strike_price"));
            if(strike<=0)continue;
            spot=MarketPulseServer.num(r.get("underlying_spot_price"))>0?MarketPulseServer.num(r.get("underlying_spot_price")):spot;
            rows.add(MarketPulseServer.map("strike",strike,"CE",leg(r.get("call_options")),"PE",leg(r.get("put_options"))));
        }
        rows.sort(Comparator.comparingDouble(r->MarketPulseServer.num(r.get("strike"))));
        if(rows.isEmpty()||spot<=0)throw new MarketPulseServer.ApiException(502,"Option-chain spot price or strikes are missing.");
        return MarketPulseServer.map("mode","LIVE","provider","Upstox","exchange",ex,"underlying",und,"expiry",expiry,"underlyingLtp",spot,"rows",rows,"asOf",ZonedDateTime.now(MarketPulseServer.IST).toString(),"warning","Upstox REST snapshots every ~12s; OI is outstanding interest, and displayed depth is resting liquidity—not executed flow.");
    }
    private static Map<String,Object> leg(Object value) {
        Map<String,Object> m=MarketPulseServer.asMap(value);
        Map<String,Object> market=MarketPulseServer.asMap(m.get("market_data")),g=MarketPulseServer.asMap(m.get("option_greeks"));
        return MarketPulseServer.map("symbol",MarketPulseServer.str(m.get("instrument_key")),
            "instrumentKey",MarketPulseServer.str(m.get("instrument_key")),
            "ltp",MarketPulseServer.num(market.get("ltp")),"oi",MarketPulseServer.num(market.get("oi")),"volume",MarketPulseServer.num(market.get("volume")),
            "iv",MarketPulseServer.num(g.get("iv")),"delta",MarketPulseServer.num(g.get("delta")),"theta",MarketPulseServer.num(g.get("theta")));
    }
    static Map<String,Object> fullQuote(String key) {
        Map<String,Object> data=MarketPulseServer.asMap(request("/v3/market-quote/quotes",Map.of("instrument_key",key),5_000));
        Map<String,Object> m=MarketPulseServer.asMap(data.get(key.replace('|',':')));
        if(m.isEmpty()) {
            for(Object v:data.values()){
                Map<String,Object> candidate=MarketPulseServer.asMap(v);
                if(key.equals(MarketPulseServer.str(candidate.get("instrument_token")))){m=candidate;break;}
            }
        }
        if(m.isEmpty())throw new MarketPulseServer.ApiException(502,"The selected contract quote is missing from the Upstox V3 response.");
        return m;
    }
    private static Map<String,Object> adaptQuote(Map<String,Object> q) {
        Map<String,Object> d=MarketPulseServer.asMap(q.get("depth"));
        List<Object> bs=MarketPulseServer.asList(d.get("buy")),as=MarketPulseServer.asList(d.get("sell"));
        double bid=best(bs),ask=best(as);
        return MarketPulseServer.map("last_price",MarketPulseServer.num(q.get("last_price")),"bid_price",bid,"offer_price",ask,"depth",d,
            "volume",MarketPulseServer.num(q.get("volume")),"open_interest",MarketPulseServer.num(q.get("oi")),
            "previous_open_interest",MarketPulseServer.num(q.get("previous_oi")),"last_trade_time",q.get("last_trade_time"),"snapshot_time",q.get("timestamp"));
    }
    private static double best(List<Object> levels) {
        for(Object o:levels){Map<String,Object> m=MarketPulseServer.asMap(o);double px=MarketPulseServer.num(m.get("price")),qty=MarketPulseServer.num(m.get("quantity"));if(px>0&&qty>0)return px;}return 0;
    }
    private static List<MarketPulseServer.Bar> candles(String key) {
        LocalDate day=LocalDate.now(MarketPulseServer.IST);
        // Previous trading sessions supply enough bars for EMA calculations early in the day.
        String encoded=esc(key).replace("+","%20");List<MarketPulseServer.Bar> list=new ArrayList<>();
        String historical="/v3/historical-candle/"+encoded+"/minutes/5/"+day.minusDays(1)+"/"+day.minusDays(8);
        List<Object> older=MarketPulseServer.asList(MarketPulseServer.asMap(request(historical,Map.of(),240_000)).get("candles"));
        String today="/v3/historical-candle/intraday/"+encoded+"/minutes/5";
        List<Object> intraday=MarketPulseServer.asList(MarketPulseServer.asMap(request(today,Map.of(),25_000)).get("candles"));
        for(Object raw:older)appendBar(list,raw);
        for(Object raw:intraday)appendBar(list,raw);
        TreeMap<String,MarketPulseServer.Bar> sorted=new TreeMap<>();for(var x:list)sorted.put(x.time(),x);
        List<MarketPulseServer.Bar> result=new ArrayList<>(sorted.values());
        return result.size()>200?result.subList(result.size()-200,result.size()):result;
    }
    private static void appendBar(List<MarketPulseServer.Bar> out,Object o) {
        List<Object> a=MarketPulseServer.asList(o);if(a.size()<6)return;
        String t=MarketPulseServer.str(a.get(0));double close=MarketPulseServer.num(a.get(4));if(close<=0)return;
        out.add(new MarketPulseServer.Bar(t,MarketPulseServer.num(a.get(1)),MarketPulseServer.num(a.get(2)),MarketPulseServer.num(a.get(3)),close,MarketPulseServer.num(a.get(5)),a.size()>6?MarketPulseServer.num(a.get(6)):0));
    }
    static Map<String,Object> analyze(String ex,String und,String exp,double strike,String type) {
        String idxKey=underlying(ex,und);
        Map<String,Object> ch=chain(ex,und,exp); double spot=MarketPulseServer.num(ch.get("underlyingLtp"));
        Map<String,Object> leg=null;
        for(Object o:MarketPulseServer.asList(ch.get("rows"))) {
            Map<String,Object> row=MarketPulseServer.asMap(o);
            if(Math.abs(MarketPulseServer.num(row.get("strike"))-strike)<.001) {leg=MarketPulseServer.asMap(row.get(type));break;}
        }
        if(leg==null||MarketPulseServer.str(leg.get("instrumentKey")).isEmpty())throw new MarketPulseServer.ApiException(404,"The requested CE/PE strike is not listed for this expiry.");
        String key=MarketPulseServer.str(leg.get("instrumentKey"));
        Map<String,Object> q=adaptQuote(fullQuote(key));
        List<MarketPulseServer.Bar> bars=candles(key),index=candles(idxKey);
        Map<String,Object> result=MarketPulseServer.signal(ex,und,exp,strike,type,key,spot,leg,q,bars,index);
        // Never call a configured token "live" until a real provider quote has been fetched.
        result.put("source","Upstox option chain + Full Quote V3 + 5m candles (REST snapshots)");
        result.put("provider","Upstox");result.put("quoteAsOf",q.get("snapshot_time"));
        boolean snapshotFresh=false;
        try {String ts=MarketPulseServer.str(q.get("snapshot_time"));snapshotFresh=Math.abs(Duration.between(OffsetDateTime.parse(ts).toInstant(),Instant.now()).getSeconds())<=60;}catch(Exception ignored){}
        Map<String,Object> quality=MarketPulseServer.asMap(result.get("dataQuality"));
        quality.put("snapshotFresh",snapshotFresh);quality.put("liveEntitlementTested",true);result.put("dataQuality",quality);
        if(!snapshotFresh){
            quality.put("fresh",false);result.put("signal","WAIT");
            List<String> reasons=new ArrayList<>();reasons.add("Upstox snapshot timestamp missing/older than 60s; signals blocked.");
            reasons.addAll(MarketPulseServer.asList(result.get("reasons")).stream().map(String::valueOf).toList());result.put("reasons",reasons);
        }
        return result;
    }
    /** Read-only contract chart: genuine Upstox historical/intraday OHLCV plus a separate quote snapshot.
     * Quotes are NOT synthesized into OHLC bars; historical candle intervals remain provider-defined.
     */
    static Map<String,Object> chart(String ex,String und,String exp,double strike,String type,int interval) {
        String idx=underlying(ex,und);
        Map<String,Object> ch=chain(ex,und,exp);
        Map<String,Object> leg=null;
        for(Object o:MarketPulseServer.asList(ch.get("rows"))){
            Map<String,Object> r=MarketPulseServer.asMap(o);
            if(Math.abs(MarketPulseServer.num(r.get("strike"))-strike)<0.001){leg=MarketPulseServer.asMap(r.get(type));break;}
        }
        if(leg==null||MarketPulseServer.str(leg.get("instrumentKey")).isBlank())
            throw new MarketPulseServer.ApiException(404,"The requested option contract is not listed in the current chain.");
        String key=MarketPulseServer.str(leg.get("instrumentKey"));
        Map<String,Object> q=fullQuote(key);
        List<MarketPulseServer.Bar> series=candlesAtInterval(key,interval);
        if(series.isEmpty()) throw new MarketPulseServer.ApiException(502,"Upstox has not supplied intraday or historical candles for this contract.");
        long lastTradeMs=toMillis(q.get("last_trade_time"));
        long age=lastTradeMs>0?Math.max(0,(System.currentTimeMillis()-lastTradeMs)/1000): -1;
        boolean fresh=age>=0&&age<=120;
        List<Map<String,Object>> points=new ArrayList<>();
        for(MarketPulseServer.Bar b:series){
            points.add(MarketPulseServer.map("time",b.time(),"open",b.open(),"high",b.high(),"low",b.low(),"close",b.close(),"volume",b.volume(),"oi",b.oi()));
        }
        return MarketPulseServer.map("provider","Upstox","mode","LIVE","source","Upstox V3 historical/intraday candles & Full Quote V3",
            "exchange",ex,"underlying",und,"expiry",exp,"strike",strike,"type",type,"instrumentKey",key,
            "intervalMinutes",interval,"candles",points,"ltp",MarketPulseServer.num(q.get("last_price")),
            "lastTradeTime",lastTradeMs>0?Instant.ofEpochMilli(lastTradeMs).toString():"",
            "quoteAgeSeconds",age,"quoteFresh",fresh,"marketOpen",MarketPulseServer.normalHours(),
            "polledAt",Instant.now().toString(),"pollSeconds",12,
            "notice","REST snapshot polling, not tick-by-tick WebSocket. Candles are provider OHLCV; the latest quote is shown separately.");
    }
    static long toMillis(Object raw){
        try {
            String s=MarketPulseServer.str(raw);
            if(s.matches("[0-9]{10,16}")){long n=Long.parseLong(s);return n<100_000_000_000L?n*1000L:n;}
            return Instant.parse(s).toEpochMilli();
        }catch(Exception ignored){return -1;}
    }
    static List<MarketPulseServer.Bar> candlesAtInterval(String key,int mins){
        LocalDate day=LocalDate.now(MarketPulseServer.IST);
        String encoded=esc(key).replace("+","%20");
        List<MarketPulseServer.Bar> all=new ArrayList<>();
        // Short prior window keeps the chart useful after the close and on non-trading days.
        String previous="/v3/historical-candle/"+encoded+"/minutes/"+mins+"/"+day.minusDays(1)+"/"+day.minusDays(8);
        List<Object> older=MarketPulseServer.asList(MarketPulseServer.asMap(request(previous,Map.of(),180_000)).get("candles"));
        String current="/v3/historical-candle/intraday/"+encoded+"/minutes/"+mins;
        List<Object> today=MarketPulseServer.asList(MarketPulseServer.asMap(request(current,Map.of(),20_000)).get("candles"));
        for(Object o:older)appendBar(all,o);
        for(Object o:today)appendBar(all,o);
        TreeMap<String,MarketPulseServer.Bar> chronological=new TreeMap<>();
        for(var b:all)chronological.put(b.time(),b);
        List<MarketPulseServer.Bar> result=new ArrayList<>(chronological.values());
        return result.size()>620?result.subList(result.size()-620,result.size()):result;
    }

}
