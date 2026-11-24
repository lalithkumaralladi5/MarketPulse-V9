import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

/** Read-only public-provider research for US stocks, forex and commodity futures.
 * This is NOT Upstox data, an exchange feed, or broker order routing.
 */
final class GlobalMarketAdapter {
    private static final HttpClient HTTP=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build();
    private static final Map<String,Map<String,String>> SYMBOLS=new LinkedHashMap<>();
    private static void add(String category,String symbol,String name){SYMBOLS.put(symbol,Map.of("category",category,"symbol",symbol,"name",name));}
    static {
        add("US STOCKS","AAPL","Apple");add("US STOCKS","MSFT","Microsoft");
        add("US STOCKS","NVDA","NVIDIA");add("US STOCKS","GOOGL","Alphabet");
        add("US STOCKS","AMZN","Amazon");add("US STOCKS","META","Meta");
        add("US STOCKS","TSLA","Tesla");add("US STOCKS","AMD","AMD");
        add("US STOCKS","JPM","JPMorgan");add("US STOCKS","NFLX","Netflix");
        add("FOREX","EURUSD=X","Euro / US Dollar");add("FOREX","GBPUSD=X","Pound / US Dollar");
        add("FOREX","USDJPY=X","US Dollar / Yen");add("FOREX","USDINR=X","US Dollar / Rupee");
        add("FOREX","AUDUSD=X","Australian Dollar / US Dollar");
        add("COMMODITIES","GC=F","Gold futures");add("COMMODITIES","SI=F","Silver futures");
        add("COMMODITIES","CL=F","WTI crude futures");add("COMMODITIES","BZ=F","Brent futures");
        add("COMMODITIES","NG=F","Natural gas futures");add("COMMODITIES","HG=F","Copper futures");
    }
    private static Map<String,Object> m(Object... v){return MarketPulseServer.map(v);}
    static Object search(Map<String,String> q){
        String term=q.getOrDefault("query","").trim().toUpperCase(Locale.ROOT);
        String category=q.getOrDefault("category","ALL").trim().toUpperCase(Locale.ROOT);
        if(term.length()>60||!List.of("ALL","US STOCKS","FOREX","COMMODITIES").contains(category))
            throw new MarketPulseServer.ApiException(400,"Invalid global market search.");
        List<Map<String,Object>> result=new ArrayList<>();
        for(Map<String,String> item:SYMBOLS.values()){
            String sym=item.get("symbol"),name=item.get("name"),cat=item.get("category");
            if(!category.equals("ALL")&&!category.equals(cat))continue;
            if(!term.isBlank()&&!sym.toUpperCase(Locale.ROOT).contains(term)&&!name.toUpperCase(Locale.ROOT).contains(term))continue;
            result.add(m("symbol",sym,"name",name,"category",cat,
                "key",(cat.equals("US STOCKS")?"US_STOCK":cat.equals("FOREX")?"FOREX":"COMMODITY")+"|"+sym));
        }
        return m("mode","REFERENCE_CATALOGUE","provider","Curated symbols, not price data",
            "instruments",result,"count",result.size(),"readOnly",true);
    }
    private static String symbol(String key){
        String[] parts=(key==null?"":key).split("\\|",-1);
        if(parts.length!=2)throw new MarketPulseServer.ApiException(400,"Specify a recognised global market instrument.");
        String sym=parts[1],prefix=parts[0];
        Map<String,String> item=SYMBOLS.get(sym);
        String required=item==null?"":item.get("category").equals("US STOCKS")?"US_STOCK":
            item.get("category").equals("FOREX")?"FOREX":"COMMODITY";
        if(!required.equals(prefix)||sym.isBlank())throw new MarketPulseServer.ApiException(400,"Unknown global market instrument.");
        return sym;
    }
    private static double number(Object n){try{double x=Double.parseDouble(String.valueOf(n));return Double.isFinite(x)?x:0;}catch(Exception ignored){return 0;}}
    private static double at(List<Object> values,int i){return i<values.size()?number(values.get(i)):0;}
    private static String base(){
        String test=System.getenv("MARKETPULSE_GLOBAL_TEST_BASE");
        // Explicit fixture override for offline CI; never allow browser-supplied URLs.
        if(test!=null&&!test.isBlank()){
            if(!test.matches("http://127\\.0\\.0\\.1:[0-9]{2,5}"))
                throw new MarketPulseServer.ApiException(500,"Invalid global test fixture base.");
            return test;
        }
        return "https://query1.finance.yahoo.com";
    }
    static Object chart(Map<String,String> q){
        String key=q.getOrDefault("key",""),sym=symbol(key);
        int minutes;
        try{minutes=Integer.parseInt(q.getOrDefault("interval","5"));}catch(NumberFormatException e){throw new MarketPulseServer.ApiException(400,"Invalid chart interval.");}
        if(!List.of(1,5,15,30,60).contains(minutes))
            throw new MarketPulseServer.ApiException(400,"Global chart supports 1, 5, 15, 30 and 60 minutes.");
        String range=minutes==1?"5d":minutes<=15?"30d":"60d";
        String endpoint=base()+"/v8/finance/chart/"+URLEncoder.encode(sym,StandardCharsets.UTF_8)
            +"?interval="+minutes+"m&range="+range;
        try{
            HttpRequest request=HttpRequest.newBuilder(URI.create(endpoint))
                .header("Accept","application/json").header("User-Agent","Mozilla/5.0 (compatible; MarketPulseResearch/1.0)")
                .timeout(Duration.ofSeconds(12)).GET().build();
            HttpResponse<String> response=HTTP.send(request,HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if(response.statusCode()!=200)
                throw new MarketPulseServer.ApiException(502,"Public global market provider returned HTTP "+response.statusCode()+".");
            Map<String,Object> envelope=MarketPulseServer.asMap(MarketPulseServer.Json.parse(response.body()));
            Map<String,Object> chart=MarketPulseServer.asMap(envelope.get("chart"));
            List<Object> results=MarketPulseServer.asList(chart.get("result"));
            if(results.isEmpty())throw new MarketPulseServer.ApiException(502,"No global chart available for this symbol/timeframe.");
            Map<String,Object> data=MarketPulseServer.asMap(results.get(0));
            List<Object> timestamps=MarketPulseServer.asList(data.get("timestamp"));
            Map<String,Object> indicators=MarketPulseServer.asMap(data.get("indicators"));
            List<Object> quoteRows=MarketPulseServer.asList(indicators.get("quote"));
            Map<String,Object> bars=MarketPulseServer.asMap(quoteRows.isEmpty()?null:quoteRows.get(0));
            List<Object> open=MarketPulseServer.asList(bars.get("open")),
                high=MarketPulseServer.asList(bars.get("high")),
                low=MarketPulseServer.asList(bars.get("low")),
                close=MarketPulseServer.asList(bars.get("close")),
                volume=MarketPulseServer.asList(bars.get("volume"));
            List<Map<String,Object>> out=new ArrayList<>();
            for(int i=0;i<timestamps.size()&&i<open.size()&&i<close.size()&&i<high.size()&&i<low.size();i++){
                double o=at(open,i),h=at(high,i),l=at(low,i),c=at(close,i);
                long time=(long)number(timestamps.get(i));
                if(time<=0||o<=0||c<=0||h<Math.max(o,c)||l>Math.min(o,c)||l<=0)continue;
                out.add(m("time",Instant.ofEpochSecond(time).toString(),"open",o,"high",h,
                    "low",l,"close",c,"volume",Math.max(0,at(volume,i))));
            }
            if(out.isEmpty())throw new MarketPulseServer.ApiException(502,"Provider returned no valid OHLC bars.");
            Map<String,Object> meta=MarketPulseServer.asMap(data.get("meta"));
            return m("mode","PUBLIC_PROVIDER","provider","Yahoo Finance public chart (unofficial; availability may vary)",
                "key",key,"symbol",sym,"interval",minutes,"candles",out,
                "ltp",number(meta.get("regularMarketPrice")),"currency",MarketPulseServer.str(meta.get("currency")),
                "asOf",Instant.now().toString(),"readOnly",true,
                "notice","Public-provider delayed snapshots may be unavailable or subject to licensing; NOT Upstox, not an exchange tick stream, no broker orders.");
        }catch(MarketPulseServer.ApiException ex){throw ex;}
        catch(InterruptedException ex){Thread.currentThread().interrupt();throw new MarketPulseServer.ApiException(503,"Global provider interrupted.");}
        catch(Exception ex){throw new MarketPulseServer.ApiException(503,"Global market chart provider unavailable; no fabricated price data.");}
    }
}