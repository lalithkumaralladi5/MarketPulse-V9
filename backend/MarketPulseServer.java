import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.*;

/** MarketPulse V9: Java 21, no third-party dependencies, analysis/paper-trading ONLY. */
public class MarketPulseServer {
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final String TOKEN = System.getenv().getOrDefault("GROWW_ACCESS_TOKEN", "").trim();
    static final boolean UPSTOX = UpstoxAdapter.enabled();
    static final boolean LIVE = UPSTOX || !TOKEN.isBlank();
    static final String PROVIDER = UPSTOX?"Upstox":LIVE?"Groww":"Synthetic demo";
    static final String BASE = "https://api.groww.in";
    static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(7)).build();
    static final ConcurrentHashMap<String, Cache> CACHE = new ConcurrentHashMap<>();
    static final Path ROOT = Paths.get("frontend").toAbsolutePath().normalize();
    record Cache(long until, Object value) {}
    record Bar(String time, double open, double high, double low, double close, double volume, double oi) {}
    static final class ApiException extends RuntimeException { final int status; ApiException(int status,String msg){super(msg);this.status=status;} }

    public static void main(String[] args) throws Exception {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8765"));
        String bind=System.getenv().getOrDefault("MARKETPULSE_BIND","127.0.0.1");
        if (!bind.equals("127.0.0.1") && !bind.equals("0.0.0.0")) throw new IllegalArgumentException("Invalid bind address");
        if (!bind.equals("127.0.0.1") && LIVE && System.getenv().getOrDefault("MARKETPULSE_ACCESS_PASSWORD","").length()<16)
            throw new IllegalStateException("Refusing to publish LIVE token-backed data without MARKETPULSE_ACCESS_PASSWORD (min 16 characters)");
        HttpServer server = HttpServer.create(new InetSocketAddress(bind,port),0);
        server.createContext("/",MarketPulseServer::handle);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("MarketPulse V9 : http://127.0.0.1:"+port);
        System.out.println("Data mode: "+(UPSTOX?"UPSTOX ANALYTICS TOKEN (REST snapshot polling)":LIVE?"GROWW LIVE":"DEMO / SYNTHETIC"));
        System.out.println("No broker orders or automatic trades are possible in this build.");
    }

    static void handle(HttpExchange ex) throws IOException {
        ex.getResponseHeaders().set("Cache-Control","no-store");
        ex.getResponseHeaders().set("X-Content-Type-Options","nosniff");
        ex.getResponseHeaders().set("Referrer-Policy","no-referrer");
        ex.getResponseHeaders().set("X-Frame-Options","DENY");
        ex.getResponseHeaders().set("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");
        try {
            if ("/api/health".equals(ex.getRequestURI().getPath())) {send(ex,200,map("ok",true,"service","MarketPulse","mode",LIVE?"LIVE":"DEMO","release","Live Terminal r1","liveStream","SSE_REST"));return;}
            if (!authorized(ex)) return;
            if ("/api/copilot".equals(ex.getRequestURI().getPath())) { PulseCopilot.handle(ex); return; }
            if (!"GET".equals(ex.getRequestMethod())) {send(ex,405,Map.of("error","Only GET supported"));return;}
            URI uri=ex.getRequestURI();String path=uri.getPath();
            if (path.startsWith("/api/")) {
                Map<String,String> q=params(uri.getRawQuery());
                if(path.equals("/api/live/stream")){LiveStream.stream(ex,q);return;}
                Object result=switch(path) {
                    case "/api/status" -> status();
                    case "/api/ml/status" -> MlBridge.status();
                    case "/api/ml/predict" -> MlBridge.predict(q);
                    case "/api/expiries" -> expiries(exch(q),underlying(q));
                    case "/api/chain" -> chain(exch(q),underlying(q),expiry(q));
                    case "/api/analysis" -> analyze(exch(q),underlying(q),expiry(q),strike(q),type(q));
                    case "/api/chart" -> chart(exch(q),underlying(q),expiry(q),strike(q),type(q),chartInterval(q));
                    case "/api/global/search" -> GlobalMarketAdapter.search(q);
                    case "/api/global/chart" -> GlobalMarketAdapter.chart(q);
                    case "/api/universe/search" -> MarketUniverse.search(q);
                    case "/api/universe/chart" -> MarketUniverse.chart(q);
                    case "/api/universe/quote" -> MarketUniverse.quote(q);
                    case "/api/universe/heatmap" -> MarketUniverse.heatmap(q);
                    case "/api/india-heatmap/page" -> IndiaEquityHeatmap.page(q);
                    case "/api/universe/news" -> MarketUniverse.news(q);
                    case "/api/universe/options" -> MarketUniverse.options(q);
                    default -> throw new ApiException(404,"Unknown API endpoint");
                };
                send(ex,200,result);return;
            }
            if (!path.equals("/") && !path.equals("/index.html") && !path.equals("/app.js") && !path.equals("/app.css") && !path.equals("/pro.js") && !path.equals("/pro.css") && !path.equals("/chart.js") && !path.equals("/chart.css") && !path.equals("/pages.js") && !path.equals("/pages.css") && !path.equals("/terminal.js") && !path.equals("/terminal.css") && !path.equals("/ml-panel.js") && !path.equals("/ml-panel.css") && !path.equals("/momentum-signals.js") && !path.equals("/chart-terminal-pro.js") && !path.equals("/chart-terminal-pro.css") && !path.equals("/india-heatmap.js") && !path.equals("/india-heatmap.css") && !path.equals("/trade-desk.js") && !path.equals("/trade-desk.css") && !path.equals("/live-terminal.js") && !path.equals("/live-terminal.css") && !path.equals("/global-market.js") && !path.equals("/global-market.css")) { send(ex,404,Map.of("error","Not found"));return; }
            Path file=ROOT.resolve(path.equals("/")?"index.html":path.substring(1)).normalize();
            if (!file.startsWith(ROOT)||!Files.isRegularFile(file)){send(ex,404,Map.of("error","UI not found. Start this server from the project root."));return;}
            byte[] data=Files.readAllBytes(file);
            ex.getResponseHeaders().set("Content-Type",path.endsWith(".js")?"text/javascript; charset=utf-8":path.endsWith(".css")?"text/css; charset=utf-8":"text/html; charset=utf-8");
            ex.sendResponseHeaders(200,data.length);try(OutputStream o=ex.getResponseBody()){o.write(data);}
        } catch(ApiException e){send(ex,e.status,Map.of("error",e.getMessage(),"mode",LIVE?"LIVE":"DEMO"));}
          catch(Exception e){System.err.println("Request failed: "+e.getClass().getSimpleName());send(ex,500,Map.of("error","Analysis service failed. Check your local server log.","mode",LIVE?"LIVE":"DEMO"));}
    }
    static boolean authorized(HttpExchange ex) throws IOException {
        String password=System.getenv().getOrDefault("MARKETPULSE_ACCESS_PASSWORD","");
        if (password.isBlank()) return true;
        String h=ex.getRequestHeaders().getFirst("Authorization");
        boolean ok=false;
        if (h!=null && h.startsWith("Basic ")) {
            try {
                String plain=new String(Base64.getDecoder().decode(h.substring(6)),StandardCharsets.UTF_8);
                byte[] provided=plain.getBytes(StandardCharsets.UTF_8);
                byte[] expected=("marketpulse:"+password).getBytes(StandardCharsets.UTF_8);
                ok=java.security.MessageDigest.isEqual(provided,expected);
            }catch(IllegalArgumentException ignored){}
        }
        if (!ok) {
            ex.getResponseHeaders().set("WWW-Authenticate","Basic realm=\"MarketPulse Private\"");
            send(ex,401,map("error","Authentication required."));
        }
        return ok;
    }
    static void send(HttpExchange ex,int code,Object obj) throws IOException {
        byte[] b=Json.stringify(obj).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type","application/json; charset=utf-8");
        // Health probes and other HEAD requests must not send a response body.
        // Writing one makes the JDK HttpServer emit warnings and may throw IOException.
        if ("HEAD".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(code,-1);
            ex.close();
            return;
        }
        ex.sendResponseHeaders(code,b.length);
        try(OutputStream o=ex.getResponseBody()){o.write(b);}
    }
    static Map<String,String> params(String s){Map<String,String> m=new HashMap<>();if(s==null)return m;for(String part:s.split("&")){String[] p=part.split("=",2);m.put(URLDecoder.decode(p[0],StandardCharsets.UTF_8),p.length>1?URLDecoder.decode(p[1],StandardCharsets.UTF_8):"");}return m;}
    static String exch(Map<String,String> q){String x=q.getOrDefault("exchange","NSE").toUpperCase(Locale.ROOT);if(!x.equals("NSE")&&!x.equals("BSE"))throw new ApiException(400,"Exchange must be NSE or BSE");return x;}
    static String underlying(Map<String,String> q){String x=q.getOrDefault("underlying","NIFTY").toUpperCase(Locale.ROOT);if(!List.of("NIFTY","BANKNIFTY","FINNIFTY","SENSEX").contains(x))throw new ApiException(400,"Unsupported underlying");return x;}
    static String expiry(Map<String,String> q){String s=q.getOrDefault("expiry","");try{LocalDate d=LocalDate.parse(s);if(d.isBefore(LocalDate.now(IST).minusDays(5))||d.isAfter(LocalDate.now(IST).plusYears(2)))throw new Exception();}catch(Exception e){throw new ApiException(400,"Enter a valid current/future expiry YYYY-MM-DD");}return s;}
    static double strike(Map<String,String> q){try{double n=Double.parseDouble(q.getOrDefault("strike",""));if(!Double.isFinite(n)||n<100||n>1000000||n!=Math.rint(n))throw new Exception();return n;}catch(Exception e){throw new ApiException(400,"Choose a valid strike");}}
    static String type(Map<String,String> q){String s=q.getOrDefault("type","CE").toUpperCase(Locale.ROOT);if(!s.equals("CE")&&!s.equals("PE"))throw new ApiException(400,"Option type must be CE or PE");return s;}
    static int chartInterval(Map<String,String> q){
        String value=q.getOrDefault("interval","5");
        if(!List.of("1","3","5","15","30","60").contains(value))throw new ApiException(400,"Choose a 1, 3, 5, 15, 30, or 60 minute chart timeframe.");
        return Integer.parseInt(value);
    }
    static Map<String,Object> chart(String ex,String und,String exp,double strike,String type,int minutes){
        if(UPSTOX)return UpstoxAdapter.chart(ex,und,exp,strike,type,minutes);
        // Demo remains explicitly synthetic and does not produce fake exchange timestamps.
        Map<String,Object> a=analyze(ex,und,exp,strike,type);
        List<Object> raw=asList(a.get("candles"));
        List<Map<String,Object>> candles=new ArrayList<>();
        List<Map<String,Object>> old=new ArrayList<>();
        for(Object o:raw)old.add(asMap(o));
        if(minutes==15){
            for(int i=0;i+2<old.size();i+=3){
                Map<String,Object> f=old.get(i),l=old.get(i+2);
                double high=0,low=Double.MAX_VALUE,vol=0;
                for(int j=i;j<i+3;j++){Map<String,Object> v=old.get(j);high=Math.max(high,num(v.get("high")));low=Math.min(low,num(v.get("low")));vol+=num(v.get("volume"));}
                candles.add(map("time",f.get("time"),"open",f.get("open"),"high",high,"low",low,"close",l.get("close"),"volume",vol));
            }
        }else if(minutes==5) candles.addAll(old);
        else {
            // Clearly labelled *synthetic* finer-interval candles for chart UI demonstration only.
            Random r=new Random((long)strike*31+type.hashCode()+minutes*97);
            int count=Math.min(120,old.size()*5/minutes);
            double price=Math.max(.5,num(a.get("premium"))*.93);
            ZonedDateTime start=ZonedDateTime.now(IST).withHour(9).withMinute(15).withSecond(0).withNano(0);
            for(int i=0;i<count;i++){
                double open=price,close=Math.max(.05,open+(r.nextDouble()-.48)*Math.max(.1,open*.006));
                double high=Math.max(open,close)+r.nextDouble()*Math.max(.05,open*.002);
                double low=Math.max(.02,Math.min(open,close)-r.nextDouble()*Math.max(.05,open*.002));
                candles.add(map("time",start.plusMinutes((long)i*minutes).toOffsetDateTime().toString(),"open",round(open),"high",round(high),"low",round(low),"close",round(close),"volume",100+r.nextInt(2500)));
                price=close;
            }
        }
        return map("mode","DEMO","provider","Synthetic demo","source","SYNTHETIC CHART DATA",
            "exchange",ex,"underlying",und,"expiry",exp,"strike",strike,"type",type,"intervalMinutes",minutes,
            "candles",candles,"ltp",num(a.get("premium")),"lastTradeTime","","quoteAgeSeconds",-1,
            "quoteFresh",false,"marketOpen",normalHours(),"polledAt",Instant.now().toString(),"pollSeconds",12,
            "notice","All chart candles and quotes are generated examples, NOT market data.");
    }
    static Map<String,Object> status(){ZonedDateTime t=ZonedDateTime.now(IST);return map("mode",LIVE?"LIVE":"DEMO","provider",PROVIDER,"asOf",t.toString(),"normalSession",normalHours(),"ordersEnabled",false,"accessTokenPresent",LIVE,"upstoxTokenConfigured",UPSTOX,"refreshSeconds",12,"connectionStatus",UPSTOX?"Analytics Token configured server-side; actual quote access must be verified":"PUBLIC / LOCAL DEMO: no Upstox Analytics Token configured on this server","riskNote","Analysis and paper trading only. No accuracy guarantee.","copilotCloudAvailable",PulseCopilot.cloudEnabled());}
    static boolean normalHours(){ZonedDateTime now=ZonedDateTime.now(IST);int day=now.getDayOfWeek().getValue();LocalTime t=now.toLocalTime();return day<=5&&!t.isBefore(LocalTime.of(9,15))&&t.isBefore(LocalTime.of(15,30));}
    static Map<String,Object> expiries(String exchange,String underlying){
        if(UPSTOX)return UpstoxAdapter.expiries(exchange,underlying);
        if(!LIVE){List<String> e=new ArrayList<>();LocalDate d=LocalDate.now(IST);while(e.size()<5){d=d.plusDays(1);if(d.getDayOfWeek()==DayOfWeek.TUESDAY)e.add(d.toString());}return map("mode","DEMO","expiries",e,"warning","Example Tuesdays only; these are not verified exchange-listed expiries.");}
        Object obj=get("/v1/historical/expiries",Map.of("exchange",exchange,"underlying_symbol",underlying,"year",String.valueOf(LocalDate.now(IST).getYear())),60_000);
        Map<String,Object> p=asMap(obj);List<Object> raw=asList(p.get("expiries"));List<String> e=raw.stream().map(String::valueOf).filter(s->{try{return !LocalDate.parse(s).isBefore(LocalDate.now(IST));}catch(Exception x){return false;}}).limit(70).toList();
        return map("mode","LIVE","expiries",e,"warning","Verify expiry availability against the live option chain; you may enter an expiry manually.");
    }
    static Object get(String path,Map<String,String> params,long ttlMs){
        String query=params.entrySet().stream().sorted(Map.Entry.comparingByKey()).map(e->enc(e.getKey())+"="+enc(e.getValue())).collect(Collectors.joining("&"));String suffix=query.isBlank()?"":"?"+query;
        String key=path+suffix;Cache c=CACHE.get(key);long now=System.currentTimeMillis();if(c!=null&&c.until>now)return c.value;
        synchronized(CACHE){c=CACHE.get(key);now=System.currentTimeMillis();if(c!=null&&c.until>now)return c.value;
            try{
                HttpRequest req=HttpRequest.newBuilder(URI.create(BASE+key)).timeout(Duration.ofSeconds(12)).header("Authorization","Bearer "+TOKEN).header("X-API-VERSION","1.0").header("Accept","application/json").GET().build();
                HttpResponse<String> response=HTTP.send(req,HttpResponse.BodyHandlers.ofString());
                if(response.statusCode()==401||response.statusCode()==403)throw new ApiException(502,"Groww denied the request. Check your token and paid market-data access.");
                if(response.statusCode()==429)throw new ApiException(503,"Groww rate limit reached; allow the API to recover.");
                if(response.statusCode()!=200)throw new ApiException(502,"Groww returned HTTP "+response.statusCode()+"; verify the contract and data plan.");
                Map<String,Object> root=asMap(Json.parse(response.body()));
                if(!"SUCCESS".equals(root.get("status")))throw new ApiException(502,"Groww reported a failed request. Check expiry, symbol, and entitlement.");
                Object value=root.get("payload");if(value==null)throw new ApiException(502,"No payload received from Groww.");
                CACHE.put(key,new Cache(System.currentTimeMillis()+ttlMs,value));return value;
            }catch(ApiException e){throw e;}catch(IOException e){throw new ApiException(503,"Cannot reach Groww; check your network.");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new ApiException(503,"Groww call interrupted.");}catch(RuntimeException e){throw new ApiException(502,"Unrecognized Groww response. Check current API documentation.");}
        }
    }
    static String enc(String s){return URLEncoder.encode(s,StandardCharsets.UTF_8);}
    static Map<String,Object> chain(String exchange,String underlying,String expiry){
        if(UPSTOX)return UpstoxAdapter.chain(exchange,underlying,expiry);
        if(!LIVE)return demoChain(exchange,underlying,expiry);
        Map<String,Object> payload=asMap(get("/v1/option-chain/exchange/"+exchange+"/underlying/"+underlying,Map.of("expiry_date",expiry),12_000));
        double spot=num(payload.get("underlying_ltp"));Map<String,Object> strikes=asMap(payload.get("strikes"));
        List<Map<String,Object>> rows=new ArrayList<>();
        for(Map.Entry<String,Object> ent:strikes.entrySet()){
            double k;try{k=Double.parseDouble(ent.getKey());}catch(Exception e){continue;}
            Map<String,Object> p=asMap(ent.getValue());
            rows.add(map("strike",k,"CE",chainLeg(p.get("CE")),"PE",chainLeg(p.get("PE"))));
        }
        rows.sort(Comparator.comparingDouble(o->num(o.get("strike"))));
        return map("mode","LIVE","exchange",exchange,"underlying",underlying,"expiry",expiry,"underlyingLtp",spot,"rows",rows,"asOf",ZonedDateTime.now(IST).toString(),"warning","Real exchange snapshots: displayed depth is resting orders, not executed money flow.");
    }
    static Map<String,Object> chainLeg(Object o){Map<String,Object> m=asMap(o);Map<String,Object> g=asMap(m.get("greeks"));return map("symbol",str(m.get("trading_symbol")),"ltp",num(m.get("ltp")),"oi",num(m.get("open_interest")),"volume",num(m.get("volume")),"iv",num(g.get("iv")),"delta",num(g.get("delta")),"theta",num(g.get("theta")));}
    static Map<String,Object> demoChain(String ex,String und,String expiry){
        // Rounded scenario anchors ONLY; not current exchange index quotes.
        double spot=und.equals("SENSEX")?82000:und.equals("BANKNIFTY")?58000:25480;
        double step=und.equals("NIFTY")?50:100;List<Map<String,Object>> rows=new ArrayList<>();double at=Math.round(spot/step)*step;
        for(int i=-12;i<=12;i++){double k=at+i*step;rows.add(map("strike",k,"CE",demoLeg(spot,k,"CE",und),"PE",demoLeg(spot,k,"PE",und)));}
        return map("mode","DEMO","exchange",ex,"underlying",und,"expiry",expiry,"underlyingLtp",spot,"rows",rows,"asOf",ZonedDateTime.now(IST).toString(),
            "referenceSpotIsSynthetic",true,"warning","SYNTHETIC DEMO: index spot, expiries, premiums, call/put OI, volume and IV are illustrative, NOT exchange quotes. Match the exact expiry and instrument before comparing broker prices.");
    }
    static Map<String,Object> demoLeg(double spot,double strike,String type,String und){
        double intrinsic=type.equals("CE")?Math.max(0,spot-strike):Math.max(0,strike-spot);
        double atmDist=Math.abs(spot-strike)/spot;
        double timeValue=(und.equals("SENSEX")?180:110)*Math.exp(-atmDist*35);
        double ltp=Math.max(1.5,intrinsic+timeValue);
        // CE and PE interest/volume should not be identical clones in the demo.
        double step=und.equals("NIFTY")?50:100;
        double peak=type.equals("CE")?spot+2*step:spot-2*step;
        double oi=14000+Math.round(44000*Math.exp(-Math.abs(strike-peak)/spot*32))+
            (type.equals("CE")?1200:3100)+(Math.round(strike)%17)*107;
        double vol=2500+Math.round(17500*Math.exp(-atmDist*26))+(type.equals("CE")?700:1700);
        return map("symbol",und+"-DEMO-"+(int)strike+type,"ltp",round(ltp),"oi",oi,"volume",vol,"iv",14+atmDist*100,"delta",type.equals("CE")?0.53:-0.47,"theta",-5.2);
    }
    static Map<String,Object> analyze(String ex,String und,String exp,double strike,String type){
        if(UPSTOX)return UpstoxAdapter.analyze(ex,und,exp,strike,type);
        Map<String,Object> ch=chain(ex,und,exp);double spot=num(ch.get("underlyingLtp"));
        Map<String,Object> leg=new LinkedHashMap<>();boolean found=false;
        for(Object o:asList(ch.get("rows"))){Map<String,Object> row=asMap(o);if(Math.abs(num(row.get("strike"))-strike)<0.01){leg=asMap(row.get(type));found=true;break;}}
        if(!found||str(leg.get("symbol")).isBlank())throw new ApiException(404,"Strike/type not available on this expiry");
        String symbol=str(leg.get("symbol"));List<Bar> bars,idx;Map<String,Object> quote;
        if(LIVE){
            quote=asMap(get("/v1/live-data/quote",Map.of("exchange",ex,"segment","FNO","trading_symbol",symbol),10_000));
            String growwSymbol=ex+"-"+und+"-"+LocalDate.parse(exp).format(DateTimeFormatter.ofPattern("ddMMMyy",Locale.ENGLISH))+"-"+(int)strike+"-"+type;
            bars=history(ex,"FNO",growwSymbol);
            idx=history(ex,"CASH",ex+"-"+und);
        }else{
            quote=demoQuote(num(leg.get("ltp")),num(leg.get("oi")),num(leg.get("volume")),symbol);
            bars=demoBars(num(leg.get("ltp")),symbol,false,type);
            idx=demoBars(spot,und,true,type);
        }
        return signal(ex,und,exp,strike,type,symbol,spot,leg,quote,bars,idx);
    }
    static List<Bar> history(String ex,String segment,String growwSymbol){LocalDateTime to=LocalDateTime.now(IST);LocalDateTime from=to.minusDays(6);Map<String,String> q=Map.of("exchange",ex,"segment",segment,"groww_symbol",growwSymbol,"start_time",from.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),"end_time",to.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),"candle_interval","5minute");
        Map<String,Object> p=asMap(get("/v1/historical/candles",q,45_000));List<Bar> out=new ArrayList<>();for(Object raw:asList(p.get("candles"))){List<Object> r=asList(raw);if(r.size()<6)continue;out.add(new Bar(str(r.get(0)),num(r.get(1)),num(r.get(2)),num(r.get(3)),num(r.get(4)),num(r.get(5)),r.size()>6?num(r.get(6)):0));}return out;}
    static Map<String,Object> demoQuote(double price,double oi,double vol,String symbol){
        double shift=Math.sin(System.currentTimeMillis()/23_000.0+symbol.hashCode()%17)*0.85;double p=Math.max(1,price+shift);List<Object> b=new ArrayList<>(),a=new ArrayList<>();Random r=new Random(symbol.hashCode());double tick=p>100?.1:.05;
        for(int i=0;i<5;i++){b.add(map("price",round(p-.15-i*tick),"quantity",Math.max(20,250+(r.nextInt(400)))));a.add(map("price",round(p+.15+i*tick),"quantity",Math.max(20,210+(r.nextInt(400)))));}
        return map("last_price",round(p),"bid_price",round(p-.15),"offer_price",round(p+.15),"depth",map("buy",b,"sell",a),"volume",vol,"open_interest",oi,"previous_open_interest",oi*.985,"last_trade_time",System.currentTimeMillis());
    }
    static List<Bar> demoBars(double price,String seed,boolean index,String optionType){Random r=new Random(seed.hashCode());List<Bar> b=new ArrayList<>();double v=price*.915;LocalDateTime start=LocalDateTime.now(IST).minusHours(14);for(int i=0;i<145;i++){
        double drift=(index?(optionType.equals("PE")?-.0015:.0015):.0014);double step=(r.nextDouble()-.45)*.008+drift;double o=v;v=Math.max(.7,v*(1+step));double h=Math.max(o,v)*(1+.001+r.nextDouble()*.004),l=Math.min(o,v)*(1-.001-r.nextDouble()*.004);b.add(new Bar(start.plusMinutes(5L*i).toString(),round(o),round(h),round(l),round(v),200+Math.round(r.nextDouble()*1500),0));}
        double factor=price/b.get(b.size()-1).close();List<Bar> scaled=new ArrayList<>();for(Bar x:b)scaled.add(new Bar(x.time(),round(x.open()*factor),round(x.high()*factor),round(x.low()*factor),round(x.close()*factor),x.volume(),0));return scaled;
    }
    static Map<String,Object> signal(String exchange,String und,String expiry,double strike,String type,String symbol,double spot,Map<String,Object> leg,Map<String,Object> quote,List<Bar> bars,List<Bar> index){
        double ltp=num(quote.get("last_price"));if(ltp<=0)ltp=num(leg.get("ltp"));double bid=num(quote.get("bid_price")),ask=num(quote.get("offer_price"));
        Map<String,Object> dep=asMap(quote.get("depth"));List<Object> bu=asList(dep.get("buy")),se=asList(dep.get("sell"));double buyQ=bu.stream().mapToDouble(o->num(asMap(o).get("quantity"))).sum();double sellQ=se.stream().mapToDouble(o->num(asMap(o).get("quantity"))).sum();double imbalance=buyQ+sellQ>0?(buyQ-sellQ)/(buyQ+sellQ):0;double spread=ask>bid&&bid>0?100*(ask-bid)/((ask+bid)/2):999;
        double fast=ema(bars,9),slow=ema(bars,21),rsi=rsi(bars,14),vwap=vwap(bars),atr=atr(bars,14);double iFast=ema(index,9),iSlow=ema(index,21);boolean trend=type.equals("CE")?iFast>iSlow:iFast<iSlow;
        double priorOi=num(quote.get("previous_open_interest")),oi=num(quote.get("open_interest"));if(oi<=0)oi=num(leg.get("oi"));double oiChange=priorOi>0?100*(oi-priorOi)/priorOi:0;
        double lastVol=bars.isEmpty()?0:bars.get(bars.size()-1).volume();double avgVol=bars.size()>21?bars.subList(bars.size()-21,bars.size()-1).stream().mapToDouble(Bar::volume).average().orElse(0):0;double rvol=avgVol>0?lastVol/avgVol:0;
        Map<String,Boolean> checks=new LinkedHashMap<>();checks.put("Underlying trend aligned with "+type,trend);checks.put("Option EMA 9 above EMA 21",fast>slow);checks.put("Option RSI between 52 and 75",rsi>=52&&rsi<=75);checks.put("Premium above VWAP",vwap>0&&ltp>vwap);checks.put("Bid depth pressure > 5%",imbalance>.05);checks.put("Relative volume >= 0.8×",rvol>=.8);checks.put("Spread <= 1.5% and open interest >= 500",spread<=1.5&&oi>=500);
        int passed=(int)checks.values().stream().filter(Boolean::booleanValue).count();int score=(int)Math.round(passed*100.0/checks.size());
        boolean enough=bars.size()>=32&&index.size()>=32&&bid>0&&ask>0&&ltp>0;
        boolean fresh=true;double age=-1;Object ts=quote.get("last_trade_time");if(LIVE){double stamp=num(ts);if(stamp>0){if(stamp<100000000000L)stamp*=1000;age=(System.currentTimeMillis()-stamp)/1000.0;fresh=age>=-30&&age<=120;}else fresh=false;}
        boolean validExpiry=!LocalDate.parse(expiry).isBefore(LocalDate.now(IST));boolean active=normalHours();boolean safe=enough&&fresh&&validExpiry&&spread<=1.5&&oi>=500&&active;
        String action="WAIT";if(safe&&trend&&fast>slow&&passed>=6)action="BUY SETUP";
        else if(safe&&!trend&&fast<slow&&rsi<46)action="EXIT / AVOID";
        List<String> reasons=new ArrayList<>();if(!active)reasons.add("Outside normal NSE/BSE cash trading hours; exchange holidays are not checked.");if(!fresh)reasons.add("Quote trade timestamp is missing or stale; block trading signals.");if(!enough)reasons.add("Insufficient valid quote/depth/history for an actionable signal.");if(spread>1.5)reasons.add("Bid/ask spread is too wide ("+round(spread)+"%).");if(oi<500)reasons.add("Open interest below the example liquidity gate.");if(!validExpiry)reasons.add("Contract expiry is in the past.");if(!trend)reasons.add("Underlying directional trend does not support a long "+type+".");
        if(reasons.isEmpty())reasons.add(action.equals("BUY SETUP")?"All risk gates passed; setup still requires independent validation.":"Signals do not agree strongly enough to enter.");
        double risk=Math.max(Math.max(atr*1.4,ltp*.08),.1),entry=Math.max(0,ask>0?ask:ltp);double stop=Math.max(.05,entry-risk);
        List<Map<String,Object>> candleOutput=new ArrayList<>();for(Bar b:bars.subList(Math.max(0,bars.size()-160),bars.size()))candleOutput.add(map("time",b.time(),"open",b.open(),"high",b.high(),"low",b.low(),"close",b.close(),"volume",b.volume()));
        return map("mode",LIVE?"LIVE":"DEMO","source",LIVE?PROVIDER+" quote/option chain/historical":"Synthetic example only","asOf",ZonedDateTime.now(IST).toString(),"exchange",exchange,"underlying",und,"expiry",expiry,"strike",strike,"type",type,"symbol",symbol,"spot",round(spot),"premium",round(ltp),"bid",round(bid),"ask",round(ask),"spreadPct",round(spread),"oi",oi,"oiChangePct",round(oiChange),"volume",num(quote.get("volume")),"iv",num(leg.get("iv")),"delta",num(leg.get("delta")),"theta",num(leg.get("theta")),"signal",action,"alignmentScore",score,"alignmentNotProbability",true,"checks",checks,"reasons",reasons,"risk",map("entryReference",round(entry),"illustrativeStop",round(stop),"illustrativeTarget1",round(entry+2*risk),"illustrativeTarget2",round(entry+3*risk),"riskPerUnit",round(entry-stop),"note","Illustrative prices only. No orders. Actual fills and stops can slip."),"indicators",map("ema9",round(fast),"ema21",round(slow),"rsi14",round(rsi),"vwap",round(vwap),"atr14",round(atr),"relativeVolume",round(rvol),"underlyingEma9",round(iFast),"underlyingEma21",round(iSlow)),"depth",map("buy",bu,"sell",se,"buyQty",buyQ,"sellQty",sellQ,"imbalance",round(imbalance*100)),"dataQuality",map("enoughHistory",enough,"fresh",fresh,"quoteAgeSeconds",round(age),"withinNormalHours",active,"holidayVerified",false,"liveEntitlementTested",LIVE),"candles",candleOutput,"warning","Depth imbalance is resting liquidity, not executed order flow. Alignment score is NOT win probability.");
    }
    static double ema(List<Bar>b,int n){if(b.isEmpty())return 0;double e=b.get(0).close(),a=2.0/(n+1);for(Bar x:b)e=a*x.close()+(1-a)*e;return e;}
    static double rsi(List<Bar>b,int n){if(b.size()<n+1)return 50;double gain=0,loss=0;int start=b.size()-n;for(int i=start;i<b.size();i++){double d=b.get(i).close()-b.get(i-1).close();gain+=Math.max(0,d);loss+=Math.max(0,-d);}if(loss==0)return gain==0?50:100;return 100-100/(1+gain/loss);}
    static double vwap(List<Bar>b){if(b.isEmpty())return 0;String lastDate=b.get(b.size()-1).time();lastDate=lastDate.length()>9?lastDate.substring(0,10):lastDate;double pv=0,v=0;for(Bar x:b){if(!x.time().startsWith(lastDate))continue;double k=Math.max(0,x.volume());pv+=k*(x.high()+x.low()+x.close())/3;v+=k;}return v>0?pv/v:b.get(b.size()-1).close();}
    static double atr(List<Bar>b,int n){if(b.size()<2)return 0;double sum=0;int count=0;for(int i=Math.max(1,b.size()-n);i<b.size();i++){Bar c=b.get(i),p=b.get(i-1);sum+=Math.max(c.high()-c.low(),Math.max(Math.abs(c.high()-p.close()),Math.abs(c.low()-p.close())));count++;}return count>0?sum/count:0;}
    static double num(Object x){if(x instanceof Number)return ((Number)x).doubleValue();try{return Double.parseDouble(String.valueOf(x));}catch(Exception e){return 0;}}
    static double round(double v){return Double.isFinite(v)?Math.round(v*100.0)/100.0:0;}
    static String str(Object o){return o==null?"":String.valueOf(o);}
    static Map<String,Object> asMap(Object o){if(o instanceof Map<?,?> m){Map<String,Object> r=new LinkedHashMap<>();m.forEach((k,v)->r.put(String.valueOf(k),v));return r;}return new LinkedHashMap<>();}
    static List<Object> asList(Object o){if(o instanceof List<?> l)return new ArrayList<>(l);return new ArrayList<>();}
    static Map<String,Object> map(Object... k){Map<String,Object> m=new LinkedHashMap<>();for(int i=0;i<k.length;i+=2)m.put((String)k[i],k[i+1]);return m;}
    // Small purpose-built JSON reader and writer to keep the runnable Java 21 demo dependency-free.
    static final class Json {
        final String s;int i;Json(String s){this.s=s;}static Object parse(String s){Json p=new Json(s);Object x=p.val();p.ws();if(p.i!=p.s.length())throw new IllegalArgumentException("Trailing JSON");return x;}
        void ws(){while(i<s.length()&&Character.isWhitespace(s.charAt(i)))i++;}
        char ch(){ws();if(i>=s.length())throw new IllegalArgumentException("JSON ended");return s.charAt(i);}
        Object val(){char c=ch();if(c=='{')return obj();if(c=='[')return array();if(c=='"')return string();if(c=='t'){word("true");return true;}if(c=='f'){word("false");return false;}if(c=='n'){word("null");return null;}return number();}
        void word(String w){if(!s.startsWith(w,i))throw new IllegalArgumentException("Invalid JSON literal");i+=w.length();}
        Map<String,Object> obj(){i++;Map<String,Object> m=new LinkedHashMap<>();if(ch()=='}'){i++;return m;}for(;;){if(ch()!='"')throw new IllegalArgumentException("Expected key");String k=string();if(ch()!=':')throw new IllegalArgumentException("Expected colon");i++;m.put(k,val());char c=ch();i++;if(c=='}')return m;if(c!=',')throw new IllegalArgumentException("Expected comma");}}
        List<Object> array(){i++;List<Object> a=new ArrayList<>();if(ch()==']'){i++;return a;}for(;;){a.add(val());char c=ch();i++;if(c==']')return a;if(c!=',')throw new IllegalArgumentException("Expected comma");}}
        String string(){i++;StringBuilder b=new StringBuilder();while(i<s.length()){char c=s.charAt(i++);if(c=='"')return b.toString();if(c=='\\'){if(i>=s.length())throw new IllegalArgumentException("Escape end");char e=s.charAt(i++);if(e=='u'){if(i+4>s.length())throw new IllegalArgumentException("Unicode end");b.append((char)Integer.parseInt(s.substring(i,i+4),16));i+=4;}else b.append(switch(e){case 'n'->'\n';case 'r'->'\r';case 't'->'\t';case 'b'->'\b';case 'f'->'\f';case '\\'->'\\';case '/'->'/';case '"'->'"';default->throw new IllegalArgumentException("Invalid escape");});}else b.append(c);}throw new IllegalArgumentException("Unclosed string");}
        Number number(){int j=i;while(i<s.length()&&"-+0123456789.eE".indexOf(s.charAt(i))>=0)i++;if(j==i)throw new IllegalArgumentException("Invalid number");return Double.parseDouble(s.substring(j,i));}
        static String stringify(Object x){StringBuilder b=new StringBuilder();write(b,x);return b.toString();}
        static void write(StringBuilder b,Object x){if(x==null){b.append("null");return;}if(x instanceof String s){b.append('"');for(char c:s.toCharArray()){switch(c){case '"'->b.append("\\\"");case '\\'->b.append("\\\\");case '\n'->b.append("\\n");case '\r'->b.append("\\r");case '\t'->b.append("\\t");default->{if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}}}b.append('"');return;}if(x instanceof Number n){double d=n.doubleValue();b.append(Double.isFinite(d)?n.toString():"null");return;}if(x instanceof Boolean){b.append(x);return;}if(x instanceof Map<?,?> m){b.append('{');boolean first=true;for(var e:m.entrySet()){if(!first)b.append(',');first=false;write(b,String.valueOf(e.getKey()));b.append(':');write(b,e.getValue());}b.append('}');return;}if(x instanceof Collection<?> c){b.append('[');boolean first=true;for(Object e:c){if(!first)b.append(',');first=false;write(b,e);}b.append(']');return;}write(b,x.toString());}
    }
}
